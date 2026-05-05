// popup.js — Task 3.3: Dashboard with Charts
//
// Renders today's aggregated stats into three visualisations:
//   1. Donut chart — time per category (drawn on <canvas>)
//   2. Bar chart   — activity by hour  (drawn on <canvas>)
//   3. Top domains — horizontal bar list
// All charts are drawn with vanilla Canvas API — no external libraries needed.

// ─── Category colours ────────────────────────────────────────────────────────
const CAT_COLOURS = {
  coding:       "#1a73e8",
  cloud:        "#0ea5e9",
  ai_tools:     "#8b5cf6",
  project_mgmt: "#f59e0b",
  docs:         "#10b981",
  comms:        "#06b6d4",
  reading:      "#6366f1",
  news:         "#f97316",
  social:       "#ec4899",
  video:        "#ef4444",
  shopping:     "#84cc16",
  sports:       "#f43f5e",
  finance:      "#14b8a6",
  learning:     "#f59e0b",
  other:        "#d1d5db",
};

// ─── DOM refs ────────────────────────────────────────────────────────────────
const greetingEl       = document.getElementById("greeting");
const trackingPill     = document.getElementById("tracking-pill");
const loadingEl        = document.getElementById("loading");
const emptyEl          = document.getElementById("empty");
const dashboardEl      = document.getElementById("dashboard");
const refreshBtn       = document.getElementById("refresh-btn");
const focusScoreEl     = document.getElementById("focus-score");
const focusLabelEl     = document.getElementById("focus-label");
const statTimeEl       = document.getElementById("stat-time");
const statSessionsEl   = document.getElementById("stat-sessions");
const statSwitchesEl   = document.getElementById("stat-switches");
const donutCanvas      = document.getElementById("donut-chart");
const donutLegendEl    = document.getElementById("donut-legend");
const barCanvas        = document.getElementById("bar-chart");
const peakHourLabelEl  = document.getElementById("peak-hour-label");
const topDomainsEl     = document.getElementById("top-domains");
const focusBlockText   = document.getElementById("focus-block-text");
const focusBlockSub    = document.getElementById("focus-block-sub");
const lastUpdatedEl    = document.getElementById("last-updated");
const storageInfoEl    = document.getElementById("storage-info");

// ─── Show / hide states ──────────────────────────────────────────────────────
function showState(state) {
  loadingEl.classList.toggle("hidden",   state !== "loading");
  emptyEl.classList.toggle("hidden",     state !== "empty");
  dashboardEl.classList.toggle("hidden", state !== "dashboard");
}

// ─── Tracking pill ───────────────────────────────────────────────────────────
function updatePill(idleState) {
  const map = {
    active: { text: "● tracking", cls: "pill-active"  },
    idle:   { text: "● paused",   cls: "pill-idle"    },
    locked: { text: "● locked",   cls: "pill-locked"  },
  };
  const { text, cls } = map[idleState] || map.idle;
  trackingPill.textContent = text;
  trackingPill.className   = `pill ${cls}`;
}

// ─── Donut chart ─────────────────────────────────────────────────────────────
function drawDonut(categories) {
  const ctx  = donutCanvas.getContext("2d");
  const cx   = 70, cy = 70, r = 54, inner = 34;
  const total = categories.reduce((s, c) => s + c.secs, 0);
  ctx.clearRect(0, 0, 140, 140);

  if (total === 0) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.arc(cx, cy, inner, 0, Math.PI * 2, true);
    ctx.fillStyle = "#f3f4f6";
    ctx.fill();
    return;
  }

  let angle = -Math.PI / 2;
  categories.forEach((cat) => {
    const slice = (cat.secs / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, angle, angle + slice);
    ctx.closePath();
    ctx.fillStyle = CAT_COLOURS[cat.category] || "#d1d5db";
    ctx.fill();
    angle += slice;
  });

  // Punch inner hole
  ctx.beginPath();
  ctx.arc(cx, cy, inner, 0, Math.PI * 2);
  ctx.fillStyle = "#fff";
  ctx.fill();

  // Centre label
  ctx.fillStyle  = "#111";
  ctx.font       = "bold 15px -apple-system, sans-serif";
  ctx.textAlign  = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(fmtSecs(total), cx, cy);

  // Legend
  donutLegendEl.innerHTML = "";
  categories.slice(0, 6).forEach((cat) => {
    const item = document.createElement("div");
    item.className = "legend-item";
    item.innerHTML = `
      <span class="legend-dot" style="background:${CAT_COLOURS[cat.category] || "#d1d5db"}"></span>
      <span>${cat.emoji} ${cat.label}</span>
      <span class="legend-pct">${cat.percent}%</span>
    `;
    donutLegendEl.appendChild(item);
  });
}

