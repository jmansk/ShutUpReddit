console.log("[ShutUpReddit] background service worker started");

// Rules data model
const DEFAULT_RULES = {
  enabled: true,          // global on/off

  blockedKeywords: [],    // strings, matched against title and content
  blockedKeywordsMatchIn: {       // where to match blocked keywords
    title: true,
    content: true,
    author: false
  },
  blockedDomains: [],     // e.g. ["tiktok.com", "youtube.com"]
  blockedUsers: [],       // Reddit usernames
  blockedSubreddits: [],  // subreddit names without "r/"
  blockedFlairs: [],      // flair text

  minScore: null,         // number or null; hide if score < minScore
  maxAgeHours: null,      // number or null; hide if older than this

  dedupe: {
    enabled: true,
    keepSeenTitlesCount: 500
  },

  // future fields, keep them in the object for forward compatibility
  pausedUntil: null,       // timestamp (ms since epoch) or null

  // Focus mode
  focusKeywords: [],        // only-show keywords
  focusModeEnabled: false,  // master toggle
  focusKeywordsMatchIn: {   // where to match focus keywords
    title: true,
    content: true,
    author: true
  }
};

// Storage helpers
const RULES_STORAGE_KEY = "rf_rules";

function getDefaultRules() {
  return JSON.parse(JSON.stringify(DEFAULT_RULES));
}

function loadRules() {
  return new Promise((resolve) => {
    chrome.storage.local.get(RULES_STORAGE_KEY, (result) => {
      const stored = result[RULES_STORAGE_KEY];
      if (stored && typeof stored === "object") {
        resolve({ ...getDefaultRules(), ...stored });
      } else {
        resolve(getDefaultRules());
      }
    });
  });
}

function saveRules(rules) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [RULES_STORAGE_KEY]: rules }, () => {
      resolve();
    });
  });
}

// Initialize rules on startup
loadRules().then((rules) => {
  // loadRules() already handles the case when rules don't exist by returning defaults
  // No need for additional storage check here
});

// Listen for messages from content scripts and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("[ShutUpReddit] Received message:", message);

  // Existing PING handlers
  if (message.type === "PING_FROM_CONTENT") {
    sendResponse({ type: "PONG_FROM_BACKGROUND" });
    return true;
  }

  if (message.type === "PING_FROM_POPUP") {
    sendResponse({ type: "PONG_FROM_BACKGROUND", message: "Background worker is alive!" });
    return true;
  }

  // GET_RULES
  if (message.type === "GET_RULES") {
    loadRules().then((rules) => {
      sendResponse({ success: true, rules });
    });
    return true; // Keep channel open for async
  }

  // SAVE_RULES
  if (message.type === "SAVE_RULES") {
    if (message.rules && typeof message.rules === "object") {
      saveRules(message.rules).then(() => {
        sendResponse({ success: true });
      });
    } else {
      sendResponse({ success: false, error: "Invalid rules object" });
    }
    return true;
  }

  // RESET_RULES
  if (message.type === "RESET_RULES") {
    const defaultRules = getDefaultRules();
    saveRules(defaultRules).then(() => {
      sendResponse({ success: true, rules: defaultRules });
    });
    return true;
  }

  // SET_ENABLED
  if (message.type === "SET_ENABLED") {
    if (typeof message.enabled === "boolean") {
      loadRules().then((rules) => {
        rules.enabled = message.enabled;
        return saveRules(rules).then(() => rules);
      }).then((updatedRules) => {
        sendResponse({ success: true, rules: updatedRules });
      });
    } else {
      sendResponse({ success: false, error: "Invalid enabled value" });
    }
    return true;
  }

  // PAUSE_FOR_30_MINUTES
  if (message.type === "PAUSE_FOR_30_MINUTES") {
    loadRules().then((rules) => {
      rules.pausedUntil = Date.now() + 30 * 60 * 1000;
      return saveRules(rules).then(() => rules);
    }).then((updatedRules) => {
      sendResponse({ success: true, rules: updatedRules });
    });
    return true;
  }

  // ADD_RULE
  if (message.type === "ADD_RULE") {
    const validRuleTypes = [
      "blockedKeywords",
      "blockedDomains",
      "blockedUsers",
      "blockedSubreddits",
      "blockedFlairs",
      "focusKeywords"
    ];

    if (!validRuleTypes.includes(message.ruleType)) {
      sendResponse({ success: false, error: "Invalid rule type" });
      return true;
    }

    if (!message.value || typeof message.value !== "string") {
      sendResponse({ success: false, error: "Invalid value" });
      return true;
    }

    loadRules().then((rules) => {
      const array = rules[message.ruleType];
      if (!array.includes(message.value)) {
        array.push(message.value);
      }
      return saveRules(rules).then(() => rules);
    }).then((updatedRules) => {
      sendResponse({ success: true, rules: updatedRules });
    });
    return true;
  }

  // GET_STATS
  if (message.type === "GET_STATS") {
    chrome.storage.local.get("rf_stats", (result) => {
      const stats = result.rf_stats || {
        totalProcessed: 0,
        totalHidden: 0,
        hiddenByBlockedKeyword: 0,
        hiddenByFocusMode: 0,
        hiddenBySubreddit: 0,
        hiddenByUser: 0,
        shown: 0
      };
      sendResponse({ success: true, stats });
    });
    return true;
  }

  // RESET_STATS
  if (message.type === "RESET_STATS") {
    const defaultStats = {
      totalProcessed: 0,
      totalHidden: 0,
      hiddenByBlockedKeyword: 0,
      hiddenByFocusMode: 0,
      hiddenBySubreddit: 0,
      hiddenByUser: 0,
      shown: 0
    };
    chrome.storage.local.set({ rf_stats: defaultStats }, () => {
      sendResponse({ success: true, stats: defaultStats });
    });
    return true;
  }
});

