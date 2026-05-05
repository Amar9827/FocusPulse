// content.js — Page text extraction
//
// Runs in the context of every webpage.
// Listens for a "getPageText" message from the popup and returns
// the cleaned main text content of the current page.
//
// We never send this to any server — it goes only to popup.js
// which runs it through the on-device Summarizer API locally.

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== "getPageText") return;

  try {
    // Clone the document so we can safely remove elements
    const clone = document.cloneNode(true);

    // Remove noise elements — scripts, styles, nav, ads, footers
    const noiseSelectors = [
      "script", "style", "noscript", "iframe",
      "nav", "header", "footer", "aside",
      "[role='banner']", "[role='navigation']", "[role='complementary']",
      ".ad", ".ads", ".advertisement", ".sidebar", ".cookie-banner",
      ".popup", ".modal", ".newsletter-signup",
    ];
    noiseSelectors.forEach(sel => {
      clone.querySelectorAll(sel).forEach(el => el.remove());
    });

    // Try to find the main content area first
    const mainSelectors = [
      "main", "article", "[role='main']",
      ".content", ".post", ".article-body",
      ".page-content", ".entry-content", ".post-body",
      "#content", "#main", "#article",
    ];
    let textEl = null;
    for (const sel of mainSelectors) {
      const el = clone.querySelector(sel);
      // Only use it if it has meaningful text
      if (el && el.innerText?.trim().length > 50) {
        textEl = el;
        break;
      }
    }

    // Fall back to body if no main content found
    const rawText = (textEl || clone.body)?.innerText || document.body.innerText || "";

    // Clean up whitespace and truncate to ~8000 chars (Gemini Nano context limit)
    const cleaned = rawText
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim()
      .slice(0, 8000);

    // If still very short, try getting ALL text from the page as last resort
    const finalText = cleaned.length < 50
      ? document.body.innerText.replace(/\s+/g, " ").trim().slice(0, 8000)
      : cleaned;

    sendResponse({
      text:   finalText,
      title:  document.title,
      url:    window.location.href,
      length: finalText.length,
    });

  } catch (err) {
    sendResponse({ error: err.message });
  }

  return true; // Keep channel open for async response
});