// ─── Bar chart ────────────────────────────────────────────────────────────────
function drawBars(hourlyData, peakHour) {
  const ctx    = barCanvas.getContext("2d");
  const W      = barCanvas.offsetWidth || 332;
  const H      = 80;
  barCanvas.width  = W;
  barCanvas.height = H;
  ctx.clearRect(0, 0, W, H);

  const max      = Math.max(...hourlyData, 1);
  const barW     = Math.floor(W / 24) - 1;
  const maxBarH  = H - 18;   // leave room for hour labels

  hourlyData.forEach((secs, hour) => {
    const barH   = Math.round((secs / max) * maxBarH);
    const x      = hour * (barW + 1);
    const y      = maxBarH - barH;
    const isPeak = hour === peakHour;

    // Bar
    ctx.fillStyle = isPeak ? "#1a73e8" : "#bfdbfe";
    if (barH > 0) {
      ctx.beginPath();
      ctx.roundRect(x, y, barW, barH, 2);
      ctx.fill();
    }

    // Hour label every 3 hours (0, 3, 6 ... 21)
    if (hour % 3 === 0) {
      ctx.fillStyle    = isPeak ? "#1a73e8" : "#9ca3af";
      ctx.font         = "9px -apple-system, sans-serif";
      ctx.textAlign    = "left";
      ctx.textBaseline = "bottom";
      const label = hour === 0 ? "12a" : hour < 12 ? `${hour}a` : hour === 12 ? "12p" : `${hour-12}p`;
      ctx.fillText(label, x, H);
    }
  });
}

// ─── Top domains list ─────────────────────────────────────────────────────────
function renderTopDomains(domains) {
  topDomainsEl.innerHTML = "";
  const maxSecs = domains[0]?.secs || 1;
  domains.forEach((d) => {
    const pct  = Math.round((d.secs / maxSecs) * 100);
    const row  = document.createElement("div");
    row.className = "domain-row";
    row.innerHTML = `
      <span class="domain-name" title="${d.domain}">${d.domain}</span>
      <div class="domain-bar-wrap">
        <div class="domain-bar" style="width:${pct}%"></div>
      </div>
      <span class="domain-time">${d.fmtTime}</span>
    `;
    topDomainsEl.appendChild(row);
  });
}

