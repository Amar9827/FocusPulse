// categories.js is loaded as a classic script via importScripts
importScripts("categories.js");
importScripts("aggregator.js");
importScripts("llm.js");

// background.js — Task 2.4: Storage Management & 30-day Cleanup
//
// WHAT'S NEW IN THIS TASK:
//   1. pruneOldSessions()  — deletes daily session keys older than 30 days
//   2. chrome.alarms       — runs cleanup once per day automatically
//   3. getStorageStats()   — reports how many days stored + bytes used
//
// WHY CLEANUP MATTERS:
//   chrome.storage.local has a 10MB limit (5MB on some older Chrome versions).
//   At ~200 bytes per session × 300 sessions/day = ~60KB/day.
//   30 days = ~1.8MB — well within budget, but without cleanup it grows
//   indefinitely. Good engineering means not assuming it's fine forever.
//
// THE ALARM PATTERN:
//   We can't use setInterval for daily work — the service worker sleeps.
//   chrome.alarms wakes the worker on a schedule even when it's dormant.
//   We register the alarm in onInstalled (first run) and it persists.

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────────────

const IDLE_THRESHOLD_SECS = 60;
const KEEP_DAYS           = 30;   // How many days of history to retain
const CLEANUP_ALARM       = "daily-cleanup";
const INSIGHTS_ALARM      = "daily-insights";

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function getDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); }
  catch { return "unknown"; }
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function shouldIgnore(url) {
  if (!url) return true;
  if (url.startsWith("chrome://"))           return true;
  if (url.startsWith("chrome-extension://")) return true;
  if (url.startsWith("about:"))              return true;
  return false;
}

/**
 * Returns the epoch ms timestamp for the next occurrence of a given hour:minute.
 * e.g. nextAlarmTime(18, 0) → next 6:00pm
 * If that time has already passed today, returns tomorrow's occurrence.
 */
function nextAlarmTime(hour, minute) {
  const now    = new Date();
  const target = new Date();
  target.setHours(hour, minute, 0, 0);
  if (target <= now) {
    // Already past today — schedule for tomorrow
    target.setDate(target.getDate() + 1);
  }
  return target.getTime();
}

