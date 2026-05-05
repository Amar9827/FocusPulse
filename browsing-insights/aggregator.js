// aggregator.js — Task 3.2: Daily Stats Aggregation
//
// WHAT THIS FILE DOES:
//   Takes a raw array of session records (from chrome.storage) and produces
//   a clean stats object used by:
//     - The popup dashboard charts (Task 3.3)
//     - The LLM prompt (Task 4.1)
//
// INPUT — array of session records, each shaped like:
//   {
//     url, title, domain, duration, startTime, date,
//     category: { category, label, emoji }
//   }
//
// OUTPUT — a single stats object:
//   {
//     totalActiveSecs,      // total tracked time in seconds
//     byCategory,           // time per category, sorted descending
//     topDomains,           // top 5 domains by time
//     contextSwitches,      // tab changes per hour (focus score proxy)
//     longestFocusBlock,    // longest uninterrupted single-domain session
//     peakHour,             // which hour of day had most activity
//     hourlyBreakdown,      // array[24] of seconds per hour
//     sessionCount,         // total number of sessions
//     unknownDomains,       // domains we couldn't classify (for LLM batch)
//   }

// ─────────────────────────────────────────────────────────────────────────────
// MAIN EXPORT
// ─────────────────────────────────────────────────────────────────────────────

function aggregateDay(sessions) {
  if (!sessions || sessions.length === 0) {
    return emptyStats();
  }

  // ── 1. Total active time ──────────────────────────────────────────────────
  const totalActiveSecs = sessions.reduce((sum, s) => sum + s.duration, 0);

  // ── 2. Time per category ──────────────────────────────────────────────────
  // Build a map of category → total seconds, then sort descending
  const categoryMap = {};
  sessions.forEach((s) => {
    const cat   = s.category?.category || "other";
    const label = s.category?.label    || "Other";
    const emoji = s.category?.emoji    || "🌐";
    if (!categoryMap[cat]) {
      categoryMap[cat] = { category: cat, label, emoji, secs: 0, sessionCount: 0 };
    }
    categoryMap[cat].secs         += s.duration;
    categoryMap[cat].sessionCount += 1;
  });

  const byCategory = Object.values(categoryMap)
    .sort((a, b) => b.secs - a.secs)
    .map((c) => ({
      ...c,
      percent: totalActiveSecs > 0
        ? Math.round((c.secs / totalActiveSecs) * 100)
        : 0,
      fmtTime: fmtSecs(c.secs),
    }));

  // ── 3. Top domains ────────────────────────────────────────────────────────
  const domainMap = {};
  sessions.forEach((s) => {
    if (!domainMap[s.domain]) {
      domainMap[s.domain] = {
        domain:   s.domain,
        secs:     0,
        visits:   0,
        category: s.category?.label || "Other",
      };
    }
    domainMap[s.domain].secs   += s.duration;
    domainMap[s.domain].visits += 1;
  });

  const topDomains = Object.values(domainMap)
    .sort((a, b) => b.secs - a.secs)
    .slice(0, 7)
    .map((d) => ({ ...d, fmtTime: fmtSecs(d.secs) }));

  // ── 4. Context switches per hour ──────────────────────────────────────────
  // A "context switch" = any tab change. High switching = scattered focus.
  // We compute: total switches / total active hours
  // Typical range: <5 = deep focus, 5-15 = normal, >20 = very scattered
  const totalActiveHours = totalActiveSecs / 3600;
  const contextSwitches  = totalActiveHours > 0
    ? Math.round(sessions.length / totalActiveHours)
    : 0;

  // ── 5. Longest focus block ────────────────────────────────────────────────
  // Find the single longest session on one domain.
  // This is a simple proxy for "deep work" — sustained attention on one thing.
  const longestSession = sessions.reduce(
    (best, s) => (s.duration > best.duration ? s : best),
    { duration: 0, domain: "", title: "" }
  );

  const longestFocusBlock = {
    domain:   longestSession.domain,
    title:    longestSession.title,
    secs:     longestSession.duration,
    fmtTime:  fmtSecs(longestSession.duration),
    startTime: longestSession.startTime,
  };

  // ── 6. Hourly breakdown ───────────────────────────────────────────────────
  // Bucket all session time into the 24 hours of the day.
  // Each session is attributed to the hour it STARTED in.
  // This gives us the bar chart data and peak hour.
  const hourlyBreakdown = new Array(24).fill(0);
  sessions.forEach((s) => {
    const hour = new Date(s.startTime).getHours();
    hourlyBreakdown[hour] += s.duration;
  });

  const peakHourIndex = hourlyBreakdown.indexOf(Math.max(...hourlyBreakdown));
  const peakHour = {
    hour:    peakHourIndex,
    label:   formatHour(peakHourIndex),
    secs:    hourlyBreakdown[peakHourIndex],
    fmtTime: fmtSecs(hourlyBreakdown[peakHourIndex]),
  };

  // ── 7. Unknown domains (for LLM batch classification in Phase 4) ──────────
  // Collect domains that landed in "other" — the LLM will classify these
  // in bulk once per day rather than making an API call per session.
  const unknownDomains = [...new Set(
    sessions
      .filter((s) => !s.category || s.category.category === "other")
      .map((s) => s.domain)
      .filter(Boolean)
  )];

  // ── 8. Focus score (0–100) ────────────────────────────────────────────────
  // A single number summarising the quality of the day's focus.
  // Formula factors in: context switch rate, longest focus block, % in
  // productive categories vs. social/video/news/shopping.
  const distractedCats  = new Set(["social", "video", "news", "shopping"]);
  const distractedSecs  = byCategory
    .filter((c) => distractedCats.has(c.category))
    .reduce((sum, c) => sum + c.secs, 0);
  const distractedPct   = totalActiveSecs > 0
    ? distractedSecs / totalActiveSecs
    : 0;

  // Switch penalty: 0 switches/hr = 0 penalty, 30+ = full penalty
  const switchPenalty   = Math.min(contextSwitches / 30, 1);
  // Distraction penalty: 0% distracted = 0 penalty, 50%+ = full penalty
  const distractPenalty = Math.min(distractedPct / 0.5, 1);
  // Focus bonus: longest block > 30 min scores max bonus
  const focusBonus      = Math.min(longestFocusBlock.secs / 1800, 1);

  const focusScore = Math.round(
    Math.max(0, Math.min(100,
      100
      - switchPenalty   * 35
      - distractPenalty * 35
      + focusBonus      * 20
      - 20              // baseline offset so 50 = average day
    ))
  );

  return {
    totalActiveSecs,
    fmtTotalTime: fmtSecs(totalActiveSecs),
    byCategory,
    topDomains,
    contextSwitches,
    longestFocusBlock,
    peakHour,
    hourlyBreakdown,
    sessionCount: sessions.length,
    unknownDomains,
    focusScore,
    focusLabel: focusScoreLabel(focusScore),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function fmtSecs(secs) {
  if (secs < 60)   return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatHour(h) {
  if (h === 0)  return "12am";
  if (h < 12)  return `${h}am`;
  if (h === 12) return "12pm";
  return `${h - 12}pm`;
}

function focusScoreLabel(score) {
  if (score >= 80) return { label: "Deep focus",    color: "#16a34a" };
  if (score >= 60) return { label: "Good focus",    color: "#65a30d" };
  if (score >= 40) return { label: "Moderate",      color: "#d97706" };
  if (score >= 20) return { label: "Scattered",     color: "#ea580c" };
  return              { label: "Very scattered", color: "#dc2626" };
}

function emptyStats() {
  return {
    totalActiveSecs:  0,
    fmtTotalTime:     "0s",
    byCategory:       [],
    topDomains:       [],
    contextSwitches:  0,
    longestFocusBlock:{ domain: "", title: "", secs: 0, fmtTime: "0s" },
    peakHour:         { hour: 0, label: "12am", secs: 0, fmtTime: "0s" },
    hourlyBreakdown:  new Array(24).fill(0),
    sessionCount:     0,
    unknownDomains:   [],
    focusScore:       0,
    focusLabel:       { label: "No data", color: "#9ca3af" },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SELF-TEST — run aggregateDay.test() in the service worker console
// ─────────────────────────────────────────────────────────────────────────────

aggregateDay.test = function () {
  const now  = Date.now();
  const hour = new Date().getHours();

  const mockSessions = [
    { domain: "github.com",      title: "PR review",    duration: 1800, startTime: now - 7200000, date: "2025-01-04", category: { category: "coding",   label: "Coding & Dev",   emoji: "💻" } },
    { domain: "github.com",      title: "Issues",       duration: 900,  startTime: now - 5400000, date: "2025-01-04", category: { category: "coding",   label: "Coding & Dev",   emoji: "💻" } },
    { domain: "slack.com",       title: "General",      duration: 600,  startTime: now - 3600000, date: "2025-01-04", category: { category: "comms",    label: "Communication",  emoji: "💬" } },
    { domain: "youtube.com",     title: "Tutorial",     duration: 1200, startTime: now - 2700000, date: "2025-01-04", category: { category: "video",    label: "Video",          emoji: "▶️" } },
    { domain: "reddit.com",      title: "r/programming",duration: 300,  startTime: now - 1800000, date: "2025-01-04", category: { category: "social",   label: "Social Media",   emoji: "📱" } },
    { domain: "docs.google.com", title: "Project doc",  duration: 2400, startTime: now - 900000,  date: "2025-01-04", category: { category: "docs",     label: "Docs & Writing", emoji: "📝" } },
    { domain: "unknownco.io",    title: "Some site",    duration: 120,  startTime: now - 300000,  date: "2025-01-04", category: { category: "other",    label: "Other",          emoji: "🌐" } },
  ];

  const stats = aggregateDay(mockSessions);

  console.log("── aggregateDay() test ──────────────────");
  console.log("Total active time  :", stats.fmtTotalTime);
  console.log("Session count      :", stats.sessionCount);
  console.log("Focus score        :", stats.focusScore, "—", stats.focusLabel.label);
  console.log("Context switches/hr:", stats.contextSwitches);
  console.log("Longest focus block:", stats.longestFocusBlock.fmtTime, "on", stats.longestFocusBlock.domain);
  console.log("Peak hour          :", stats.peakHour.label);
  console.log("Unknown domains    :", stats.unknownDomains);
  console.log("\nBy category:");
  stats.byCategory.forEach((c) =>
    console.log(` ${c.emoji} ${c.label.padEnd(20)} ${c.fmtTime.padStart(6)}  ${c.percent}%`)
  );
  console.log("\nTop domains:");
  stats.topDomains.forEach((d) =>
    console.log(` ${d.domain.padEnd(25)} ${d.fmtTime.padStart(6)}  ${d.visits} visit(s)`)
  );
  console.log("────────────────────────────────────────");
};