// ─── Render full dashboard ────────────────────────────────────────────────────
function renderDashboard(stats, idleState) {
  if (!stats || stats.sessionCount === 0) {
    showState("empty");
    return;
  }

  showState("dashboard");

  // Stats row
  focusScoreEl.textContent = stats.focusScore;
  // Apply colour class based on score range
  const scoreClass =
    stats.focusScore >= 80 ? "focus-score-great"    :
    stats.focusScore >= 60 ? "focus-score-good"     :
    stats.focusScore >= 40 ? "focus-score-moderate" :
    stats.focusScore >= 20 ? "focus-score-low"      : "focus-score-poor";
  focusScoreEl.className = `focus-number ${scoreClass}`;
  focusLabelEl.textContent = stats.focusLabel.label;
  statTimeEl.textContent       = stats.fmtTotalTime;
  statSessionsEl.textContent   = stats.sessionCount;
  statSwitchesEl.textContent   = stats.contextSwitches;

  // Charts
  drawDonut(stats.byCategory);
  drawBars(stats.hourlyBreakdown, stats.peakHour.hour);

  // Peak hour label
  peakHourLabelEl.textContent = stats.peakHour.secs > 0
    ? `· peak at ${stats.peakHour.label}`
    : "";

  // Top domains
  renderTopDomains(stats.topDomains);

  // Longest focus block
  if (stats.longestFocusBlock.secs > 0) {
    focusBlockText.textContent = `Longest focus: ${stats.longestFocusBlock.fmtTime} on ${stats.longestFocusBlock.domain}`;
    focusBlockSub.textContent  = stats.longestFocusBlock.title.slice(0, 60);
    document.getElementById("focus-block-section").classList.remove("hidden");
  } else {
    document.getElementById("focus-block-section").classList.add("hidden");
  }

  // Tracking pill
  updatePill(idleState);

  // Footer
  lastUpdatedEl.textContent = "Updated " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ─── Load data from background ────────────────────────────────────────────────
function loadData() {
  refreshBtn.classList.add("spinning");
  showState("loading");

  // Fire both requests in parallel
  let sessionsResult = null;
  let idleResult     = null;

  function tryRender() {
    if (sessionsResult === null || idleResult === null) return;
    renderDashboard(sessionsResult, idleResult);
    refreshBtn.classList.remove("spinning");
  }

  chrome.runtime.sendMessage({ type: "getSessions" }, (r) => {
    sessionsResult = r?.stats || null;
    tryRender();
  });

  chrome.runtime.sendMessage({ type: "getIdleState" }, (r) => {
    idleResult = r?.idleState || "active";
    tryRender();
  });

  // Storage info in footer
  chrome.runtime.sendMessage({ type: "getStorageStats" }, (r) => {
    if (!r) return;
    storageInfoEl.textContent =
      `${(r.bytesUsed / 1024).toFixed(1)} KB · ${r.daysStored} day(s) stored`;
  });
}

// ─── Greeting ────────────────────────────────────────────────────────────────
chrome.storage.local.get(["userName"], (result) => {
  const name = result.userName;
  const hour = new Date().getHours();
  const tod  = hour < 12 ? "Morning" : hour < 17 ? "Afternoon" : "Evening";
  greetingEl.textContent = name ? `${tod}, ${name}` : "Browsing Insights";
});

// ─── Refresh button ───────────────────────────────────────────────────────────
refreshBtn.addEventListener("click", loadData);

// ─── Auto-refresh pill every 5s ──────────────────────────────────────────────
setInterval(() => {
  chrome.runtime.sendMessage({ type: "getIdleState" }, (r) => {
    if (r?.idleState) updatePill(r.idleState);
  });
}, 5000);

// ─── Show next auto-generation time ──────────────────────────────────────────
chrome.alarms.get("daily-insights", (alarm) => {
  if (alarm) {
    const next = new Date(alarm.scheduledTime);
    const timeStr = next.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const dateStr = next.toDateString() === new Date().toDateString()
      ? `today at ${timeStr}`
      : `tomorrow at ${timeStr}`;
    lastUpdatedEl.title = `Auto-generates ${dateStr}`;
  }
});

// ─── Initial load ─────────────────────────────────────────────────────────────
// Re-classify today's sessions on every popup open so new category additions
// take effect immediately without needing a manual console command.
chrome.runtime.sendMessage({ type: "reclassifyToday" }, () => {
  loadData();
});

// ─── Helper (mirrors aggregator.js — needed in popup context) ─────────────────
function fmtSecs(secs) {
  if (secs < 60)   return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// ─── Settings button ──────────────────────────────────────────────────────────
document.getElementById("settings-btn").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

// ─── Task 4.1: AI Insights panel ─────────────────────────────────────────────

const insightsSection  = document.getElementById("insights-section");
const insightsLoading  = document.getElementById("insights-loading");
const insightsContent  = document.getElementById("insights-content");
const insightsError    = document.getElementById("insights-error");
const insightsNarrative= document.getElementById("insights-narrative");
const insightsHighlight= document.getElementById("insights-highlight");
const insightsPatterns = document.getElementById("insights-patterns");
const insightsSuggestion=document.getElementById("insights-suggestion");
const insightsVerdict  = document.getElementById("insights-verdict");
const insightsModel    = document.getElementById("insights-model");
const generateWrap     = document.getElementById("generate-wrap");
const generateBtn      = document.getElementById("generate-btn");

function renderInsights(insights) {
  if (!insights) return;

  if (insights.error) {
    insightsError.textContent = "⚠ " + insights.error;
    insightsError.classList.remove("hidden");
    insightsContent.classList.add("hidden");
    insightsLoading.classList.add("hidden");
    generateBtn.textContent = "✨ Try again";
    generateBtn.disabled    = false;
    return;
  }

  // ── Model badge ────────────────────────────────────────────────────────────
  const rawModel   = insights.model || "";
  const shortModel = rawModel === "chrome-built-in (Gemini Nano)"
    ? "on-device · Gemini Nano"
    : rawModel.split("/").pop().replace(":free", "");

  // ── Age badge — show "X min ago" or "Xh ago" ─────────────────────────────
  let ageBadge = "";
  if (insights.generatedAt) {
    const mins = Math.round((Date.now() - insights.generatedAt) / 60000);
    ageBadge = mins < 1   ? "just now"
             : mins < 60  ? `${mins}m ago`
             : `${Math.floor(mins / 60)}h ago`;
  }

  // ── Build the card HTML with section labels and dividers ───────────────────
  insightsContent.querySelector(".insights-card").innerHTML = `
    <div class="insights-header">
      <span class="insights-icon">✨</span>
      <span class="insights-title">AI Insights</span>
      <span class="insights-model">${shortModel}</span>
      <span class="insights-age">${ageBadge}</span>
    </div>

    <div class="insights-section-label">Summary</div>
    <p class="insights-narrative">${insights.narrative || ""}</p>

    <div class="insights-divider"></div>
    <div class="insights-section-label">Highlight</div>
    <div class="insights-highlight">${insights.highlight || ""}</div>

    <div class="insights-divider"></div>
    <div class="insights-section-label">Patterns</div>
    <div class="insights-patterns">
      ${(insights.patterns || []).map(p =>
        `<div class="pattern-item">${p}</div>`
      ).join("")}
    </div>

    <div class="insights-divider"></div>
    <div class="insights-section-label">Tomorrow</div>
    <div class="insights-suggestion">${insights.suggestion || ""}</div>

    <div class="insights-verdict">${insights.focusVerdict || ""}</div>
  `;

  insightsLoading.classList.add("hidden");
  insightsContent.classList.remove("hidden");
  insightsError.classList.add("hidden");

  // Switch generate button to a less prominent regenerate style
  generateBtn.textContent = "↺ Regenerate insights";
  generateBtn.className   = "btn-regenerate";
  generateBtn.disabled    = false;
}

// Show skeleton loading state while generating
function showInsightsSkeleton() {
  insightsContent.querySelector(".insights-card").innerHTML = `
    <div class="insights-header">
      <span class="insights-icon">✨</span>
      <span class="insights-title">AI Insights</span>
      <span class="insights-model">generating…</span>
    </div>
    <div class="skeleton wide"></div>
    <div class="skeleton medium"></div>
    <div class="skeleton wide"></div>
    <div class="skeleton short"></div>
    <div class="skeleton wide"></div>
    <div class="skeleton medium"></div>
  `;
  insightsContent.classList.remove("hidden");
  insightsLoading.classList.add("hidden");
}

function loadInsights() {
  // Check if any API key is set
  chrome.storage.local.get(["openrouterKey", "groqKey"], (r) => {
    if (!r.openrouterKey && !r.groqKey) {
      // No key — show a nudge to add one
      insightsSection.classList.remove("hidden");
      insightsSection.innerHTML = `
        <div style="margin:0 14px 12px;padding:12px 14px;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;font-size:12px;color:#92400e;line-height:1.6">
          ✨ <strong>Add a free API key</strong> to generate AI insights about your browsing.<br>
          Go to <strong>⚙ Settings</strong> and add a Groq key (free, no card needed).
        </div>
      `;
      return;
    }

    // Key exists — show the section
    insightsSection.classList.remove("hidden");
    generateWrap.classList.remove("hidden");

    // Check if insights already exist for today
    chrome.runtime.sendMessage({ type: "getInsights" }, (res) => {
      if (res?.insights && !res.insights.error) {
        renderInsights(res.insights);
      }
      // If no insights yet, just show the generate button — don't auto-run
    });
  });
}

// Generate button — on-demand trigger
generateBtn.addEventListener("click", () => {
  generateBtn.disabled    = true;
  generateBtn.textContent = "Generating…";
  insightsError.classList.add("hidden");
  insightsSection.classList.remove("hidden");
  showInsightsSkeleton();

  chrome.runtime.sendMessage({ type: "generateInsights" }, (res) => {
    generateBtn.disabled    = false;
    generateBtn.textContent = "✨ Regenerate insights";
    insightsLoading.classList.add("hidden");

    if (res?.insights) {
      renderInsights(res.insights);
    } else {
      insightsError.textContent = "Failed to generate insights. Check your API key in settings.";
      insightsError.classList.remove("hidden");
    }
  });
});

// Load any existing insights on popup open
loadInsights();

// ─── Task 5.3: Page Summariser ────────────────────────────────────────────────
//
// Two-step flow:
//   1. Ask content.js for the page text (via chrome.tabs.sendMessage)
//   2. Summarise using window.Summarizer (on-device Gemini Nano) if available,
//      otherwise fall back to Groq API
//
// window.Summarizer IS available in popup context (unlike service workers).

const summariseBtn     = document.getElementById("summarise-btn");
const summariserSection= document.getElementById("summariser-section");
const summariserLoading= document.getElementById("summariser-loading");
const summariserStatus = document.getElementById("summariser-status");
const summariserOutput = document.getElementById("summariser-output");
const summariserError  = document.getElementById("summariser-error");
const summariserEngine = document.getElementById("summariser-engine");
const summariserClose  = document.getElementById("summariser-close");

function showSummariserState(state, text = "") {
  summariserLoading.classList.toggle("hidden", state !== "loading");
  summariserOutput.classList.toggle("hidden",  state !== "done");
  summariserError.classList.toggle("hidden",   state !== "error");
  if (state === "loading") summariserStatus.textContent = text || "Summarising…";
  if (state === "done")    summariserOutput.textContent = text;
  if (state === "error")   summariserError.textContent  = "⚠ " + text;
}

// Check if built-in Summarizer is available in this popup context
async function checkBuiltInAvailability() {
  if (!("Summarizer" in window)) return "unavailable";
  try {
    const avail = await window.Summarizer.availability();
    return avail; // "available", "downloadable", "downloading", "unavailable"
  } catch {
    return "unavailable";
  }
}

// Summarise using Chrome's built-in Gemini Nano
async function summariseWithBuiltIn(text, title) {
  summariserEngine.textContent = "on-device · Gemini Nano";
  showSummariserState("loading", "Starting on-device model…");

  const summarizer = await window.Summarizer.create({
    type:           "key-points",
    format:         "plain-text",
    length:         "medium",
    outputLanguage: "en",
    sharedContext:  `This is a webpage titled: ${title}`,
    monitor(m) {
      m.addEventListener("downloadprogress", (e) => {
        const pct = Math.round(e.loaded * 100);
        showSummariserState("loading", `Downloading model… ${pct}%`);
      });
    },
  });

  showSummariserState("loading", "Summarising…");
  const summary = await summarizer.summarize(text);
  summarizer.destroy();
  return summary;
}

// Summarise using Groq as fallback
async function summariseWithGroq(text, title) {
  summariserEngine.textContent = "llama-3.3-70b · Groq";
  showSummariserState("loading", "Calling Groq API…");

  return new Promise((resolve, reject) => {
    chrome.storage.local.get(["groqKey", "openrouterKey", "openrouterModel"], async (r) => {
      const isGroq = !!r.groqKey;
      const url    = isGroq
        ? "https://api.groq.com/openai/v1/chat/completions"
        : "https://openrouter.ai/api/v1/chat/completions";
      const key    = isGroq ? r.groqKey : r.openrouterKey;
      const model  = isGroq ? "llama-3.3-70b-versatile" : (r.openrouterModel || "meta-llama/llama-3.3-70b-instruct:free");

      if (!key) {
        reject(new Error("No API key set. Add a Groq key in Settings for page summaries."));
        return;
      }

      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type":  "application/json",
            "Authorization": `Bearer ${key}`,
          },
          body: JSON.stringify({
            model,
            max_tokens: 400,
            messages: [
              {
                role:    "system",
                content: "Summarise the following webpage content into 3-5 clear bullet points. If the page has limited content, summarise what is there concisely. Plain text only, no markdown, no preamble.",
              },
              {
                role:    "user",
                content: `Page title: ${title}\n\n${text.slice(0, 4000)}`,
              },
            ],
          }),
        });

        if (!response.ok) throw new Error(`API error ${response.status}`);
        const data = await response.json();
        resolve(data.choices?.[0]?.message?.content || "No summary returned.");
      } catch (err) {
        reject(err);
      }
    });
  });
}