function fmtDuration(secs) {
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

/**
 * Returns a date string N days ago, e.g. dateNDaysAgo(30) → "2026-04-04"
 * Used as the cutoff — any key older than this gets deleted.
 */
function dateNDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

// ─────────────────────────────────────────────────────────────────────────────
// NEW — Task 2.4a: Prune sessions older than KEEP_DAYS
//
// Strategy:
//   1. Get all keys currently in storage
//   2. Filter to ones matching "sessions_YYYY-MM-DD"
//   3. Delete any where the date portion is older than our cutoff
// ─────────────────────────────────────────────────────────────────────────────

function pruneOldSessions() {
  chrome.storage.local.get(null, (allData) => {
    const cutoff   = dateNDaysAgo(KEEP_DAYS);
    const toDelete = [];

    Object.keys(allData).forEach((key) => {
      // Only touch session day-keys, never touch settings/activeSession/etc.
      const match = key.match(/^sessions_(\d{4}-\d{2}-\d{2})$/);
      if (!match) return;

      const keyDate = match[1];   // e.g. "2026-03-01"
      if (keyDate < cutoff) {     // String comparison works for ISO dates
        toDelete.push(key);
      }
    });

    if (toDelete.length === 0) {
      console.log("[cleanup] Nothing to prune — all data within", KEEP_DAYS, "days");
      return;
    }

    chrome.storage.local.remove(toDelete, () => {
      console.log("[cleanup] Pruned", toDelete.length, "old day(s):", toDelete.join(", "));
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// NEW — Task 2.4b: Storage usage stats
//
// chrome.storage.local.getBytesInUse() returns total bytes used.
// We also count how many days we have stored and the total session count.
// This is what the popup will display in the storage inspector.
// ─────────────────────────────────────────────────────────────────────────────

function getStorageStats(callback) {
  chrome.storage.local.get(null, (allData) => {
    chrome.storage.local.getBytesInUse(null, (bytesUsed) => {
      const dayKeys = Object.keys(allData)
        .filter(k => k.match(/^sessions_\d{4}-\d{2}-\d{2}$/))
        .sort();

      const totalSessions = dayKeys.reduce((sum, k) => {
        return sum + (Array.isArray(allData[k]) ? allData[k].length : 0);
      }, 0);

      callback({
        bytesUsed,
        bytesTotal:    10 * 1024 * 1024,   // 10MB limit
        daysStored:    dayKeys.length,
        totalSessions,
        oldestDay:     dayKeys[0]  || null,
        newestDay:     dayKeys[dayKeys.length - 1] || null,
        percentUsed:   ((bytesUsed / (10 * 1024 * 1024)) * 100).toFixed(2),
      });
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// NEW — Task 2.4c: Register the daily cleanup alarm
//
// onInstalled fires once when the extension is first installed or updated.
// We create a persistent alarm here — it survives worker restarts and
// browser restarts, firing every 24 hours until explicitly cleared.
// ─────────────────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  // Create alarm only if it doesn't already exist
  chrome.alarms.get(CLEANUP_ALARM, (existing) => {
    if (!existing) {
      chrome.alarms.create(CLEANUP_ALARM, {
        delayInMinutes: 1,          // First run: 1 min after install (for testing)
        periodInMinutes: 24 * 60,   // Then: every 24 hours
      });
      console.log("[alarm] Daily cleanup alarm registered");
    }
  });

  // Register insights alarm — fires at 6pm daily
  // We calculate the exact ms until next 6pm so it fires at a consistent time
  // regardless of when the extension was installed.
  chrome.alarms.get(INSIGHTS_ALARM, (existing) => {
    if (!existing) {
      chrome.alarms.create(INSIGHTS_ALARM, {
        when:            nextAlarmTime(18, 0),  // First fire: next 6:00pm
        periodInMinutes: 24 * 60,               // Then: every 24 hours
      });
      console.log("[alarm] Daily insights alarm registered — next fire:",
        new Date(nextAlarmTime(18, 0)).toLocaleString());
    }
  });

  // Run an immediate prune on install/update too
  pruneOldSessions();
});

// ─────────────────────────────────────────────────────────────────────────────
// NEW — Task 2.4d: Handle the alarm firing
// ─────────────────────────────────────────────────────────────────────────────

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === CLEANUP_ALARM) {
    console.log("[alarm] Daily cleanup triggered at", new Date().toLocaleTimeString());
    pruneOldSessions();
  }

  if (alarm.name === INSIGHTS_ALARM) {
    console.log("[alarm] Daily insights triggered at", new Date().toLocaleTimeString());
    const date        = todayKey();
    const dayKey      = `sessions_${date}`;
    const insightsKey = `insights_${date}`;

    chrome.storage.local.get([dayKey, insightsKey], (result) => {
      const sessions = result[dayKey] || [];

      // Skip if fewer than 5 sessions — not enough data for useful insights
      if (sessions.length < 5) {
        console.log("[alarm] Too few sessions for insights:", sessions.length);
        return;
      }

      // Skip if insights already generated today (don't overwrite a manual generation)
      if (result[insightsKey] && !result[insightsKey].error) {
        console.log("[alarm] Insights already exist for today — skipping auto-generation");
        return;
      }

      const stats = aggregateDay(sessions);
      runDailyAI(sessions, stats, date);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// CORE: startSession / endSession  (unchanged)
// ─────────────────────────────────────────────────────────────────────────────

function startSession(tabId, url, title) {
  if (shouldIgnore(url)) return;

  const domain = getDomain(url);

  // Check blocklist — blocked domains are never recorded
  chrome.storage.local.get(["blocklist"], (r) => {
    const blocklist = r.blocklist || [];
    if (blocklist.includes(domain)) {
      console.log("[startSession] Blocked domain — not tracking:", domain);
      return;
    }

    const session = {
      tabId,
      url,
      title:     title || "(no title)",
      domain,
      category:  classifyDomain(domain),
      startTime: Date.now(),
    };
    chrome.storage.local.set({ activeSession: session }, () => {
      console.log("[startSession]", session.domain, "—", session.title.slice(0, 50));
    });
  });
}

function endSession(reason = "") {
  chrome.storage.local.get(["activeSession"], (result) => {
    const session = result.activeSession;
    if (!session || !session.startTime) return;

    const duration = Math.round((Date.now() - session.startTime) / 1000);
    if (duration < 3) {
      chrome.storage.local.remove("activeSession");
      return;
    }

    const record = {
      url:       session.url,
      title:     session.title,
      domain:    session.domain,
      duration,
      startTime: session.startTime,
      date:      todayKey(),
    };

    console.log(`[endSession${reason ? " — " + reason : ""}]`,
      record.domain, fmtDuration(duration), "—", record.title.slice(0, 50));

    const dayKey = `sessions_${todayKey()}`;
    chrome.storage.local.get([dayKey], (res) => {
      const sessions = res[dayKey] || [];
      sessions.push(record);
      chrome.storage.local.set({ [dayKey]: sessions, activeSession: null });
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// IDLE DETECTION  (unchanged)
// ─────────────────────────────────────────────────────────────────────────────

chrome.idle.setDetectionInterval(IDLE_THRESHOLD_SECS);

chrome.idle.onStateChanged.addListener((newState) => {
  console.log("[idle state]", newState);
  if (newState === "idle" || newState === "locked") {
    endSession(newState);
  } else if (newState === "active") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && !shouldIgnore(tabs[0].url)) {
        startSession(tabs[0].id, tabs[0].url, tabs[0].title);
      }
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// TAB EVENTS  (unchanged)
// ─────────────────────────────────────────────────────────────────────────────

chrome.tabs.onActivated.addListener((activeInfo) => {
  endSession("tab switch");
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (tab && tab.url) startSession(tab.id, tab.url, tab.title);
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return;
  if (shouldIgnore(tab.url)) return;
  chrome.tabs.query({ active: true, currentWindow: true }, (activeTabs) => {
    if (!activeTabs[0] || activeTabs[0].id !== tabId) return;
    endSession("navigation");
    startSession(tab.id, tab.url, tab.title);
  });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.local.get(["activeSession"], (result) => {
    if (result.activeSession?.tabId === tabId) endSession("tab closed");
  });
});

chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    endSession("focus lost");
  } else {
    chrome.tabs.query({ active: true, windowId }, (tabs) => {
      if (tabs[0] && !shouldIgnore(tabs[0].url)) {
        startSession(tabs[0].id, tabs[0].url, tabs[0].title);
      }
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// MESSAGE LISTENER — updated with storage stats
// ─────────────────────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  if (message.type === "ping") {
    chrome.idle.queryState(IDLE_THRESHOLD_SECS, (state) => {
      sendResponse({
        status:    "alive",
        version:   "2.4",
        idleState: state,
        threshold: IDLE_THRESHOLD_SECS,
        time:      new Date().toLocaleTimeString(),
      });
    });
  }

  if (message.type === "getSessions") {
    const dayKey = `sessions_${todayKey()}`;
    chrome.storage.local.get([dayKey, "activeSession"], (result) => {
      const sessions = result[dayKey] || [];
      sendResponse({
        sessions,
        activeSession: result.activeSession || null,
        stats:         aggregateDay(sessions),
      });
    });
  }

  if (message.type === "getIdleState") {
    chrome.idle.queryState(IDLE_THRESHOLD_SECS, (state) => {
      sendResponse({ idleState: state, threshold: IDLE_THRESHOLD_SECS });
    });
  }

  // NEW: popup requests storage usage stats
  if (message.type === "getStorageStats") {
    getStorageStats((stats) => sendResponse(stats));
  }

  // NEW: popup triggers a manual cleanup (useful for testing)
  if (message.type === "pruneNow") {
    pruneOldSessions();
    sendResponse({ ok: true });
  }

  // NEW: popup requests stored insights for today
  if (message.type === "getInsights") {
    const date = message.date || todayKey();
    chrome.storage.local.get([`insights_${date}`], (result) => {
      sendResponse({ insights: result[`insights_${date}`] || null });
    });
  }

  // NEW: popup triggers an on-demand insights generation
  if (message.type === "generateInsights") {
    const date   = todayKey();
    const dayKey = `sessions_${date}`;
    chrome.storage.local.get([dayKey], async (result) => {
      const sessions = result[dayKey] || [];
      const stats    = aggregateDay(sessions);
      const insights = await runDailyAI(sessions, stats, date);
      sendResponse({ insights });
    });
  }

  // NEW: settings page notifies background of key update
  if (message.type === "settingsUpdated") {
    console.log("[settings] Updated — AI features now available");
    sendResponse({ ok: true });
  }

  // NEW: re-classify all sessions for a given day using updated hardcoded table
  if (message.type === "reclassifyToday") {
    const dayKey = `sessions_${todayKey()}`;
    chrome.storage.local.get([dayKey, "domainCache"], (result) => {
      const sessions = result[dayKey] || [];
      const cache    = result.domainCache || {};

      const updated = sessions.map(s => {
        const domain = getDomain(s.url);

        // Check user-defined cache first — takes priority over hardcoded table
        const cached = cache[domain];
        if (cached) {
          const cat = typeof cached === "object" ? cached.category : cached;
          if (cat && cat !== "other") {
            // Look up full category object from classifyDomain for consistency
            const fullCat = classifyDomain(domain);
            // If hardcoded table has it, use that; otherwise build from cache
            const category = fullCat.category !== "other"
              ? fullCat
              : { category: cat, label: cat.replace(/_/g," "), emoji: "🌐" };
            return { ...s, category };
          }
        }

        // Fall through to hardcoded table
        return { ...s, category: classifyDomain(domain) };
      });

      chrome.storage.local.set({ [dayKey]: updated }, () => {
        console.log(`[reclassify] Updated ${updated.length} sessions`);
        sendResponse({ count: updated.length });
      });
    });
  }

  return true;
});
