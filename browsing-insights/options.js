// options.js — Task 3.4: Settings Page
//
// Handles four independent sections:
//   1. Display name
//   2. OpenRouter API key + model selection
//   3. Domain blocklist
//   4. Data management (export / delete all)
//
// All data lives in chrome.storage.local — nothing is synced to any server.
// The API key is stored as plain text locally. It's no less secure than a
// .env file, and significantly more private than any cloud sync option.

// ─── Helpers ─────────────────────────────────────────────────────────────────

function showStatus(el, message, isError = false) {
  el.textContent  = message;
  el.className    = `status ${isError ? "err" : "ok"}`;
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 3000);
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

// ─── 1. Display name ─────────────────────────────────────────────────────────

const nameInput  = document.getElementById("name-input");
const nameSave   = document.getElementById("name-save");
const nameStatus = document.getElementById("name-status");

chrome.storage.local.get(["userName"], (r) => {
  if (r.userName) nameInput.value = r.userName;
});

nameSave.addEventListener("click", () => {
  const name = nameInput.value.trim();
  if (!name) { showStatus(nameStatus, "Please enter a name.", true); return; }
  chrome.storage.local.set({ userName: name }, () => {
    showStatus(nameStatus, "✓ Name saved");
  });
});

nameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") nameSave.click();
});

// ─── 2. OpenRouter API key + model ───────────────────────────────────────────

const keyInput   = document.getElementById("key-input");
const keyToggle  = document.getElementById("key-toggle");
const keySave    = document.getElementById("key-save");
const keyStatus  = document.getElementById("key-status");
const modelSelect= document.getElementById("model-select");
const modelSave  = document.getElementById("model-save");
const modelStatus= document.getElementById("model-status");

// Load saved values
chrome.storage.local.get(["openrouterKey", "openrouterModel"], (r) => {
  if (r.openrouterKey) {
    keyInput.value = r.openrouterKey;
  }
  // Default to Llama if no model saved yet, or if openrouter/free was previously saved
  const savedModel = r.openrouterModel;
  if (!savedModel || savedModel === "openrouter/free") {
    modelSelect.value = "meta-llama/llama-3.3-70b-instruct:free";
    chrome.storage.local.set({ openrouterModel: "meta-llama/llama-3.3-70b-instruct:free" });
  } else {
    modelSelect.value = savedModel;
  }
});

// Show/hide key
keyToggle.addEventListener("click", () => {
  const isPassword = keyInput.type === "password";
  keyInput.type    = isPassword ? "text" : "password";
  keyToggle.textContent = isPassword ? "🙈" : "👁";
});

// Save key
keySave.addEventListener("click", () => {
  const key = keyInput.value.trim();
  if (!key) {
    showStatus(keyStatus, "Please enter an API key.", true);
    return;
  }
  if (!key.startsWith("sk-or-")) {
    showStatus(keyStatus, "That doesn't look like an OpenRouter key (should start with sk-or-)", true);
    return;
  }
  chrome.storage.local.set({ openrouterKey: key }, () => {
    showStatus(keyStatus, "✓ API key saved — AI insights enabled");
    // Notify background that key is now available
    chrome.runtime.sendMessage({ type: "settingsUpdated" });
  });
});

// Save model
modelSave.addEventListener("click", () => {
  const model = modelSelect.value;
  chrome.storage.local.set({ openrouterModel: model }, () => {
    showStatus(modelStatus, `✓ Model set to ${modelSelect.options[modelSelect.selectedIndex].text.split(" —")[0]}`);
  });
});

// ─── 2b. Groq API key ────────────────────────────────────────────────────────

const groqInput  = document.getElementById("groq-input");
const groqToggle = document.getElementById("groq-toggle");
const groqSave   = document.getElementById("groq-save");
const groqStatus = document.getElementById("groq-status");

chrome.storage.local.get(["groqKey"], (r) => {
  if (r.groqKey) groqInput.value = r.groqKey;
});

groqToggle.addEventListener("click", () => {
  const isPassword   = groqInput.type === "password";
  groqInput.type     = isPassword ? "text" : "password";
  groqToggle.textContent = isPassword ? "🙈" : "👁";
});