summariseBtn.addEventListener("click", async () => {
  summariseBtn.disabled = true;
  summariserSection.classList.remove("hidden");
  showSummariserState("loading", "Reading page…");

  try {
    // Step 1: Get active tab and extract page text via content script
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab?.id || tab.url?.startsWith("chrome://") || tab.url?.startsWith("chrome-extension://")) {
      throw new Error("Cannot summarise this page — try a regular website.");
    }

    // Try sending message to content.js — if it's not injected yet, inject it first
    const pageData = await new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tab.id, { type: "getPageText" }, (response) => {
        if (chrome.runtime.lastError) {
          // Content script not running — inject it now then retry
          chrome.scripting.executeScript(
            { target: { tabId: tab.id }, files: ["content.js"] },
            () => {
              if (chrome.runtime.lastError) {
                reject(new Error("Could not inject content script: " + chrome.runtime.lastError.message));
                return;
              }
              // Brief delay for script to initialise, then retry
              setTimeout(() => {
                chrome.tabs.sendMessage(tab.id, { type: "getPageText" }, (response2) => {
                  if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
                  else if (response2?.error)    reject(new Error(response2.error));
                  else                          resolve(response2);
                });
              }, 200);
            }
          );
        } else if (response?.error) {
          reject(new Error(response.error));
        } else {
          resolve(response);
        }
      });
    });

    if (!pageData?.text || pageData.text.length < 30) {
      // Not an error — just show a friendly message and stop quietly
      showSummariserState("done", "Nothing to summarise on this page — it may be a login screen, image gallery, or app interface with no readable text.");
      summariseBtn.disabled = false;
      return;
    }

    // For short pages, note it but proceed
    if (pageData.text.length < 200) {
      console.log("[summariser] Short page (" + pageData.text.length + " chars) — summarising anyway");
    }

    console.log("[summariser] Page text extracted:", pageData.length, "chars from", pageData.url);

    // Step 2: Try built-in Summarizer first, fall back to Groq
    const builtInAvail = await checkBuiltInAvailability();
    console.log("[summariser] Built-in availability:", builtInAvail);

    let summary;
    if (builtInAvail === "available" || builtInAvail === "downloadable" || builtInAvail === "downloading") {
      try {
        summary = await summariseWithBuiltIn(pageData.text, pageData.title);
      } catch (err) {
        console.warn("[summariser] Built-in failed, falling back to Groq:", err.message);
        summary = await summariseWithGroq(pageData.text, pageData.title);
      }
    } else {
      summary = await summariseWithGroq(pageData.text, pageData.title);
    }

    showSummariserState("done", summary);

  } catch (err) {
    showSummariserState("error", err.message);
    console.error("[summariser] Error:", err.message);
  } finally {
    summariseBtn.disabled = false;
  }
});

summariserClose.addEventListener("click", () => {
  summariserSection.classList.add("hidden");
  showSummariserState("loading");
});
