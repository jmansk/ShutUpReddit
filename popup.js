console.log("[ShutUpReddit] popup loaded");

let currentRules = null;
let currentStats = null;

// --- Helpers to talk to background ---

function loadRules(callback) {
  chrome.runtime.sendMessage({ type: "GET_RULES" }, (response) => {
    if (chrome.runtime.lastError) {
      console.error("[ShutUpReddit] Error loading rules:", chrome.runtime.lastError);
      callback && callback(null);
      return;
    }
    if (!response || !response.success) {
      console.error("[ShutUpReddit] Failed to load rules");
      callback && callback(null);
      return;
    }
    currentRules = response.rules;
    callback && callback(currentRules);
  });
}

function saveRules(updatedRules, callback) {
  chrome.runtime.sendMessage(
    { type: "SAVE_RULES", rules: updatedRules },
    (response) => {
      if (chrome.runtime.lastError) {
        console.error("[ShutUpReddit] Error saving rules:", chrome.runtime.lastError);
        callback && callback(false);
        return;
      }
      if (!response || !response.success) {
        console.error("[ShutUpReddit] Failed to save rules");
        callback && callback(false);
        return;
      }
      console.log("[ShutUpReddit] Rules saved");
      currentRules = updatedRules;
      callback && callback(true);
    }
  );
}

function loadStats(callback) {
  chrome.runtime.sendMessage({ type: "GET_STATS" }, (response) => {
    if (chrome.runtime.lastError) {
      console.error("[ShutUpReddit] Error loading stats:", chrome.runtime.lastError);
      callback && callback(null);
      return;
    }
    if (!response || !response.success) {
      console.error("[ShutUpReddit] Failed to load stats");
      callback && callback(null);
      return;
    }
    currentStats = response.stats;
    callback && callback(response.stats);
  });
}

// --- UI rendering ---

function updateStatusBanner() {
  const banner = document.getElementById("status-banner");
  if (!banner || !currentRules) return;

  const now = Date.now();
  const pausedUntil = currentRules.pausedUntil || 0;
  const enabled = !!currentRules.enabled;

  banner.className = "";
  if (pausedUntil && now < pausedUntil) {
    const untilDate = new Date(pausedUntil);
    banner.textContent = `Extension is PAUSED until ${untilDate.toLocaleTimeString()}`;
    banner.classList.add("paused");
  } else if (enabled) {
    banner.textContent = "Extension is ENABLED";
    banner.classList.add("enabled");
  } else {
    banner.textContent = "Extension is DISABLED";
    banner.classList.add("disabled");
  }
}

function updateHiddenBadge() {
  const badge = document.getElementById("hidden-badge");
  if (!badge || !currentStats) return;
  badge.textContent = `Hidden: ${currentStats.totalHidden || 0}`;
}

function updateSummaryChips() {
  const chipsEl = document.getElementById("summary-chips");
  if (!chipsEl || !currentRules) return;

  const {
    blockedKeywords = [],
    blockedDomains = [],
    blockedUsers = [],
    blockedSubreddits = [],
    blockedFlairs = [],
    focusKeywords = []
  } = currentRules;

  const chips = [];
  
  if (blockedKeywords.length > 0) {
    chips.push(`<span class="chip"><strong>Keywords:</strong> ${blockedKeywords.length}</span>`);
  }
  if (blockedDomains.length > 0) {
    chips.push(`<span class="chip"><strong>Domains:</strong> ${blockedDomains.length}</span>`);
  }
  if (blockedUsers.length > 0) {
    chips.push(`<span class="chip"><strong>Users:</strong> ${blockedUsers.length}</span>`);
  }
  if (blockedSubreddits.length > 0) {
    chips.push(`<span class="chip"><strong>Subs:</strong> ${blockedSubreddits.length}</span>`);
  }
  if (blockedFlairs.length > 0) {
    chips.push(`<span class="chip"><strong>Flairs:</strong> ${blockedFlairs.length}</span>`);
  }
  if (focusKeywords.length > 0) {
    chips.push(`<span class="chip"><strong>Focus:</strong> ${focusKeywords.length}</span>`);
  }

  if (chips.length === 0) {
    chipsEl.innerHTML = '<span class="chip" style="opacity: 0.6;">No rules configured</span>';
  } else {
    chipsEl.innerHTML = chips.join("");
  }
}