groqSave.addEventListener("click", () => {
  const key = groqInput.value.trim();
  if (!key) {
    showStatus(groqStatus, "Please enter a Groq API key.", true);
    return;
  }
  if (!key.startsWith("gsk_")) {
    showStatus(groqStatus, "That doesn't look like a Groq key (should start with gsk_)", true);
    return;
  }
  chrome.storage.local.set({ groqKey: key }, () => {
    showStatus(groqStatus, "✓ Groq key saved — will be used for insights");
    chrome.runtime.sendMessage({ type: "settingsUpdated" });
  });
});

// ─── 3. Domain blocklist ──────────────────────────────────────────────────────

const blocklistInput  = document.getElementById("blocklist-input");
const blocklistAdd    = document.getElementById("blocklist-add");
const blocklistTags   = document.getElementById("blocklist-tags");
const blocklistStatus = document.getElementById("blocklist-status");

let blocklist = [];

function renderBlocklist() {
  blocklistTags.innerHTML = "";
  blocklist.forEach((domain) => {
    const tag = document.createElement("div");
    tag.className = "tag";
    tag.innerHTML = `
      <span>${domain}</span>
      <button class="tag-remove" data-domain="${domain}" title="Remove">×</button>
    `;
    blocklistTags.appendChild(tag);
  });
}

function saveBlocklist() {
  chrome.storage.local.set({ blocklist }, () => {
    chrome.runtime.sendMessage({ type: "settingsUpdated" });
  });
}

// Load existing blocklist
chrome.storage.local.get(["blocklist"], (r) => {
  blocklist = r.blocklist || [];
  renderBlocklist();
});

// Add domain
blocklistAdd.addEventListener("click", () => {
  let domain = blocklistInput.value.trim().toLowerCase();

  // Strip protocol and paths — just keep the domain
  try { domain = new URL(domain.startsWith("http") ? domain : `https://${domain}`).hostname; }
  catch { /* keep as-is */ }
  domain = domain.replace(/^www\./, "");

  if (!domain) { showStatus(blocklistStatus, "Enter a domain first.", true); return; }
  if (blocklist.includes(domain)) {
    showStatus(blocklistStatus, `${domain} is already blocked.`, true);
    return;
  }

  blocklist.push(domain);
  saveBlocklist();
  renderBlocklist();
  blocklistInput.value = "";
  showStatus(blocklistStatus, `✓ ${domain} added to blocklist`);
});

blocklistInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") blocklistAdd.click();
});

// Remove domain
blocklistTags.addEventListener("click", (e) => {
  const domain = e.target.dataset.domain;
  if (!domain) return;
  blocklist = blocklist.filter((d) => d !== domain);
  saveBlocklist();
  renderBlocklist();
  showStatus(blocklistStatus, `✓ ${domain} removed`);
});

// ─── 4. Data management ───────────────────────────────────────────────────────

const storageStats       = document.getElementById("storage-stats");
const exportTodayBtn     = document.getElementById("export-today-btn");
const exportAllBtn       = document.getElementById("export-all-btn");
const deleteSessionsBtn  = document.getElementById("delete-sessions-btn");
const deleteAllBtn       = document.getElementById("delete-all-btn");
const dataStatus         = document.getElementById("data-status");

// Load storage stats
function loadStorageStats() {
  chrome.runtime.sendMessage({ type: "getStorageStats" }, (r) => {
    if (!r) { storageStats.textContent = "Could not load stats."; return; }
    storageStats.innerHTML = `
      <strong>${(r.bytesUsed / 1024).toFixed(1)} KB</strong> used of 10 MB limit
      &nbsp;·&nbsp; <strong>${r.daysStored}</strong> day(s) stored
      &nbsp;·&nbsp; <strong>${r.totalSessions}</strong> total sessions<br>
      Oldest: ${r.oldestDay || "—"} &nbsp;·&nbsp; Newest: ${r.newestDay || "—"}<br>
      30-day auto-cleanup: <strong>on</strong>
    `;
  });
}

loadStorageStats();

// Helper: trigger a JSON file download
function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Export today only
exportTodayBtn.addEventListener("click", () => {
  const dayKey = `sessions_${todayKey()}`;
  chrome.storage.local.get([dayKey], (r) => {
    const sessions = r[dayKey] || [];
    if (sessions.length === 0) {
      showStatus(dataStatus, "No sessions recorded today yet.", true);
      return;
    }
    downloadJSON(sessions, `browsing-insights-${todayKey()}.json`);
    showStatus(dataStatus, `✓ Exported ${sessions.length} sessions`);
  });
});

