console.log("[ShutUpReddit] content script loaded");

// Debug mode flag (set to true for verbose logging)
const DEBUG_MODE = false;

// Keep rules in memory
let currentRules = null;

// Refresh rules from storage
function refreshRules() {
  chrome.runtime.sendMessage(
    { type: "GET_RULES" },
    (response) => {
      if (chrome.runtime.lastError) {
        console.error("[ShutUpReddit] Error loading rules:", chrome.runtime.lastError);
      } else if (response.success) {
        currentRules = response.rules;
        console.log("[ShutUpReddit] Loaded rules:", currentRules);
        console.log("[ShutUpReddit] Filtering active?", isFilteringActive());
      } else {
        console.error("[ShutUpReddit] Failed to load rules");
      }
    }
  );
}

// Check if filtering is currently active
function isFilteringActive() {
  if (!currentRules) return false;
  if (!currentRules.enabled) return false;
  if (currentRules.pausedUntil && Date.now() < currentRules.pausedUntil) return false;
  return true;
}

// Normalize text for matching
function normalizeText(str) {
  if (!str || typeof str !== "string") return "";
  return str.toLowerCase().trim();
}

// Check if text matches any keyword (works for title, content, or any text)
function textMatchesAnyKeyword(text, keywords) {
  if (!text || !keywords || !keywords.length) return false;
  const lower = text.toLowerCase();
  return keywords.some(kw => lower.includes(kw.toLowerCase()));
}

// Determine if a post should be hidden and return reason
function shouldHidePost(data) {
  if (!currentRules || !isFilteringActive()) return { hide: false, reason: null };

  const title = data.title || "";
  const content = data.content || "";
  const author = normalizeText(data.author);
  const rules = currentRules;

  // 1) Blocked keywords always win - check based on user configuration
  if (rules.blockedKeywords && rules.blockedKeywords.length) {
    const matchIn = rules.blockedKeywordsMatchIn || { title: true, content: true, author: false };
    let shouldBlock = false;
    
    if (matchIn.title) {
      const titleMatches = textMatchesAnyKeyword(title, rules.blockedKeywords);
      if (titleMatches) shouldBlock = true;
    }
    
    if (matchIn.content) {
      const contentMatches = textMatchesAnyKeyword(content, rules.blockedKeywords);
      if (contentMatches) shouldBlock = true;
    }
    
    if (matchIn.author) {
      const authorMatches = author && textMatchesAnyKeyword(author, rules.blockedKeywords);
      if (authorMatches) shouldBlock = true;
    }
    
    if (shouldBlock) {
      return { hide: true, reason: "blockedKeyword" };
    }
  }

  // 2) Focus mode: if enabled and focusKeywords set, hide if configured fields don't match any
  if (rules.focusModeEnabled && rules.focusKeywords && rules.focusKeywords.length) {
    const matchIn = rules.focusKeywordsMatchIn || { title: true, content: true, author: true };
    let matchesFocus = false;
    
    if (matchIn.title) {
      const titleMatches = textMatchesAnyKeyword(title, rules.focusKeywords);
      if (titleMatches) matchesFocus = true;
    }
    
    if (matchIn.content) {
      const contentMatches = textMatchesAnyKeyword(content, rules.focusKeywords);
      if (contentMatches) matchesFocus = true;
    }
    
    if (matchIn.author) {
      const authorMatches = author && textMatchesAnyKeyword(author, rules.focusKeywords);
      if (authorMatches) matchesFocus = true;
    }
    
    // Post matches focus if ANY of the enabled fields matches
    if (!matchesFocus) {
      return { hide: true, reason: "focusMode" }; // hide everything that isn't "on topic"
    }
  }

  // 3) Subreddit block
  const subreddit = normalizeText(data.subreddit);
  if (Array.isArray(rules.blockedSubreddits) && subreddit) {
    for (const sr of rules.blockedSubreddits) {
      const nSr = normalizeText(sr);
      if (!nSr) continue;
      if (subreddit === nSr) {
        return { hide: true, reason: "blockedSubreddit" };
      }
    }
  }

  // 4) User block (author already normalized above)
  if (Array.isArray(rules.blockedUsers) && author) {
    for (const user of rules.blockedUsers) {
      const nUser = normalizeText(user);
      if (!nUser) continue;
      if (author === nUser) {
        return { hide: true, reason: "blockedUser" };
      }
    }
  }

  // We don't yet have score/age/domain/flair in postData,
  // so leave those for future expansion.

  return { hide: false, reason: null };
}

// Statistics tracking
const STATS_STORAGE_KEY = "rf_stats";