function updateRuleCounts() {
  if (!currentRules) return;

  const blockedCount = (currentRules.blockedKeywords || []).length;
  const focusCount = (currentRules.focusKeywords || []).length;

  const blockedCountEl = document.getElementById("blocked-keywords-count");
  if (blockedCountEl) {
    blockedCountEl.textContent = `(${blockedCount})`;
  }

  const focusCountEl = document.getElementById("focus-keywords-count");
  if (focusCountEl) {
    focusCountEl.textContent = `(${focusCount})`;
  }
}

function updateStatsUI(stats) {
  if (!stats) return;
  currentStats = stats;

  const setStat = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value || 0;
  };

  setStat("stat-total-processed", stats.totalProcessed);
  setStat("stat-total-hidden", stats.totalHidden);
  setStat("stat-shown", stats.shown);
  setStat("stat-blocked-keyword", stats.hiddenByBlockedKeyword);
  setStat("stat-focus-mode", stats.hiddenByFocusMode);
  setStat("stat-blocked-subreddit", stats.hiddenBySubreddit);
  setStat("stat-blocked-user", stats.hiddenByUser);

  updateHiddenBadge();
}

function renderKeywordList() {
  const listEl = document.getElementById("keyword-list");
  if (!listEl || !currentRules) return;

  const keywords = currentRules.blockedKeywords || [];
  listEl.innerHTML = "";

  if (!keywords.length) {
    const li = document.createElement("li");
    li.textContent = "No keywords blocked yet.";
    li.style.opacity = "0.6";
    listEl.appendChild(li);
    return;
  }

  keywords.forEach((kw) => {
    const li = document.createElement("li");
    li.style.display = "flex";
    li.style.justifyContent = "space-between";
    li.style.alignItems = "center";
    li.style.gap = "8px";

    const label = document.createElement("span");
    label.textContent = kw;

    const btn = document.createElement("button");
    btn.textContent = "✕";
    btn.title = "Remove keyword";
    btn.addEventListener("click", () => {
      removeKeyword(kw);
    });

    li.appendChild(label);
    li.appendChild(btn);
    listEl.appendChild(li);
  });

  updateRuleCounts();
}

function renderFocusKeywordList() {
  const listEl = document.getElementById("focusKeywordList");
  if (!listEl || !currentRules) return;

  const keywords = currentRules.focusKeywords || [];
  listEl.innerHTML = "";

  keywords.forEach((kw, index) => {
    const pill = document.createElement("div");
    pill.className = "pill";
    pill.textContent = kw;

    const btn = document.createElement("button");
    btn.className = "pill-remove";
    btn.textContent = "✕";
    btn.addEventListener("click", () => {
      const updated = { ...currentRules };
      updated.focusKeywords = updated.focusKeywords.filter((k, i) => i !== index);
      saveRules(updated, (ok) => {
        if (ok) {
          renderFocusKeywordList();
          updateRuleCounts();
          updateSummaryChips();
        }
      });
    });

    pill.appendChild(btn);
    listEl.appendChild(pill);
  });

  updateRuleCounts();
}

// --- Keyword edit actions ---

function addKeywordFromInput() {
  const inputEl = document.getElementById("keyword-input");
  if (!inputEl || !currentRules) return;

  let value = inputEl.value.trim();
  if (!value) return;

  value = value.toLowerCase();

  const keywords = currentRules.blockedKeywords || [];
  if (keywords.includes(value)) {
    inputEl.value = "";
    return;
  }

  const updated = { ...currentRules, blockedKeywords: [...keywords, value] };

  saveRules(updated, (ok) => {
    if (!ok) return;
    inputEl.value = "";
    renderKeywordList();
    updateSummaryChips();
  });
}

function removeKeyword(kw) {
  if (!currentRules) return;

  const keywords = currentRules.blockedKeywords || [];
  const filtered = keywords.filter((k) => k !== kw);
  const updated = { ...currentRules, blockedKeywords: filtered };

  saveRules(updated, (ok) => {
    if (!ok) return;
    renderKeywordList();
    updateSummaryChips();
  });
}

// --- Controls wiring ---