// Export all days
exportAllBtn.addEventListener("click", () => {
  chrome.storage.local.get(null, (allData) => {
    const export_ = {};
    let totalSessions = 0;
    Object.keys(allData).forEach(key => {
      if (key.match(/^sessions_\d{4}-\d{2}-\d{2}$/)) {
        export_[key] = allData[key];
        totalSessions += allData[key].length;
      }
    });
    if (totalSessions === 0) {
      showStatus(dataStatus, "No sessions to export.", true);
      return;
    }
    downloadJSON(export_, `browsing-insights-all-${todayKey()}.json`);
    showStatus(dataStatus, `✓ Exported ${totalSessions} sessions across ${Object.keys(export_).length} day(s)`);
  });
});

// Delete sessions only — keeps API keys, settings, and domain cache
deleteSessionsBtn.addEventListener("click", () => {
  const confirmed = window.confirm(
    "This will delete all browsing session data and insights.\n\nYour API keys, settings, and category cache will be kept.\n\nAre you sure?"
  );
  if (!confirmed) return;

  chrome.storage.local.get(null, (allData) => {
    const keysToDelete = Object.keys(allData).filter(k =>
      k.match(/^sessions_/) || k.match(/^insights_/) || k === "activeSession"
    );
    chrome.storage.local.remove(keysToDelete, () => {
      showStatus(dataStatus, `✓ Deleted ${keysToDelete.length} session/insights record(s)`);
      loadStorageStats();
    });
  });
});

// Delete everything — full reset
deleteAllBtn.addEventListener("click", () => {
  const confirmed = window.confirm(
    "This will permanently delete EVERYTHING — sessions, insights, API keys, settings, and category cache.\n\nThe extension will be reset to factory defaults.\n\nAre you sure?"
  );
  if (!confirmed) return;

  chrome.storage.local.clear(() => {
    showStatus(dataStatus, "✓ All data deleted — extension reset");
    loadStorageStats();
    blocklist = [];
    renderBlocklist();
    nameInput.value      = "";
    keyInput.value       = "";
    groqInput.value      = "";
    blocklistInput.value = "";
  });
});

// ─── 5. Category classifier ───────────────────────────────────────────────────
//
// Shows domains sitting in "Other" from today's sessions.
// User picks a category → saved to domainCache → applied on next popup open.

const unknownList      = document.getElementById("unknown-domains-list");
const classifierDomain = document.getElementById("classifier-domain");
const classifierCat    = document.getElementById("classifier-cat");
const classifierAdd    = document.getElementById("classifier-add");
const classifierStatus = document.getElementById("classifier-status");
const classifierSaved  = document.getElementById("classifier-saved");
const classifierTags   = document.getElementById("classifier-tags");

const CAT_LABELS = {
  coding:"💻 Coding & Dev", cloud:"☁️ Cloud & DevOps", ai_tools:"🤖 AI Tools",
  project_mgmt:"📋 Project Mgmt", docs:"📝 Docs & Writing", comms:"💬 Communication",
  reading:"📖 Reading", news:"📰 News", social:"📱 Social Media",
  video:"▶️ Video", shopping:"🛒 Shopping", sports:"🏏 Sports",
  finance:"💰 Finance", learning:"🎓 Learning", other:"🌐 Other",
};

function renderCustomClassifications(cache) {
  // Show only user-added entries (not auto-generated ones)
  const custom = Object.entries(cache).filter(([, v]) => typeof v === "object" && v.userDefined);
  if (custom.length === 0) {
    classifierSaved.classList.add("hidden");
    return;
  }
  classifierSaved.classList.remove("hidden");
  classifierTags.innerHTML = "";
  custom.forEach(([domain, entry]) => {
    const tag = document.createElement("div");
    tag.className = "classifier-tag";
    tag.innerHTML = `
      <span>${domain} → ${CAT_LABELS[entry.category] || entry.category}</span>
      <button class="tag-remove" data-domain="${domain}" title="Remove">×</button>
    `;
    classifierTags.appendChild(tag);
  });
}