function updateStats(reason) {
  chrome.storage.local.get(STATS_STORAGE_KEY, (result) => {
    const stats = result[STATS_STORAGE_KEY] || {
      totalProcessed: 0,
      totalHidden: 0,
      hiddenByBlockedKeyword: 0,
      hiddenByFocusMode: 0,
      hiddenBySubreddit: 0,
      hiddenByUser: 0,
      shown: 0
    };

    stats.totalProcessed++;

    if (reason) {
      stats.totalHidden++;
      if (reason === "blockedKeyword") stats.hiddenByBlockedKeyword++;
      else if (reason === "focusMode") stats.hiddenByFocusMode++;
      else if (reason === "blockedSubreddit") stats.hiddenBySubreddit++;
      else if (reason === "blockedUser") stats.hiddenByUser++;
    } else {
      stats.shown++;
    }

    chrome.storage.local.set({ [STATS_STORAGE_KEY]: stats });
  });
}


// Post detection and processing
const PROCESSED_ATTR = "data-rf-processed";
const POST_SELECTOR = "shreddit-post, div[data-testid=\"post-container\"], .Post";
const SEARCH_RESULT_SELECTOR = "a[data-testid=\"post-title\"]";

// Check if we're on a Reddit search page
function isSearchPage() {
  return window.location.href.startsWith("https://www.reddit.com/search/");
}

