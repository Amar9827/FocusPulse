# Browsing Insights

A privacy-first Chrome extension that tracks your daily browsing, generates AI-powered insights about your work patterns, and summarises any page you're reading — all with your data staying on your device.

---

## What it does

- **Tracks dwell time** across every tab you visit, pausing automatically when you're idle or switch apps
- **Categorises your browsing** into domains like Coding, Cloud & DevOps, Communication, Finance, Sports, and more
- **Generates a daily focus score** (0–100) based on context-switching rate, distraction time, and longest focus blocks
- **AI insights at end of day** — a narrative summary of how you spent your time, specific patterns observed, and one actionable suggestion for tomorrow
- **Summarises any page** on demand using Chrome's built-in Gemini Nano (on-device, free) or Groq as a fallback
- **Domain blocklist** — banking, health, or any site you want kept fully private is never tracked

---

## Privacy architecture

This is the most important thing to understand about how the extension works.

**Everything lives locally.** Session data, API keys, domain classifications, and insights are all stored in `chrome.storage.local` — local to your browser profile, never synced to Google servers, never sent to any server we control.

**What never leaves your machine:**
- Raw URLs and page titles
- Session records (domain, duration, timestamp)
- Your API keys

**What gets sent to the LLM (once per day, on demand):**
- Pre-aggregated stats only — category totals, time percentages, session counts
- Example: `"Cloud & DevOps: 1h 26m (74%), Sports: 11m (10%)..."`
- No raw URLs, no page titles, no personal identifiers

**What gets sent for page summarisation:**
- The visible text content of the page you're on, truncated to 8,000 characters
- Sent only when you explicitly click "Summarise this page"
- If Gemini Nano is available on your device, nothing leaves your machine at all

**Domain blocklist:** Any domain you add to the blocklist in Settings is never recorded — not even for time tracking. This is enforced in the background service worker before any session is saved.

---

## Setup