function wireControls() {
  const enabledToggle = document.getElementById("enabled-toggle");
  const pauseBtn = document.getElementById("pause-btn");
  const addKeywordBtn = document.getElementById("add-keyword-btn");
  const keywordInput = document.getElementById("keyword-input");
  const focusModeToggle = document.getElementById("focusModeToggle");
  const addFocusKeywordBtn = document.getElementById("addFocusKeywordBtn");
  const focusKeywordInput = document.getElementById("focusKeywordInput");
  const pingBtn = document.getElementById("ping-btn");
  const pingStatus = document.getElementById("ping-status");
  const resetStatsBtn = document.getElementById("reset-stats-btn");
  const resetFiltersBtn = document.getElementById("reset-filters-btn");
  const viewStoredFiltersBtn = document.getElementById("view-stored-filters-btn");
  const storedFiltersDisplay = document.getElementById("stored-filters-display");
  const blockedMatchTitle = document.getElementById("blocked-match-title");
  const blockedMatchContent = document.getElementById("blocked-match-content");
  const blockedMatchAuthor = document.getElementById("blocked-match-author");
  const focusMatchTitle = document.getElementById("focus-match-title");
  const focusMatchContent = document.getElementById("focus-match-content");
  const focusMatchAuthor = document.getElementById("focus-match-author");

  if (enabledToggle) {
    enabledToggle.addEventListener("change", () => {
      const enabled = enabledToggle.checked;
      chrome.runtime.sendMessage(
        { type: "SET_ENABLED", enabled },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error("[ShutUpReddit] Error SET_ENABLED:", chrome.runtime.lastError);
            return;
          }
          if (response && response.success && response.rules) {
            currentRules = response.rules;
          } else if (currentRules) {
            currentRules.enabled = enabled;
          }
          updateStatusBanner();
        }
      );
    });
  }

  if (pauseBtn) {
    pauseBtn.addEventListener("click", () => {
      chrome.runtime.sendMessage(
        { type: "PAUSE_FOR_30_MINUTES" },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error("[ShutUpReddit] Error PAUSE_FOR_30_MINUTES:", chrome.runtime.lastError);
            return;
          }
          if (response && response.success && response.rules) {
            currentRules = response.rules;
            updateStatusBanner();
          }
        }
      );
    });
  }

  if (addKeywordBtn) {
    addKeywordBtn.addEventListener("click", addKeywordFromInput);
  }

  if (keywordInput) {
    keywordInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        addKeywordFromInput();
      }
    });
  }

  if (focusModeToggle) {
    focusModeToggle.addEventListener("change", (e) => {
      if (!currentRules) return;
      const updated = { ...currentRules, focusModeEnabled: e.target.checked };
      saveRules(updated, (ok) => {
        if (ok) {
          updateSummaryChips();
        }
      });
    });
  }

  if (addFocusKeywordBtn) {
    addFocusKeywordBtn.addEventListener("click", () => {
      const input = focusKeywordInput;
      if (!input || !currentRules) return;
      
      const value = input.value.trim().toLowerCase();
      if (!value) return;

      if (!currentRules.focusKeywords) {
        currentRules.focusKeywords = [];
      }

      if (!currentRules.focusKeywords.includes(value)) {
        const updated = { ...currentRules, focusKeywords: [...currentRules.focusKeywords, value] };
        saveRules(updated, (ok) => {
          if (ok) {
            input.value = "";
            renderFocusKeywordList();
            updateSummaryChips();
          }
        });
      } else {
        input.value = "";
      }
    });
  }

  if (focusKeywordInput) {
    focusKeywordInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (addFocusKeywordBtn) {
          addFocusKeywordBtn.click();
        }
      }
    });
  }

  if (pingBtn && pingStatus) {
    pingBtn.addEventListener("click", () => {
      pingStatus.textContent = "Pinging…";
      chrome.runtime.sendMessage(
        { type: "PING_FROM_POPUP" },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error("[ShutUpReddit] Error ping:", chrome.runtime.lastError);
            pingStatus.textContent = "Ping error (check console)";
            return;
          }
          pingStatus.textContent = `Response: ${JSON.stringify(response)}`;
        }
      );
    });
  }

  if (resetStatsBtn) {
    resetStatsBtn.addEventListener("click", () => {
      if (confirm("Reset all statistics? This cannot be undone.")) {
        chrome.runtime.sendMessage(
          { type: "RESET_STATS" },
          (response) => {
            if (chrome.runtime.lastError) {
              console.error("[ShutUpReddit] Error resetting stats:", chrome.runtime.lastError);
              return;
            }
            if (response && response.success) {
              updateStatsUI(response.stats);
            }
          }
        );
      }
    });
  }

  if (resetFiltersBtn) {
    resetFiltersBtn.addEventListener("click", () => {
      if (confirm("Reset all filters to defaults? This will remove all your blocked keywords, focus keywords, and other filter settings. This cannot be undone.")) {
        chrome.runtime.sendMessage(
          { type: "RESET_RULES" },
          (response) => {
            if (chrome.runtime.lastError) {
              console.error("[ShutUpReddit] Error resetting rules:", chrome.runtime.lastError);
              return;
            }
            if (response && response.success && response.rules) {
              currentRules = response.rules;
              // Refresh UI
              const enabledToggle = document.getElementById("enabled-toggle");
              if (enabledToggle) {
                enabledToggle.checked = !!currentRules.enabled;
              }
              const focusModeToggle = document.getElementById("focusModeToggle");
              if (focusModeToggle) {
                focusModeToggle.checked = !!currentRules.focusModeEnabled;
              }
              // Load blocked keywords match options
              const blockedMatchIn = currentRules.blockedKeywordsMatchIn || { title: true, content: true, author: false };
              const blockedMatchTitle = document.getElementById("blocked-match-title");
              const blockedMatchContent = document.getElementById("blocked-match-content");
              const blockedMatchAuthor = document.getElementById("blocked-match-author");
              if (blockedMatchTitle) blockedMatchTitle.checked = !!blockedMatchIn.title;
              if (blockedMatchContent) blockedMatchContent.checked = !!blockedMatchIn.content;
              if (blockedMatchAuthor) blockedMatchAuthor.checked = !!blockedMatchIn.author;
              // Load focus keywords match options
              const focusMatchIn = currentRules.focusKeywordsMatchIn || { title: true, content: true, author: true };
              const focusMatchTitle = document.getElementById("focus-match-title");
              const focusMatchContent = document.getElementById("focus-match-content");
              const focusMatchAuthor = document.getElementById("focus-match-author");
              if (focusMatchTitle) focusMatchTitle.checked = !!focusMatchIn.title;
              if (focusMatchContent) focusMatchContent.checked = !!focusMatchIn.content;
              if (focusMatchAuthor) focusMatchAuthor.checked = !!focusMatchIn.author;
              // Update UI
              updateStatusBanner();
              updateSummaryChips();
              updateRuleCounts();
              renderKeywordList();
              renderFocusKeywordList();
            }
          }
        );
      }
    });
  }

  if (viewStoredFiltersBtn && storedFiltersDisplay) {
    viewStoredFiltersBtn.addEventListener("click", () => {
      if (storedFiltersDisplay.style.display === "none" || !storedFiltersDisplay.style.display) {
        // Show stored filters
        loadRules((rules) => {
          if (rules) {
            storedFiltersDisplay.textContent = JSON.stringify(rules, null, 2);
            storedFiltersDisplay.style.display = "block";
            viewStoredFiltersBtn.textContent = "Hide Stored Filters";
          } else {
            storedFiltersDisplay.textContent = "Error loading filters";
            storedFiltersDisplay.style.display = "block";
          }
        });
      } else {
        // Hide stored filters
        storedFiltersDisplay.style.display = "none";
        viewStoredFiltersBtn.textContent = "View Stored Filters";
      }
    });
  }

  // Wire up blocked keywords match options
  if (blockedMatchTitle) {
    blockedMatchTitle.addEventListener("change", () => {
      if (!currentRules) return;
      const updated = { ...currentRules };
      if (!updated.blockedKeywordsMatchIn) {
        updated.blockedKeywordsMatchIn = { title: true, content: true, author: false };
      }
      updated.blockedKeywordsMatchIn.title = blockedMatchTitle.checked;
      saveRules(updated, () => {});
    });
  }

  if (blockedMatchContent) {
    blockedMatchContent.addEventListener("change", () => {
      if (!currentRules) return;
      const updated = { ...currentRules };
      if (!updated.blockedKeywordsMatchIn) {
        updated.blockedKeywordsMatchIn = { title: true, content: true, author: false };
      }
      updated.blockedKeywordsMatchIn.content = blockedMatchContent.checked;
      saveRules(updated, () => {});
    });
  }

  if (blockedMatchAuthor) {
    blockedMatchAuthor.addEventListener("change", () => {
      if (!currentRules) return;
      const updated = { ...currentRules };
      if (!updated.blockedKeywordsMatchIn) {
        updated.blockedKeywordsMatchIn = { title: true, content: true, author: false };
      }
      updated.blockedKeywordsMatchIn.author = blockedMatchAuthor.checked;
      saveRules(updated, () => {});
    });
  }

  // Wire up focus keywords match options
  if (focusMatchTitle) {
    focusMatchTitle.addEventListener("change", () => {
      if (!currentRules) return;
      const updated = { ...currentRules };
      if (!updated.focusKeywordsMatchIn) {
        updated.focusKeywordsMatchIn = { title: true, content: true, author: true };
      }
      updated.focusKeywordsMatchIn.title = focusMatchTitle.checked;
      saveRules(updated, () => {});
    });
  }

  if (focusMatchContent) {
    focusMatchContent.addEventListener("change", () => {
      if (!currentRules) return;
      const updated = { ...currentRules };
      if (!updated.focusKeywordsMatchIn) {
        updated.focusKeywordsMatchIn = { title: true, content: true, author: true };
      }
      updated.focusKeywordsMatchIn.content = focusMatchContent.checked;
      saveRules(updated, () => {});
    });
  }

  if (focusMatchAuthor) {
    focusMatchAuthor.addEventListener("change", () => {
      if (!currentRules) return;
      const updated = { ...currentRules };
      if (!updated.focusKeywordsMatchIn) {
        updated.focusKeywordsMatchIn = { title: true, content: true, author: true };
      }
      updated.focusKeywordsMatchIn.author = focusMatchAuthor.checked;
      saveRules(updated, () => {});
    });
  }
}