function saveClassification(domain, category) {
  chrome.storage.local.get(["domainCache"], (r) => {
    const cache = r.domainCache || {};
    // Store as object with userDefined flag so we can distinguish from LLM-cached entries
    cache[domain] = { category, userDefined: true };
    chrome.storage.local.set({ domainCache: cache }, () => {
      // Trigger reclassify so popup charts update immediately
      chrome.runtime.sendMessage({ type: "reclassifyToday" });
      renderCustomClassifications(cache);
    });
  });
}

// Load unknown domains from today's sessions
function loadUnknownDomains() {
  const dayKey = `sessions_${todayKey()}`;
  chrome.storage.local.get([dayKey, "domainCache"], (r) => {
    const sessions = r[dayKey] || [];
    const cache    = r.domainCache || {};

    // Find domains classified as "other" that don't have a user-defined override
    const domainTime = {};
    sessions.forEach(s => {
      if (!domainTime[s.domain]) domainTime[s.domain] = 0;
      domainTime[s.domain] += s.duration;
    });

    const unknowns = Object.entries(domainTime)
      .filter(([domain]) => {
        const cached = cache[domain];
        // Show if: not in cache, or cached as plain "other" string (not user-defined)
        if (!cached) return s => s.category?.category === "other";
        if (typeof cached === "string") return cached === "other";
        if (typeof cached === "object") return cached.category === "other" && !cached.userDefined;
        return false;
      })
      .filter(([domain]) => {
        // Double-check: is it actually showing as "other" in sessions?
        return sessions.some(s => s.domain === domain && s.category?.category === "other");
      })
      .sort((a, b) => b[1] - a[1])  // Sort by time spent descending
      .slice(0, 15);

    renderCustomClassifications(cache);

    if (unknowns.length === 0) {
      unknownList.innerHTML = `<div class="classifier-loading">✓ All sites are categorised</div>`;
      return;
    }

    unknownList.innerHTML = "";
    unknowns.forEach(([domain, secs]) => {
      const mins = secs >= 60 ? `${Math.floor(secs/60)}m` : `${secs}s`;
      const row  = document.createElement("div");
      row.className = "unknown-domain-row";
      row.innerHTML = `
        <span class="unknown-domain-name">${domain}</span>
        <span class="unknown-domain-time">${mins}</span>
        <select class="unknown-domain-select" data-domain="${domain}">
          ${Object.entries(CAT_LABELS).map(([val, lbl]) =>
            `<option value="${val}">${lbl}</option>`
          ).join("")}
        </select>
        <button class="unknown-domain-save" data-domain="${domain}">Save</button>
      `;
      unknownList.appendChild(row);
    });
  });
}

// Save button on each unknown domain row
unknownList.addEventListener("click", (e) => {
  if (!e.target.classList.contains("unknown-domain-save")) return;
  const domain   = e.target.dataset.domain;
  const select   = unknownList.querySelector(`select[data-domain="${domain}"]`);
  const category = select?.value;
  if (!domain || !category) return;

  saveClassification(domain, category);
  e.target.textContent = "✓ Saved";
  e.target.disabled    = true;
  showStatus(classifierStatus, `✓ ${domain} → ${CAT_LABELS[category]}`);
});

// Manual add form
classifierAdd.addEventListener("click", () => {
  let domain = classifierDomain.value.trim().toLowerCase();
  try {
    domain = new URL(domain.startsWith("http") ? domain : `https://${domain}`).hostname;
  } catch {}
  domain = domain.replace(/^www\./, "");

  if (!domain) { showStatus(classifierStatus, "Enter a domain first.", true); return; }

  const category = classifierCat.value;
  saveClassification(domain, category);
  classifierDomain.value = "";
  showStatus(classifierStatus, `✓ ${domain} → ${CAT_LABELS[category]}`);
  loadUnknownDomains();
});

classifierDomain.addEventListener("keydown", (e) => {
  if (e.key === "Enter") classifierAdd.click();
});

// Remove custom classification
classifierTags.addEventListener("click", (e) => {
  const domain = e.target.dataset.domain;
  if (!domain) return;
  chrome.storage.local.get(["domainCache"], (r) => {
    const cache = r.domainCache || {};
    delete cache[domain];
    chrome.storage.local.set({ domainCache: cache }, () => {
      chrome.runtime.sendMessage({ type: "reclassifyToday" });
      renderCustomClassifications(cache);
      showStatus(classifierStatus, `✓ ${domain} classification removed`);
      loadUnknownDomains();
    });
  });
});

// Initial load
loadUnknownDomains();
