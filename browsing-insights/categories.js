// categories.js — Task 3.1: Domain Classifier
//
// WHAT THIS FILE DOES:
//   Maps domain names to human-readable categories.
//   Used by background.js when saving session records, and by
//   aggregator.js (Task 3.2) when computing time-per-category.
//
// DESIGN DECISIONS:
//   - Hardcoded lookup covers ~80% of real browsing with zero API calls
//   - Unknown domains fall through to "other" — never silently dropped
//   - background.js will batch unknown domains to the LLM once per day (Phase 4)
//   - Categories are broad by design — granular enough to be useful,
//     coarse enough that the chart isn't a mess of 20 slices
//
// TO EXTEND:
//   Just add entries to DOMAIN_CATEGORIES below.
//   Subdomains are stripped automatically — "mail.google.com" → "google.com"

// ─────────────────────────────────────────────────────────────────────────────
// CATEGORY DEFINITIONS
// Each category has a label and an emoji for the chart legend
// ─────────────────────────────────────────────────────────────────────────────

const CATEGORIES = {
  // ── Coding & Dev ──────────────────────────────────────────────────────────
  "github.com":            { category: "coding",      label: "Coding & Dev",       emoji: "💻" },
  "gitlab.com":            { category: "coding",      label: "Coding & Dev",       emoji: "💻" },
  "stackoverflow.com":     { category: "coding",      label: "Coding & Dev",       emoji: "💻" },
  "stackexchange.com":     { category: "coding",      label: "Coding & Dev",       emoji: "💻" },
  "codepen.io":            { category: "coding",      label: "Coding & Dev",       emoji: "💻" },
  "replit.com":            { category: "coding",      label: "Coding & Dev",       emoji: "💻" },
  "jsfiddle.net":          { category: "coding",      label: "Coding & Dev",       emoji: "💻" },
  "npmjs.com":             { category: "coding",      label: "Coding & Dev",       emoji: "💻" },
  "pypi.org":              { category: "coding",      label: "Coding & Dev",       emoji: "💻" },
  "developer.mozilla.org": { category: "coding",      label: "Coding & Dev",       emoji: "💻" },
  "docs.python.org":       { category: "coding",      label: "Coding & Dev",       emoji: "💻" },
  "reactjs.org":           { category: "coding",      label: "Coding & Dev",       emoji: "💻" },

  // ── Cloud & DevOps ────────────────────────────────────────────────────────
  "console.aws.amazon.com":{ category: "cloud",       label: "Cloud & DevOps",     emoji: "☁️" },
  "aws.amazon.com":        { category: "cloud",       label: "Cloud & DevOps",     emoji: "☁️" },
  "console.cloud.google.com":{ category: "cloud",     label: "Cloud & DevOps",     emoji: "☁️" },
  "cloud.google.com":      { category: "cloud",       label: "Cloud & DevOps",     emoji: "☁️" },
  "portal.azure.com":      { category: "cloud",       label: "Cloud & DevOps",     emoji: "☁️" },
  "vercel.com":            { category: "cloud",       label: "Cloud & DevOps",     emoji: "☁️" },
  "netlify.com":           { category: "cloud",       label: "Cloud & DevOps",     emoji: "☁️" },
  "heroku.com":            { category: "cloud",       label: "Cloud & DevOps",     emoji: "☁️" },
  "digitalocean.com":      { category: "cloud",       label: "Cloud & DevOps",     emoji: "☁️" },
  "cloudflare.com":        { category: "cloud",       label: "Cloud & DevOps",     emoji: "☁️" },

  // ── AI & LLM Tools ────────────────────────────────────────────────────────
  "claude.ai":             { category: "ai_tools",    label: "AI Tools",           emoji: "🤖" },
  "chat.openai.com":       { category: "ai_tools",    label: "AI Tools",           emoji: "🤖" },
  "chatgpt.com":           { category: "ai_tools",    label: "AI Tools",           emoji: "🤖" },
  "gemini.google.com":     { category: "ai_tools",    label: "AI Tools",           emoji: "🤖" },
  "perplexity.ai":         { category: "ai_tools",    label: "AI Tools",           emoji: "🤖" },
  "huggingface.co":        { category: "ai_tools",    label: "AI Tools",           emoji: "🤖" },
  "openrouter.ai":         { category: "ai_tools",    label: "AI Tools",           emoji: "🤖" },
  "aistudio.google.com":   { category: "ai_tools",    label: "AI Tools",           emoji: "🤖" },
  "cursor.sh":             { category: "ai_tools",    label: "AI Tools",           emoji: "🤖" },
  "v0.dev":                { category: "ai_tools",    label: "AI Tools",           emoji: "🤖" },

  // ── Project Management ────────────────────────────────────────────────────
  "jira.atlassian.net":    { category: "project_mgmt",label: "Project Mgmt",       emoji: "📋" },
  "linear.app":            { category: "project_mgmt",label: "Project Mgmt",       emoji: "📋" },
  "trello.com":            { category: "project_mgmt",label: "Project Mgmt",       emoji: "📋" },
  "asana.com":             { category: "project_mgmt",label: "Project Mgmt",       emoji: "📋" },
  "monday.com":            { category: "project_mgmt",label: "Project Mgmt",       emoji: "📋" },
  "notion.so":             { category: "project_mgmt",label: "Project Mgmt",       emoji: "📋" },
  "clickup.com":           { category: "project_mgmt",label: "Project Mgmt",       emoji: "📋" },
  "basecamp.com":          { category: "project_mgmt",label: "Project Mgmt",       emoji: "📋" },
  "height.app":            { category: "project_mgmt",label: "Project Mgmt",       emoji: "📋" },

  // ── Docs & Writing ────────────────────────────────────────────────────────
  "docs.google.com":       { category: "docs",        label: "Docs & Writing",     emoji: "📝" },
  "drive.google.com":      { category: "docs",        label: "Docs & Writing",     emoji: "📝" },
  "sheets.google.com":     { category: "docs",        label: "Docs & Writing",     emoji: "📝" },
  "slides.google.com":     { category: "docs",        label: "Docs & Writing",     emoji: "📝" },
  "office.com":            { category: "docs",        label: "Docs & Writing",     emoji: "📝" },
  "dropbox.com":           { category: "docs",        label: "Docs & Writing",     emoji: "📝" },
  "confluence.atlassian.net":{ category: "docs",      label: "Docs & Writing",     emoji: "📝" },
  "quip.com":              { category: "docs",        label: "Docs & Writing",     emoji: "📝" },
  "coda.io":               { category: "docs",        label: "Docs & Writing",     emoji: "📝" },

  // ── Communication ─────────────────────────────────────────────────────────
  "mail.google.com":       { category: "comms",       label: "Communication",      emoji: "💬" },
  "outlook.live.com":      { category: "comms",       label: "Communication",      emoji: "💬" },
  "outlook.office.com":    { category: "comms",       label: "Communication",      emoji: "💬" },
  "slack.com":             { category: "comms",       label: "Communication",      emoji: "💬" },
  "discord.com":           { category: "comms",       label: "Communication",      emoji: "💬" },
  "teams.microsoft.com":   { category: "comms",       label: "Communication",      emoji: "💬" },
  "meet.google.com":       { category: "comms",       label: "Communication",      emoji: "💬" },
  "zoom.us":               { category: "comms",       label: "Communication",      emoji: "💬" },
  "web.whatsapp.com":      { category: "comms",       label: "Communication",      emoji: "💬" },
  "telegram.org":          { category: "comms",       label: "Communication",      emoji: "💬" },

  // ── Reading & Research ────────────────────────────────────────────────────
  "medium.com":            { category: "reading",     label: "Reading & Research", emoji: "📖" },
  "dev.to":                { category: "reading",     label: "Reading & Research", emoji: "📖" },
  "hashnode.com":          { category: "reading",     label: "Reading & Research", emoji: "📖" },
  "substack.com":          { category: "reading",     label: "Reading & Research", emoji: "📖" },
  "news.ycombinator.com":  { category: "reading",     label: "Reading & Research", emoji: "📖" },
  "lobste.rs":             { category: "reading",     label: "Reading & Research", emoji: "📖" },
  "wikipedia.org":         { category: "reading",     label: "Reading & Research", emoji: "📖" },
  "arxiv.org":             { category: "reading",     label: "Reading & Research", emoji: "📖" },

  // ── News ──────────────────────────────────────────────────────────────────
  "bbc.com":               { category: "news",        label: "News",               emoji: "📰" },
  "bbc.co.uk":             { category: "news",        label: "News",               emoji: "📰" },
  "cnn.com":               { category: "news",        label: "News",               emoji: "📰" },
  "theguardian.com":       { category: "news",        label: "News",               emoji: "📰" },
  "nytimes.com":           { category: "news",        label: "News",               emoji: "📰" },
  "reuters.com":           { category: "news",        label: "News",               emoji: "📰" },
  "techcrunch.com":        { category: "news",        label: "News",               emoji: "📰" },
  "theverge.com":          { category: "news",        label: "News",               emoji: "📰" },
  "wired.com":             { category: "news",        label: "News",               emoji: "📰" },
  "arstechnica.com":       { category: "news",        label: "News",               emoji: "📰" },
  "ndtv.com":              { category: "news",        label: "News",               emoji: "📰" },
  "timesofindia.com":      { category: "news",        label: "News",               emoji: "📰" },
  "hindustantimes.com":    { category: "news",        label: "News",               emoji: "📰" },

  // ── Social Media ──────────────────────────────────────────────────────────
  "twitter.com":           { category: "social",      label: "Social Media",       emoji: "📱" },
  "x.com":                 { category: "social",      label: "Social Media",       emoji: "📱" },
  "linkedin.com":          { category: "social",      label: "Social Media",       emoji: "📱" },
  "facebook.com":          { category: "social",      label: "Social Media",       emoji: "📱" },
  "instagram.com":         { category: "social",      label: "Social Media",       emoji: "📱" },
  "reddit.com":            { category: "social",      label: "Social Media",       emoji: "📱" },
  "pinterest.com":         { category: "social",      label: "Social Media",       emoji: "📱" },
  "threads.net":           { category: "social",      label: "Social Media",       emoji: "📱" },
  "mastodon.social":       { category: "social",      label: "Social Media",       emoji: "📱" },

  // ── Video & Entertainment ─────────────────────────────────────────────────
  "youtube.com":           { category: "video",       label: "Video",              emoji: "▶️" },
  "youtu.be":              { category: "video",       label: "Video",              emoji: "▶️" },
  "netflix.com":           { category: "video",       label: "Video",              emoji: "▶️" },
  "twitch.tv":             { category: "video",       label: "Video",              emoji: "▶️" },
  "vimeo.com":             { category: "video",       label: "Video",              emoji: "▶️" },
  "hotstar.com":           { category: "video",       label: "Video",              emoji: "▶️" },
  "primevideo.com":        { category: "video",       label: "Video",              emoji: "▶️" },


  // ── Sports ────────────────────────────────────────────────────────────────
  "espncricinfo.com":      { category: "sports",      label: "Sports",             emoji: "🏏" },
  "espn.in":               { category: "sports",      label: "Sports",             emoji: "🏏" },
  "espn.com":              { category: "sports",      label: "Sports",             emoji: "🏏" },
  "cricbuzz.com":          { category: "sports",      label: "Sports",             emoji: "🏏" },
  "cricket.com":           { category: "sports",      label: "Sports",             emoji: "🏏" },
  "ipl.t20.com":           { category: "sports",      label: "Sports",             emoji: "🏏" },
  "goal.com":              { category: "sports",      label: "Sports",             emoji: "⚽" },
  "nba.com":               { category: "sports",      label: "Sports",             emoji: "🏀" },
  "chess.com":             { category: "sports",      label: "Sports",             emoji: "♟️" },
  "lichess.org":           { category: "sports",      label: "Sports",             emoji: "♟️" },
  "skysports.com":         { category: "sports",      label: "Sports",             emoji: "🏆" },
  "bbc.co.uk/sport":       { category: "sports",      label: "Sports",             emoji: "🏆" },

  // ── Finance & Investing ───────────────────────────────────────────────────
  "etmoney.com":           { category: "finance",     label: "Finance",            emoji: "💰" },
  "zerodha.com":           { category: "finance",     label: "Finance",            emoji: "💰" },
  "groww.in":              { category: "finance",     label: "Finance",            emoji: "💰" },
  "kite.zerodha.com":      { category: "finance",     label: "Finance",            emoji: "💰" },
  "moneycontrol.com":      { category: "finance",     label: "Finance",            emoji: "💰" },
  "economictimes.com":     { category: "finance",     label: "Finance",            emoji: "💰" },
  "investing.com":         { category: "finance",     label: "Finance",            emoji: "💰" },
  "bloomberg.com":         { category: "finance",     label: "Finance",            emoji: "💰" },
  "wsj.com":               { category: "finance",     label: "Finance",            emoji: "💰" },
  "cnbc.com":              { category: "finance",     label: "Finance",            emoji: "💰" },
  "nseindia.com":          { category: "finance",     label: "Finance",            emoji: "💰" },
  "bseindia.com":          { category: "finance",     label: "Finance",            emoji: "💰" },

  // ── Learning & Courses ────────────────────────────────────────────────────
  "coursera.org":          { category: "learning",    label: "Learning",           emoji: "🎓" },
  "udemy.com":             { category: "learning",    label: "Learning",           emoji: "🎓" },
  "skillshare.com":        { category: "learning",    label: "Learning",           emoji: "🎓" },
  "skillbuilder.aws":      { category: "learning",    label: "Learning",           emoji: "🎓" },
  "learn.microsoft.com":   { category: "learning",    label: "Learning",           emoji: "🎓" },
  "cloudskillsboost.google.com": { category: "learning", label: "Learning",        emoji: "🎓" },
  "pluralsight.com":       { category: "learning",    label: "Learning",           emoji: "🎓" },
  "linkedin.com/learning": { category: "learning",    label: "Learning",           emoji: "🎓" },
  "edx.org":               { category: "learning",    label: "Learning",           emoji: "🎓" },
  "khanacademy.org":       { category: "learning",    label: "Learning",           emoji: "🎓" },
  "codecademy.com":        { category: "learning",    label: "Learning",           emoji: "🎓" },
  "freecodecamp.org":      { category: "learning",    label: "Learning",           emoji: "🎓" },
  "leetcode.com":          { category: "learning",    label: "Learning",           emoji: "🎓" },
  "hackerrank.com":        { category: "learning",    label: "Learning",           emoji: "🎓" },

  // ── Indian News & Media ───────────────────────────────────────────────────
  "indianexpress.com":     { category: "news",        label: "News",               emoji: "📰" },
  "thehindu.com":          { category: "news",        label: "News",               emoji: "📰" },
  "livemint.com":          { category: "news",        label: "News",               emoji: "📰" },
  "businessstandard.com":  { category: "news",        label: "News",               emoji: "📰" },
  "financialexpress.com":  { category: "news",        label: "News",               emoji: "📰" },
  "scroll.in":             { category: "news",        label: "News",               emoji: "📰" },
  "thewire.in":            { category: "news",        label: "News",               emoji: "📰" },
  "news18.com":            { category: "news",        label: "News",               emoji: "📰" },
  "zeenews.india.com":     { category: "news",        label: "News",               emoji: "📰" },

  // ── Common domains that fall through ─────────────────────────────────────
  "google.com":            { category: "docs",        label: "Docs & Writing",     emoji: "📝" },
  "google.co.in":          { category: "docs",        label: "Docs & Writing",     emoji: "📝" },
  "mail.google.com":       { category: "comms",       label: "Communication",      emoji: "💬" },
  "calendar.google.com":   { category: "docs",        label: "Docs & Writing",     emoji: "📝" },
  "maps.google.com":       { category: "other",       label: "Other",              emoji: "🌐" },
  "translate.google.com":  { category: "other",       label: "Other",              emoji: "🌐" },

  // ── Shopping ──────────────────────────────────────────────────────────────
  "amazon.com":            { category: "shopping",    label: "Shopping",           emoji: "🛒" },
  "amazon.in":             { category: "shopping",    label: "Shopping",           emoji: "🛒" },
  "flipkart.com":          { category: "shopping",    label: "Shopping",           emoji: "🛒" },
  "ebay.com":              { category: "shopping",    label: "Shopping",           emoji: "🛒" },
  "etsy.com":              { category: "shopping",    label: "Shopping",           emoji: "🛒" },
  "meesho.com":            { category: "shopping",    label: "Shopping",           emoji: "🛒" },
};

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Classify a domain string into a category.
 * Strips subdomains progressively until a match is found.
 *
 * Examples:
 *   classifyDomain("github.com")          → { category: "coding", label: "Coding & Dev", emoji: "💻" }
 *   classifyDomain("mail.google.com")     → { category: "comms",  label: "Communication", emoji: "💬" }
 *   classifyDomain("mycompany.tools.com") → { category: "other",  label: "Other",         emoji: "🌐" }
 */
