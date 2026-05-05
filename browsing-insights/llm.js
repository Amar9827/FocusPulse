// llm.js — Task 4.1: OpenRouter Integration
//
// THREE JOBS IN THIS FILE:
//
//  1. classifyUnknownDomains(domains)
//     Sends a batch of unrecognised domains to the LLM and caches results
//     in chrome.storage so each domain is only ever classified once.
//
//  2. generateDailyInsights(stats)
//     Sends the aggregated day summary to the LLM and returns a structured
//     insights object: narrative, patterns, suggestion, highlights.
//
//  3. getApiConfig()
//     Reads the API key and model from chrome.storage.
//     All LLM calls route through this so there's one place to update.
//
// PRIVACY NOTE:
//   We never send raw URLs or page titles to the LLM.
//   Domain classification sends only bare domain names ("github.com").
//   Daily insights sends only pre-aggregated stats (category totals, counts).

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const GROQ_URL       = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL  = "meta-llama/llama-3.3-70b-instruct:free";
const GROQ_MODEL     = "llama-3.3-70b-versatile";  // Groq's model ID for Llama 3.3 70B

// ─────────────────────────────────────────────────────────────────────────────
// ROBUST JSON EXTRACTOR
//
// Many free models ignore "respond only with JSON" and add:
//   - <think>...</think> reasoning blocks (DeepSeek R1)
//   - ```json ... ``` markdown fences
//   - Preamble like "Here is the JSON:" before the object
//   - Postamble like "Let me know if..." after the object
//
// Strategy: strip known wrappers, then find the first { ... } or [ ... ]
// that parses as valid JSON.
// ─────────────────────────────────────────────────────────────────────────────

function extractJSON(raw) {
  if (!raw || typeof raw !== "string") throw new Error("Empty response");

  // Step 1: Strip <think>...</think> blocks (DeepSeek R1 reasoning)
  let text = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

  // Step 2: Strip markdown code fences
  text = text.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "").trim();

  // Step 3: Try parsing the whole cleaned string first
  try { return JSON.parse(text); } catch {}

  // Step 4: Find the outermost { } block
  const objStart = text.indexOf("{");
  const objEnd   = text.lastIndexOf("}");
  if (objStart !== -1 && objEnd > objStart) {
    try { return JSON.parse(text.slice(objStart, objEnd + 1)); } catch {}
  }

  // Step 5: Find the outermost [ ] block (for array responses)
  const arrStart = text.indexOf("[");
  const arrEnd   = text.lastIndexOf("]");
  if (arrStart !== -1 && arrEnd > arrStart) {
    try { return JSON.parse(text.slice(arrStart, arrEnd + 1)); } catch {}
  }

  // Step 6: Log the raw response for debugging and give up
  console.error("[llm] Could not extract JSON from response:", text.slice(0, 200));
  throw new Error("No valid JSON found in response");
}

// ─────────────────────────────────────────────────────────────────────────────
// CORE: Read API config from storage
// ─────────────────────────────────────────────────────────────────────────────

function getApiConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["openrouterKey", "openrouterModel", "groqKey"], (r) => {
      // Prefer Groq if a Groq key is set — it's more reliable on the free tier
      if (r.groqKey) {
        resolve({ key: r.groqKey, model: GROQ_MODEL, provider: "groq" });
      } else {
        resolve({
          key:      r.openrouterKey   || null,
          model:    r.openrouterModel || DEFAULT_MODEL,
          provider: "openrouter",
        });
      }
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// CORE: Single LLM call — used by both jobs below
// ─────────────────────────────────────────────────────────────────────────────

async function callLLM(systemPrompt, userPrompt, config) {
  const isGroq = config.provider === "groq";
  const url    = isGroq ? GROQ_URL : OPENROUTER_URL;
  const model  = isGroq ? GROQ_MODEL : config.model;

  const headers = {
    "Content-Type":  "application/json",
    "Authorization": `Bearer ${config.key}`,
  };
  // OpenRouter requires these extra headers
  if (!isGroq) {
    headers["HTTP-Referer"] = "chrome-extension://browsing-insights";
    headers["X-Title"]      = "Browsing Insights";
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      max_tokens: 800,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userPrompt   },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`${isGroq ? "Groq" : "OpenRouter"} ${response.status}: ${err}`);
  }

  const data      = await response.json();
  const msg       = data.choices?.[0]?.message?.content || "";
  const usedModel = data.model || model;
  console.log("[llm] Response from", usedModel, "| length:", msg.length, "chars");
  return msg;
}