// --- Init ---

document.addEventListener("DOMContentLoaded", () => {
  wireControls();

  loadRules((rules) => {
    if (!rules) return;

    const enabledToggle = document.getElementById("enabled-toggle");
    if (enabledToggle) {
      enabledToggle.checked = !!rules.enabled;
    }

    const focusModeToggle = document.getElementById("focusModeToggle");
    if (focusModeToggle) {
      focusModeToggle.checked = !!rules.focusModeEnabled;
    }

    // Load blocked keywords match options
    const blockedMatchIn = rules.blockedKeywordsMatchIn || { title: true, content: true, author: false };
    const blockedMatchTitle = document.getElementById("blocked-match-title");
    const blockedMatchContent = document.getElementById("blocked-match-content");
    const blockedMatchAuthor = document.getElementById("blocked-match-author");
    if (blockedMatchTitle) blockedMatchTitle.checked = !!blockedMatchIn.title;
    if (blockedMatchContent) blockedMatchContent.checked = !!blockedMatchIn.content;
    if (blockedMatchAuthor) blockedMatchAuthor.checked = !!blockedMatchIn.author;

    // Load focus keywords match options
    const focusMatchIn = rules.focusKeywordsMatchIn || { title: true, content: true, author: true };
    const focusMatchTitle = document.getElementById("focus-match-title");
    const focusMatchContent = document.getElementById("focus-match-content");
    const focusMatchAuthor = document.getElementById("focus-match-author");
    if (focusMatchTitle) focusMatchTitle.checked = !!focusMatchIn.title;
    if (focusMatchContent) focusMatchContent.checked = !!focusMatchIn.content;
    if (focusMatchAuthor) focusMatchAuthor.checked = !!focusMatchIn.author;

    updateStatusBanner();
    updateSummaryChips();
    updateRuleCounts();
    renderKeywordList();
    renderFocusKeywordList();
  });

  // Load and display statistics
  loadStats((stats) => {
    if (stats) {
      updateStatsUI(stats);
    }
  });

  // Refresh stats every 2 seconds when popup is open
  const statsInterval = setInterval(() => {
    loadStats((stats) => {
      if (stats) {
        updateStatsUI(stats);
      }
    });
  }, 2000);

  window.addEventListener("beforeunload", () => {
    clearInterval(statsInterval);
  });
});