function extractPostData(postEl) {
  const data = {
    title: null,
    content: null,
    subreddit: null,
    author: null
  };

  try {
    // Extract title
    // Prefer faceplate-screen-reader-content
    const srContent = postEl.querySelector("faceplate-screen-reader-content");
    if (srContent && srContent.textContent) {
      const titleText = srContent.textContent.trim();
      if (titleText) {
        data.title = titleText;
      }
    }

    // Fallback to full-post-link anchor
    if (!data.title) {
      const fullLink = postEl.querySelector('a[slot="full-post-link"]');
      if (fullLink && fullLink.textContent) {
        const titleText = fullLink.textContent.trim();
        if (titleText) {
          data.title = titleText;
        }
      }
    }

    // Fallback to older selectors
    if (!data.title) {
      const titleEl = postEl.querySelector('h3, [data-testid="post-title"]');
      if (titleEl && titleEl.textContent) {
        const titleText = titleEl.textContent.trim();
        if (titleText) {
          data.title = titleText;
        }
      }
    }

    // Handle search results: if postEl itself is a search result anchor AND we're on a search page
    if (!data.title && postEl.matches && postEl.matches(SEARCH_RESULT_SELECTOR) && isSearchPage()) {
      // Prefer aria-label, fallback to textContent
      const ariaLabel = postEl.getAttribute("aria-label");
      if (ariaLabel && ariaLabel.trim()) {
        data.title = ariaLabel.trim();
      } else if (postEl.textContent) {
        data.title = postEl.textContent.trim();
      }
      
      // Try to extract subreddit from href if not already found
      if (!data.subreddit && postEl.href) {
        const href = postEl.getAttribute("href") || postEl.href;
        if (href) {
          const match = href.match(/\/r\/([^/]+)\//);
          if (match && match[1]) {
            data.subreddit = match[1].trim();
          }
        }
      }
    }

    // Extract post content/body
    // Try multiple selectors for post content
    const contentSelectors = [
      '[data-testid="post-content"]',
      '[data-click-id="text"]',
      '.Post__body',
      'div[slot="text-body"]',
      'shreddit-post-body',
      'p[data-testid="post-content"]'
    ];

    for (const selector of contentSelectors) {
      const contentEl = postEl.querySelector(selector);
      if (contentEl && contentEl.textContent) {
        const contentText = contentEl.textContent.trim();
        if (contentText && contentText.length > 0) {
          data.content = contentText;
          break;
        }
      }
    }

    // Fallback: try to get any visible text content from the post that's not the title
    if (!data.content) {
      // Get all text nodes, exclude title-related elements
      const titleSelectors = 'h1, h2, h3, [data-testid="post-title"], faceplate-screen-reader-content, a[slot="full-post-link"]';
      const titleElements = postEl.querySelectorAll(titleSelectors);
      const titleTexts = new Set();
      titleElements.forEach(el => {
        if (el.textContent) titleTexts.add(el.textContent.trim().toLowerCase());
      });

      // Find paragraphs or divs with substantial text that aren't titles
      const textElements = postEl.querySelectorAll('p, div[class*="text"], div[class*="content"]');
      for (const el of textElements) {
        const text = el.textContent?.trim();
        if (text && text.length > 20 && !titleTexts.has(text.toLowerCase())) {
          // Check if this element is not a child of a title element
          let isTitleChild = false;
          for (const titleEl of titleElements) {
            if (titleEl.contains(el)) {
              isTitleChild = true;
              break;
            }
          }
          if (!isTitleChild) {
            data.content = text;
            break;
          }
        }
      }
    }

    // Extract subreddit
    // Try attributes on shreddit-post element first
    if (postEl.hasAttribute && postEl.hasAttribute("subreddit-prefixed-name")) {
      const subredditAttr = postEl.getAttribute("subreddit-prefixed-name");
      if (subredditAttr) {
        data.subreddit = subredditAttr.replace(/^r\//i, "").trim() || null;
      }
    }

    if (!data.subreddit && postEl.hasAttribute && postEl.hasAttribute("subreddit-name")) {
      const subredditAttr = postEl.getAttribute("subreddit-name");
      if (subredditAttr) {
        data.subreddit = subredditAttr.trim() || null;
      }
    }

    // Fallback to subreddit link
    if (!data.subreddit) {
      const subredditEl = postEl.querySelector('a[data-click-id="subreddit"], a[href*="/r/"]');
      if (subredditEl) {
        // Try parsing from href first
        const href = subredditEl.getAttribute("href");
        if (href) {
          const match = href.match(/\/r\/([^/]+)/);
          if (match && match[1]) {
            data.subreddit = match[1].trim();
          }
        }
        // Fallback to textContent
        if (!data.subreddit && subredditEl.textContent) {
          const subredditText = subredditEl.textContent.trim();
          data.subreddit = subredditText.replace(/^r\//i, "").trim() || null;
        }
      }
    }

    // Extract author
    // Try attribute on shreddit-post element first
    if (postEl.hasAttribute && postEl.hasAttribute("author")) {
      const authorAttr = postEl.getAttribute("author");
      if (authorAttr) {
        data.author = authorAttr.replace(/^u\//i, "").trim() || null;
      }
    }

    // Fallback to user link
    if (!data.author) {
      const authorEl = postEl.querySelector('a[data-click-id="user"], a[href*="/user/"], a[href*="/u/"]');
      if (authorEl) {
        // Try parsing from href first
        const href = authorEl.getAttribute("href");
        if (href) {
          const match = href.match(/\/(user|u)\/([^/]+)/);
          if (match && match[2]) {
            data.author = match[2].trim();
          }
        }
        // Fallback to textContent
        if (!data.author && authorEl.textContent) {
          const authorText = authorEl.textContent.trim();
          data.author = authorText.replace(/^u\//i, "").trim() || null;
        }
      }
    }
  } catch (error) {
    console.warn("[ShutUpReddit] Error extracting post data:", error);
  }

  return data;
}

function processPostElement(postEl) {
  if (postEl.getAttribute(PROCESSED_ATTR) === "1") return;
  postEl.setAttribute(PROCESSED_ATTR, "1");

  const data = extractPostData(postEl);
  
  // Debug logging for search results (only on search pages)
  const isSearchResult = isSearchPage() && postEl.matches && postEl.matches(SEARCH_RESULT_SELECTOR);
  if (DEBUG_MODE && isSearchResult) {
    console.log("[ShutUpReddit] Search result detected:", data);
  }

  if (!isFilteringActive()) {
    updateStats(null); // Track as shown when filtering is inactive
    return;
  }

  const result = shouldHidePost(data);
  
  // Find the appropriate container to hide
  let containerToHide = postEl;
  if (result.hide) {
    // For search results, find the parent container
    if (isSearchResult) {
      // Try to find a reasonable container (e.g., article, div with specific classes, or parent of parent)
      const container = postEl.closest("article") || 
                       postEl.closest("div[class*='result']") ||
                       postEl.closest("div[class*='post']") ||
                       postEl.closest("div[data-testid*='post']") ||
                       postEl.parentElement?.parentElement ||
                       postEl.parentElement ||
                       postEl;
      containerToHide = container;
    } else {
      // For regular feed posts, try to find existing wrapper
      const wrapper = postEl.closest("shreddit-post") || 
                     postEl.closest('div[data-testid="post-container"]') ||
                     postEl.closest(".Post") ||
                     postEl;
      containerToHide = wrapper;
    }
    
    containerToHide.style.display = "none";
    containerToHide.setAttribute("data-rf-hidden", "1");
    // Mark the original element as processed too
    if (containerToHide !== postEl) {
      containerToHide.setAttribute(PROCESSED_ATTR, "1");
    }
    updateStats(result.reason);
  } else {
    // Ensure visibility is restored
    const containerToShow = postEl.closest("article") || 
                           postEl.closest("div[class*='result']") ||
                           postEl.closest("div[class*='post']") ||
                           postEl.closest("shreddit-post") ||
                           postEl.closest('div[data-testid="post-container"]') ||
                           postEl.closest(".Post") ||
                           postEl;
    containerToShow.style.removeProperty("display");
    containerToShow.removeAttribute("data-rf-hidden");
    updateStats(null);
  }
}

function scanForPosts(root = document) {
  try {
    // Scan for regular feed posts
    const posts = root.querySelectorAll(POST_SELECTOR);
    posts.forEach(processPostElement);
    
    // Only scan for search result posts on search pages
    if (isSearchPage()) {
      const searchResults = root.querySelectorAll(SEARCH_RESULT_SELECTOR);
      searchResults.forEach((result) => {
        // Skip if this search result is inside an already-processed feed post
        const isInsideFeedPost = result.closest(POST_SELECTOR);
        if (!isInsideFeedPost) {
          processPostElement(result);
        }
      });
      
      if (root === document) {
        const totalPosts = posts.length + (searchResults.length - Array.from(searchResults).filter(r => r.closest(POST_SELECTOR)).length);
        console.log("[ShutUpReddit] Initial scan found", posts.length, "feed posts and", totalPosts - posts.length, "search results");
      }
    } else {
      if (root === document) {
        console.log("[ShutUpReddit] Initial scan found", posts.length, "posts");
      }
    }
  } catch (error) {
    console.warn("[ShutUpReddit] Error scanning for posts:", error);
  }
}

// Re-apply filtering to all posts on the page
function reapplyFiltering() {
  if (!document.body) {
    console.warn("[ShutUpReddit] Cannot reapply filtering: DOM not ready");
    return;
  }
  
  try {
    // Clear processed markers from all posts (both feed posts and search results)
    const processedPosts = document.querySelectorAll(`[${PROCESSED_ATTR}="1"]`);
    processedPosts.forEach((post) => {
      post.removeAttribute(PROCESSED_ATTR);
    });
    
    // Clear hidden markers and restore visibility for all previously hidden containers
    const hiddenContainers = document.querySelectorAll(`[data-rf-hidden="1"]`);
    hiddenContainers.forEach((container) => {
      container.style.removeProperty("display");
      container.removeAttribute("data-rf-hidden");
    });
    
    console.log("[ShutUpReddit] Re-filtering triggered due to rule change");
    
    // Re-scan all posts with updated rules (includes both feed posts and search results)
    scanForPosts(document);
  } catch (error) {
    console.warn("[ShutUpReddit] Error re-applying filtering:", error);
  }
}

function setupObserver() {
  const feedRoot = document.body;
  if (!feedRoot) {
    console.warn("[ShutUpReddit] No document.body yet");
    return;
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (!(node instanceof HTMLElement)) return;

        try {
          // Check if it's a feed post
          if (node.matches && node.matches(POST_SELECTOR)) {
            processPostElement(node);
          }
          // Check if it's a search result anchor (only on search pages)
          else if (isSearchPage() && node.matches && node.matches(SEARCH_RESULT_SELECTOR)) {
            // Only process if not inside an already-processed feed post
            const isInsideFeedPost = node.closest(POST_SELECTOR);
            if (!isInsideFeedPost) {
              processPostElement(node);
            }
          }
          // Otherwise scan the subtree
          else {
            scanForPosts(node);
          }
        } catch (error) {
          // Silently handle errors during observation
        }
      });
    }
  });

  observer.observe(feedRoot, { childList: true, subtree: true });

  // Initial scan
  scanForPosts(document);
}

// Initialize
refreshRules();

// Listen for rule changes in storage
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  
  // Check if rules changed
  if (changes.rf_rules) {
    const newRules = changes.rf_rules.newValue;
    if (newRules && typeof newRules === "object") {
      currentRules = newRules;
      console.log("[ShutUpReddit] Rules updated from storage:", currentRules);
      console.log("[ShutUpReddit] Filtering active?", isFilteringActive());
      
      // Re-apply filtering with new rules
      reapplyFiltering();
    }
  }
});

// Setup observer once DOM is ready
if (document.body) {
  setupObserver();
} else {
  // Wait for DOM to be ready
  const checkBody = setInterval(() => {
    if (document.body) {
      clearInterval(checkBody);
      setupObserver();
    }
  }, 100);
}