### Requirements
- Chrome 138 or later
- A free [Groq API key](https://console.groq.com/keys) (recommended) or [OpenRouter key](https://openrouter.ai/keys)
- No credit card required for either

### Installation
1. Download and unzip the extension folder
2. Open `chrome://extensions` in Chrome
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked** and select the `browsing-insights` folder
5. The extension icon appears in your toolbar — pin it for easy access

### Adding your API key
1. Click the extension icon → click ⚙ in the bottom-right corner
2. Paste your Groq key (starts with `gsk_`) in the **Groq API key** field
3. Click Save — the extension will use Groq for daily insights automatically

---

## How the tracking works

### Dwell time
Every time you switch to a tab, the background service worker records a start timestamp. When you switch away, close the tab, or Chrome loses focus, it calculates the elapsed time and saves a session record:

```json
{
  "url": "https://github.com/...",
  "domain": "github.com",
  "title": "PR #42 — Fix connection pool",
  "duration": 847,
  "category": { "category": "coding", "label": "Coding & Dev", "emoji": "💻" },
  "startTime": 1746300000000,
  "date": "2026-05-05"
}
```

Sessions shorter than 3 seconds are discarded — these are accidental clicks and page redirects.

### Idle detection
The extension uses `chrome.idle` with a 60-second threshold. If you stop touching your mouse and keyboard for 60 seconds, the current session ends. When you return, a new session starts. This means dwell time reflects genuine screen time, not "tab was open" time.

### Category classification
Domains are classified in three layers, applied in priority order:
1. **User-defined** — categories you set manually in Settings always win
2. **Hardcoded table** — ~150 common domains mapped in `categories.js` (instant, no API call)
3. **LLM classification** — unknown domains sent to Groq in batches using a one-word-per-line response format, cached permanently so each domain is only ever classified once

### Focus score
A single 0–100 number summarising the quality of your focus, computed from three factors:

| Factor | Weight | How it's measured |
|--------|--------|-------------------|
| Context switch penalty | −35 pts max | Tab changes per hour. 30+ switches/hr = full penalty |
| Distraction penalty | −35 pts max | % of time in Social, Video, News, Shopping. 50%+ = full penalty |
| Focus bonus | +20 pts max | Longest uninterrupted session. 30+ min = full bonus |

Baseline offset of −20 means a perfectly average day scores around 50. Above 70 is a good day; below 40 means scattered focus.

---

## AI insights

Insights are generated once per day — automatically at 6pm via `chrome.alarms`, or on demand via the ✨ button in the popup.

The LLM receives a compact summary (~500 tokens) containing category totals, focus score, context switch rate, peak activity hour, and top domains. It returns a structured response with:
- A 2–3 sentence narrative referencing actual numbers from your data
- Three specific pattern observations
- One actionable suggestion for tomorrow
- A focus verdict

**Known limitations:**
- YouTube watched for a technical tutorial counts as "Video" (distraction) even if it was productive work
- The focus score formula uses fixed weights that may not reflect everyone's work style
- Insights quality depends on having at least 5 sessions of data for the day

---

## Page summariser

Click **📄 Summarise this page** in the popup to get a bullet-point summary of whatever you're reading.

**Two modes, automatic fallback:**
1. **On-device (Gemini Nano)** — used if Chrome 138+ with 4GB+ GPU VRAM. Zero API calls, fully offline, badge shows "on-device · Gemini Nano"
2. **Groq fallback** — used on all other devices. Badge shows "llama-3.3-70b · Groq"

The page text is extracted by a content script running in the page context, cleaned of navigation, ads, and footers, then truncated to 8,000 characters before being passed to the summariser.

---

## Data management

All session data is stored under date-keyed entries in `chrome.storage.local`:
- `sessions_2026-05-05` — array of session records for that day
- `insights_2026-05-05` — AI-generated insights for that day
- `domainCache` — LLM and user-defined domain classifications

**Automatic cleanup:** Sessions older than 30 days are deleted daily via `chrome.alarms`. At ~60KB/day, 30 days of data uses roughly 1.8MB of the 10MB storage limit.

**Export:** Settings → Data → Export today or Export all days downloads a JSON file you can analyse externally.

**Delete:** Settings → Data offers two options:
- *Delete sessions only* — removes browsing data but keeps your API keys and settings
- *Delete everything* — full factory reset

---

## Trade-offs and known issues

**Content script injection:** On tabs that were open before the extension was installed or reloaded, the content script isn't active. The summariser handles this with on-demand injection, but the first summarise attempt on such a tab adds a brief 200ms delay.

**Free tier reliability:** Groq's free tier occasionally rate-limits during peak hours. The extension surfaces the error cleanly — retrying after a few minutes usually works. For guaranteed reliability, adding $5 of Groq credits removes rate limiting entirely.

**Domain classification accuracy:** The LLM correctly classifies ~95% of domains. Misclassified domains can be corrected in Settings → Site categories, where user-defined classifications permanently override the LLM result.

**Focus score is a heuristic:** The weights and thresholds in the formula were chosen to produce intuitive scores for a typical knowledge worker day. They may not suit everyone — this is documented explicitly as a known limitation and a good area for future personalisation.

---

## File structure

```
browsing-insights/
├── manifest.json       # Extension config, permissions, entry points
├── background.js       # Service worker: tracking, alarms, storage, LLM orchestration
├── content.js          # Page text extraction (runs in webpage context)
├── popup.html          # Dashboard UI structure
├── popup.js            # Dashboard rendering, charts, insights display, page summariser
├── popup.css           # All popup styles
├── options.html        # Settings page structure
├── options.js          # Settings logic: keys, blocklist, classifier, data management
├── options.css         # Settings page styles
├── categories.js       # Hardcoded domain → category lookup table (~150 domains)
├── aggregator.js       # Daily stats computation (focus score, category totals, etc.)
├── llm.js              # OpenRouter/Groq API calls, domain classification, insights
└── icons/              # Extension icons (16px, 48px, 128px)
```

---

## Built with

| Tool | Purpose | Cost |
|------|---------|------|
| Chrome Extensions API | Tab tracking, storage, alarms, idle detection | Free |
| Groq API | Daily insights + domain classification (Llama 3.3 70B) | Free tier: 1,000 req/day |
| Chrome Summarizer API | On-device page summarisation (Gemini Nano) | Free, requires 4GB+ VRAM |
| OpenRouter | Alternative LLM provider | Free tier: 200 req/day |
| Canvas API | Donut and bar charts | Free (built into Chrome) |

No npm packages. No build step. No backend. Load the folder and it works.

---

## Possible extensions

- **Weekly trends view** — compare focus scores across the last 7 days
- **Custom focus categories** — let users define which categories count as "productive" for their specific role
- **Export to Notion/Obsidian** — structured daily log in markdown format
- **Pomodoro integration** — use the focus block data to suggest optimal break times
- **Multi-language summarisation** — detect page language and set `outputLanguage` accordingly in the Summarizer API

---

*All data stored locally. No ads. No tracking of the tracker.*