function classifyDomain(domain) {
  if (!domain || domain === "unknown") {
    return { category: "other", label: "Other", emoji: "🌐" };
  }

  // Try exact match first
  if (CATEGORIES[domain]) return CATEGORIES[domain];

  // Then strip subdomains one level at a time
  // "mail.google.com" → "google.com" → no match → "other"
  const parts = domain.split(".");
  for (let i = 1; i < parts.length - 1; i++) {
    const shorter = parts.slice(i).join(".");
    if (CATEGORIES[shorter]) return CATEGORIES[shorter];
  }

  return { category: "other", label: "Other", emoji: "🌐" };
}

/**
 * Return every unique category definition — used to build chart legends.
 */
function getAllCategories() {
  const seen = new Set();
  const result = [];
  Object.values(CATEGORIES).forEach(({ category, label, emoji }) => {
    if (!seen.has(category)) {
      seen.add(category);
      result.push({ category, label, emoji });
    }
  });
  result.push({ category: "other", label: "Other", emoji: "🌐" });
  return result;
}

/**
 * Quick self-test — run in service worker console to verify classifier.
 * classifyDomain.test()
 */
classifyDomain.test = function () {
  const cases = [
    ["github.com",           "coding"      ],
    ["mail.google.com",      "comms"       ],
    ["docs.google.com",      "docs"        ],
    ["news.ycombinator.com", "reading"     ],
    ["randomsite.xyz",       "other"       ],
    ["youtube.com",          "video"       ],
    ["aws.amazon.com",       "cloud"       ],
    ["claude.ai",            "ai_tools"    ],
  ];
  let passed = 0;
  cases.forEach(([domain, expected]) => {
    const result = classifyDomain(domain).category;
    const ok = result === expected;
    console.log(ok ? "✅" : "❌", domain, "→", result, ok ? "" : `(expected ${expected})`);
    if (ok) passed++;
  });
  console.log(`\n${passed}/${cases.length} tests passed`);
};