// ─────────────────────────────────────────────────────────────────────────────
// JOB 1: Hybrid domain classifier
//
// Flow:
//   1. Check domainCache in storage for already-classified domains
//   2. Send only genuinely unknown ones to the LLM
//   3. Merge results back into the cache
//   4. Return the full resolved map { domain → category }
// ─────────────────────────────────────────────────────────────────────────────

async function classifyUnknownDomains(unknownDomains) {
  if (!unknownDomains || unknownDomains.length === 0) return {};

  const config = await getApiConfig();
  if (!config.key) {
    console.log("[llm] No API key — skipping domain classification");
    const stored = await new Promise(r => chrome.storage.local.get(["domainCache"], r));
    return stored.domainCache || {};
  }

  // Load existing cache — skip anything already classified
  const stored = await new Promise(r => chrome.storage.local.get(["domainCache"], r));
  const cache  = stored.domainCache || {};
  const toClassify = unknownDomains.filter(d => {
    const cached = cache[d];
    if (!cached) return true;
    // Skip user-defined entries — never overwrite user choices
    if (typeof cached === "object" && cached.userDefined) return false;
    // Re-classify plain "other" strings — they may not have been classified properly
    return cached === "other" || (typeof cached === "object" && cached.category === "other");
  });

  if (toClassify.length === 0) {
    console.log("[llm] All unknown domains already cached");
    return cache;
  }

  console.log("[llm] Classifying", toClassify.length, "domain(s):", toClassify);

  // ── Simple one-word-per-line format — no JSON, no parsing complexity ────────
  //
  // Prompt asks for exactly one category word per line, matching the domain order.
  // Response: "coding\nother\nfinance\n..."
  // Much more reliable than JSON across all models.

  const VALID_CATS = new Set([
    "coding","cloud","ai_tools","project_mgmt","docs","comms",
    "reading","news","social","video","shopping","sports","finance","learning","other"
  ]);

  const systemPrompt = `You are a website classifier. Given a list of domains, respond with exactly one category word per line in the same order.

Valid categories (use exactly as written):
coding, cloud, ai_tools, project_mgmt, docs, comms, reading, news, social, video, shopping, sports, finance, learning, other

Rules:
- One word per line, nothing else
- No numbers, no dots, no explanations
- If unsure, write: other`;

  const userPrompt = `Classify these domains, one category per line:\n${toClassify.join("\n")}`;

  try {
    const raw   = await callLLM(systemPrompt, userPrompt, config);
    const lines = raw.trim().split("\n").map(l => l.trim().toLowerCase());

    console.log("[llm] Raw classification response:", raw.trim());

    // Zip domains with responses — if counts mismatch, fill remainder with "other"
    toClassify.forEach((domain, i) => {
      const cat = lines[i] && VALID_CATS.has(lines[i]) ? lines[i] : "other";
      // Only cache if not user-defined
      if (!(typeof cache[domain] === "object" && cache[domain].userDefined)) {
        cache[domain] = cat;
      }
      console.log("[llm] Classified:", domain, "→", cat);
    });

    await new Promise(r => chrome.storage.local.set({ domainCache: cache }, r));
    console.log("[llm] Domain cache updated");
    return cache;

  } catch (err) {
    console.error("[llm] Domain classification failed:", err.message);
    return cache;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BUILT-IN FALLBACK: Chrome's on-device Summarizer API (Gemini Nano)
//
// Available in Chrome 138+ on devices with supported hardware.
// Runs entirely locally — no API key, no internet, no cost.
// Produces a simpler plain-text summary rather than structured JSON,
// since Gemini Nano is less capable at structured output than cloud models.
//
// Availability check:
//   "readily"   → model is downloaded and ready
//   "after-download" → will download on first use (~1-2 min)
//   "no"        → not supported on this device/Chrome version
// ─────────────────────────────────────────────────────────────────────────────

async function generateWithBuiltInSummarizer(stats, date) {
  // Chrome's window.ai.summarizer is only available in page/popup contexts,
  // not in service workers. We handle the no-key case in the popup UI instead.
  console.log("[built-in] Not available in service worker context — add an API key in Settings");
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// JOB 2: Generate daily insights narrative
//
// Sends a compact, privacy-safe summary to the LLM.
// Returns a structured insights object saved to storage.
// ─────────────────────────────────────────────────────────────────────────────

async function generateDailyInsights(stats, date) {
  if (!stats || stats.sessionCount === 0) {
    console.log("[llm] No sessions to analyse");
    return null;
  }

  const config = await getApiConfig();

  // If no API key is set, try Chrome's built-in on-device Summarizer (Gemini Nano)
  // This runs entirely locally — no internet, no key, no cost.
  // Available in Chrome 138+ on supported hardware.
  if (!config.key) {
    console.log("[llm] No API key — trying built-in Chrome Summarizer");
    return await generateWithBuiltInSummarizer(stats, date);
  }

  console.log("[llm] Generating daily insights for", date);

  // Build a compact, readable summary to send — no raw URLs, no titles
  const categoryLines = stats.byCategory
    .map(c => `  - ${c.label}: ${c.fmtTime} (${c.percent}%)`)
    .join("\n");

  const topDomainLines = stats.topDomains
    .slice(0, 5)
    .map(d => `  - ${d.domain}: ${d.fmtTime} (${d.visits} visits)`)
    .join("\n");

  const systemPrompt = `You are a productivity coach. You output ONLY raw JSON — no markdown, no backticks, no thinking blocks, no explanation, no text outside the JSON object.

Be warm, specific, and data-driven. Every insight must reference something specific from the numbers provided.
Speak directly to the person as "you". Never mention being an AI.

Critical: Your entire response must be a single valid JSON object starting with { and ending with }. Nothing else.`;

  const userPrompt = `Here is my browsing summary for ${date}:

Total active time: ${stats.fmtTotalTime}
Sessions: ${stats.sessionCount}
Focus score: ${stats.focusScore}/100 (${stats.focusLabel.label})
Context switches per hour: ${stats.contextSwitches}
Longest focus block: ${stats.longestFocusBlock.fmtTime} on ${stats.longestFocusBlock.domain}
Peak activity hour: ${stats.peakHour.label}

Time by category:
${categoryLines}

Top sites:
${topDomainLines}

Output this exact JSON object (fill in the values, keep the keys exactly as shown):
{"narrative":"...","patterns":["...","...","..."],"suggestion":"...","highlight":"...","focusVerdict":"..."}

Rules:
- narrative: 2-3 sentences, reference actual numbers from the data above
- patterns: exactly 3 strings, each a specific observation from the data
- suggestion: one actionable thing to do differently tomorrow
- highlight: the single most interesting or surprising thing in the data
- focusVerdict: one sentence about overall focus quality

JSON output:`;

  try {
    const raw     = await callLLM(systemPrompt, userPrompt, config);
    const insights = extractJSON(raw);

    // Attach metadata
    insights.generatedAt = Date.now();
    insights.date        = date;
    insights.model       = config.model;
    insights.focusScore  = stats.focusScore;

    // Save to storage keyed by date
    await new Promise(r =>
      chrome.storage.local.set({ [`insights_${date}`]: insights }, r)
    );

    console.log("[llm] Insights saved for", date);
    return insights;

  } catch (err) {
    console.error("[llm] Insights generation failed:", err.message);
    return { error: err.message, generatedAt: Date.now() };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// JOB 3: Run both jobs together — called by the daily alarm
// ─────────────────────────────────────────────────────────────────────────────

async function runDailyAI(sessions, stats, date) {
  console.log("[llm] Starting daily AI run for", date);

  // Step 1: Classify unknown domains first so stats reflect better categories
  if (stats.unknownDomains.length > 0) {
    await classifyUnknownDomains(stats.unknownDomains);
  }

  // Step 2: Generate narrative insights
  const insights = await generateDailyInsights(stats, date);
  return insights;
}
