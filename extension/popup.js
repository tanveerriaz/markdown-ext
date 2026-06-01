const statusEl = document.getElementById("status");
const tabTitleEl = document.getElementById("tabTitle");
const convertBtn = document.getElementById("convertBtn");
const postActionsEl = document.getElementById("postActions");
const copyBtn = document.getElementById("copyBtn");
const downloadBtn = document.getElementById("downloadBtn");
const markdownPreviewEl = document.getElementById("markdownPreview");

const TRACKING_IMG_RE =
  /bat\.bing\.com|doubleclick|facebook\.com\/tr|google-analytics|\/1x1[./]|pixel\.|tracking/i;

const MAX_OUTPUT_WORDS = 80000;
const LARGE_PAGE_WARNING = "Large page; output truncated.";
const EXTRACTION_TIMEOUT_MS = 25000;
const EXTRACTION_TIMEOUT_MESSAGE =
  "Conversion timed out. Try selecting specific content on the page, then convert again.";
const SPARSE_CONTENT_HINT =
  "No readable content on this view. Open the item you want (e.g. select an email), then convert again.";
const LOW_QUALITY_WORD_THRESHOLD = 100;
const LOW_QUALITY_WARNING =
  "Limited content captured; open the item you want on the page, then convert again.";

let lastMarkdown = "";
let lastTitle = "";

function setStatus(msg, isWarning = false) {
  if (!statusEl) return;
  statusEl.textContent = msg ?? "";
  statusEl.classList.toggle("status--warn", Boolean(isWarning && msg));
}

function setBusy(isBusy) {
  if (convertBtn) convertBtn.disabled = isBusy;
  if (copyBtn) copyBtn.disabled = isBusy || !lastMarkdown;
  if (downloadBtn) downloadBtn.disabled = isBusy || !lastMarkdown;
}

function sanitizeFilename(title) {
  const base = (title || "page")
    .trim()
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 140)
    .trim();

  return (base || "page") + ".md";
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab;
}

/** @param {string} message */
function formatExtractionError(message) {
  const msg = String(message || "").trim();
  if (msg === "No readable content found") return SPARSE_CONTENT_HINT;
  if (/extraction not available in this frame/i.test(msg)) {
    return "Content script not ready. Refresh the page, then convert again.";
  }
  if (/could not establish connection/i.test(msg)) {
    return "Content script not ready. Refresh the page, then convert again.";
  }
  return msg || "Conversion failed.";
}

/**
 * @template T
 * @param {Promise<T>} promise
 * @param {number} ms
 * @param {string} message
 * @returns {Promise<T>}
 */
function withTimeout(promise, ms, message) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

function normalizeMarkdown(markdown) {
  return String(markdown || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\s*#+\s*$/gm, "")
    .trim();
}

function escapeYamlValue(value) {
  const s = String(value ?? "");
  if (/[:#\n"'&*]/.test(s) || s.startsWith(" ") || s.endsWith(" ")) {
    return JSON.stringify(s);
  }
  return s;
}

function escapeHtmlAttr(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * @param {{ title?: string, url?: string, pageType?: string, extractedAt?: string, sources?: string[] }} meta
 */
function buildFrontmatter(meta) {
  const lines = [
    "---",
    `title: ${escapeYamlValue(meta.title || "page")}`,
    `url: ${escapeYamlValue(meta.url || "")}`,
    `page_type: ${escapeYamlValue(meta.pageType || "article")}`,
    `extracted_at: ${escapeYamlValue(meta.extractedAt || new Date().toISOString())}`,
  ];

  const sources = Array.isArray(meta.sources)
    ? [...new Set(meta.sources.filter(Boolean))]
    : [];
  if (sources.length > 0) {
    lines.push("sources:");
    for (const source of sources) {
      lines.push(`  - ${escapeYamlValue(source)}`);
    }
  }

  lines.push("---");
  return lines.join("\n");
}

function countWordsInHtml(html) {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const text = (doc.body?.textContent || "").replace(/\s+/g, " ").trim();
  return text ? text.split(/\s+/).filter(Boolean).length : 0;
}

/** @param {string} markdown */
function countMarkdownBodyWords(markdown) {
  const body = String(markdown || "").replace(/^---[\s\S]*?---\s*/m, "").trim();
  if (!body) return 0;
  return body.split(/\s+/).filter(Boolean).length;
}

/**
 * Trim oversized HTML before Turndown (prefer dropping augment sections first).
 * @returns {{ html: string, truncated: boolean }}
 */
function guardLargeHtml(html) {
  const doc = new DOMParser().parseFromString(`<div id="root">${html}</div>`, "text/html");
  const root = doc.getElementById("root");
  if (!root) return { html, truncated: false };

  let truncated = false;

  const wordCount = () => countWordsInHtml(root.innerHTML);

  while (wordCount() > MAX_OUTPUT_WORDS) {
    const augment = root.querySelector(".md-ext-augment:last-of-type, section.embedded-frame:last-of-type");
    if (augment) {
      augment.remove();
      truncated = true;
      continue;
    }
    break;
  }

  if (wordCount() > MAX_OUTPUT_WORDS) {
    const text = (root.textContent || "").replace(/\s+/g, " ").trim();
    const words = text.split(/\s+/).filter(Boolean);
    const trimmed = words.slice(0, MAX_OUTPUT_WORDS).join(" ");
    root.textContent = `${trimmed}\n\n[… truncated …]`;
    truncated = true;
  }

  return { html: root.innerHTML.trim(), truncated };
}

function collapseDuplicateLinkLabels(text) {
  return text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, label, dest) => {
    const words = label.trim().split(/\s+/);
    if (words.length >= 2 && words.length % 2 === 0) {
      const half = words.length / 2;
      const first = words.slice(0, half).join(" ");
      const second = words.slice(half).join(" ");
      if (first.toLowerCase() === second.toLowerCase()) {
        return `[${first}](${dest})`;
      }
    }
    return match;
  });
}

function stripBrokenLinks(markdown) {
  return markdown
    .replace(/\[([^\]]+)\]\(#null[^)]*\)/gi, "$1")
    .replace(/\[([^\]]+)\]\(#"\)/gi, "$1")
    .replace(/\[([^\]]+)\]\(#\)/g, "$1");
}

function removeTrackingImageLines(markdown) {
  return markdown
    .split("\n")
    .filter((line) => {
      const img = line.match(/!\[[^\]]*\]\(([^)]+)\)/);
      if (!img) return true;
      return !TRACKING_IMG_RE.test(img[1]);
    })
    .join("\n");
}

function dedupeRepeatedHeadings(markdown) {
  const lines = markdown.split("\n");
  const seen = new Set();
  const out = [];

  for (let i = 0; i < lines.length; ) {
    const line = lines[i];
    const heading = line.match(/^##\s+(.+)$/);
    if (heading) {
      const key = heading[1].trim().toLowerCase();
      if (seen.has(key)) {
        i += 1;
        while (i < lines.length && !/^##\s+/.test(lines[i])) i += 1;
        continue;
      }
      seen.add(key);
    }
    out.push(line);
    i += 1;
  }

  return out.join("\n");
}

function collapseLeadingNavBullets(markdown) {
  const lines = markdown.split("\n");
  let index = 0;
  const navLines = [];

  while (index < lines.length) {
    const trimmed = lines[index].trim();
    if (trimmed === "") {
      index += 1;
      continue;
    }

    const navMatch = trimmed.match(/^-\s+\[([^\]]{1,20})\]\([^)]+\)/);
    if (navMatch) {
      navLines.push(lines[index]);
      index += 1;
      continue;
    }
    break;
  }

  if (navLines.length <= 12) return markdown;

  const rest = lines.slice(index).join("\n").trimStart();
  return `> Nav: ${navLines.length} links omitted.\n\n${rest}`;
}

/**
 * @param {string} markdown
 * @param {{ title?: string, url?: string, pageType?: string, extractedAt?: string, sources?: string[] }} meta
 */
function prepareAgentMarkdown(markdown, meta) {
  let body = normalizeMarkdown(markdown);
  body = removeTrackingImageLines(body);
  body = stripBrokenLinks(body);
  body = collapseDuplicateLinkLabels(body);
  body = dedupeRepeatedHeadings(body);
  body = collapseLeadingNavBullets(body);
  body = normalizeMarkdown(body);

  const frontmatter = buildFrontmatter(meta);
  return body ? `${frontmatter}\n\n${body}` : frontmatter;
}

function getTurndownService() {
  if (typeof TurndownService !== "function") {
    throw new Error("TurndownService not found. Is turndown.min.js loaded?");
  }

  const service = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    emDelimiter: "_",
    blankReplacement: () => "",
  });

  service.addRule("skipTrackingImages", {
    filter(node) {
      if (node.nodeName !== "IMG") return false;
      const src = node.getAttribute("src") || "";
      return TRACKING_IMG_RE.test(src);
    },
    replacement() {
      return "";
    },
  });

  service.addRule("preserveEmbeddedFramesSection", {
    filter(node) {
      return (
        node.nodeName === "SECTION" &&
        (node.classList?.contains("embedded-frames") ||
          node.classList?.contains("embedded-frame"))
      );
    },
    replacement(content) {
      return `\n\n${content.trim()}\n\n`;
    },
  });

  service.addRule("preserveTablesAndCode", {
    filter(node) {
      const name = node.nodeName;
      return name === "TABLE" || name === "PRE" || name === "CODE";
    },
    replacement(content, node) {
      if (node.nodeName === "TABLE") {
        return `\n\n${content.trim()}\n\n`;
      }
      return content;
    },
  });

  return service;
}

/**
 * @param {chrome.scripting.InjectionResult[]} injectionResults
 * @returns {object | null}
 */
function mergeFrameExtractions(injectionResults) {
  const payloads = injectionResults
    .map((entry) => entry?.result)
    .filter((result) => result && typeof result === "object");

  const top = payloads.find((p) => p.isTop);
  if (!top) {
    const best = payloads
      .filter((p) => p.html && String(p.html).trim())
      .sort((a, b) => String(b.html).length - String(a.html).length)[0];
    return best || null;
  }
  if (top.error && !top.html) {
    const bestChild = payloads
      .filter((p) => !p.isTop && p.html && String(p.html).trim())
      .sort((a, b) => String(b.html).length - String(a.html).length)[0];
    if (bestChild) {
      return {
        ...bestChild,
        isTop: true,
        iframeOrder: top.iframeOrder || [],
      };
    }
    return null;
  }

  const iframeOrder = Array.isArray(top.iframeOrder) ? top.iframeOrder : [];
  const sources = new Set(Array.isArray(top.sources) ? top.sources : []);

  let html = String(top.html || "");
  const warnings = [top.warning].filter(Boolean);

  const children = payloads
    .filter((p) => !p.isTop && p.html && String(p.html).trim())
    .sort((a, b) => {
      const urlA = String(a.url || "");
      const urlB = String(b.url || "");
      const idxA = iframeOrder.indexOf(urlA);
      const idxB = iframeOrder.indexOf(urlB);
      if (idxA === -1 && idxB === -1) return urlA.localeCompare(urlB);
      if (idxA === -1) return 1;
      if (idxB === -1) return -1;
      return idxA - idxB;
    });

  for (const child of children) {
    const childUrl = String(child.url || "");
    if (childUrl && html.includes(childUrl)) continue;

    const frameUrl = escapeHtmlAttr(childUrl);
    const frameTitle = escapeHtmlAttr(child.title || childUrl || "Embedded frame");
    html += [
      `<section class="embedded-frame">`,
      `<h2>Embedded content (frame)</h2>`,
      `<p>Source: <a href="${frameUrl}">${frameTitle}</a></p>`,
      String(child.html),
      `</section>`,
    ].join("\n");
    sources.add("frame");
  }

  return {
    ...top,
    html,
    sources: Array.from(sources),
    warning: warnings.filter(Boolean).join(" ") || top.warning,
  };
}

async function runFrameExtraction(tabId, allFrames) {
  const results = await chrome.scripting.executeScript({
    target: { tabId, allFrames },
    world: "ISOLATED",
    func: () => {
      if (typeof globalThis.markdownConvertExtractFrame === "function") {
        return globalThis.markdownConvertExtractFrame();
      }
      return {
        error: "Extraction not available in this frame",
        html: "",
        isTop: window === window.top,
        url: location.href,
        sources: [],
      };
    },
  });

  return mergeFrameExtractions(results);
}

async function extractFromTab(tabId) {
  /** @type {object | null} */
  let topPayload = null;

  try {
    topPayload = await chrome.tabs.sendMessage(tabId, { type: "GET_CLEAN_HTML" });
  } catch {
    topPayload = null;
  }

  if (topPayload?.html) {
    const iframeOrder = Array.isArray(topPayload.iframeOrder) ? topPayload.iframeOrder : [];
    if (iframeOrder.length > 0 && chrome.scripting?.executeScript) {
      try {
        const withFrames = await runFrameExtraction(tabId, true);
        if (withFrames?.html) return withFrames;
      } catch {
        // Use top-frame payload only.
      }
    }
    return topPayload;
  }

  if (chrome.scripting?.executeScript) {
    try {
      let merged = await runFrameExtraction(tabId, true);
      if (merged?.html) return merged;
      merged = await runFrameExtraction(tabId, false);
      if (merged?.html) return merged;
    } catch {
      // Fall back to message result or error below.
    }
  }

  if (topPayload?.error && !topPayload.html) throw new Error(topPayload.error);
  if (topPayload) return topPayload;

  throw new Error("Content script not ready. Refresh the page, then convert again.");
}

async function convertActiveTab() {
  setStatus("Converting…");
  setBusy(true);

  try {
    const tab = await getActiveTab();
    if (!tab?.id) throw new Error("No active tab found.");

    const resp = await withTimeout(
      extractFromTab(tab.id),
      EXTRACTION_TIMEOUT_MS,
      EXTRACTION_TIMEOUT_MESSAGE,
    );
    if (!resp) throw new Error("No response from content script.");
    if (resp.error && !resp.html) throw new Error(resp.error);

    const extractedTitle = String(resp.title || "").trim();
    lastTitle = extractedTitle || tab.title || "page";

    let html = String(resp.html || "");
    const { html: guardedHtml, truncated } = guardLargeHtml(html);
    html = guardedHtml;

    const turndown = getTurndownService();
    const rawMarkdown = turndown.turndown(html);

    const markdown = prepareAgentMarkdown(rawMarkdown, {
      title: lastTitle,
      url: tab.url || resp.url || "",
      pageType: resp.pageType || "article",
      extractedAt: new Date().toISOString(),
      sources: resp.sources,
    });

    lastMarkdown = markdown;
    if (markdownPreviewEl) markdownPreviewEl.value = markdown || "";

    if (postActionsEl) postActionsEl.classList.toggle("hidden", !markdown);

    const bodyWords = countMarkdownBodyWords(markdown);
    const isLowQuality =
      bodyWords > 0 &&
      bodyWords < LOW_QUALITY_WORD_THRESHOLD &&
      (resp.pageType === "sparse" || String(resp.pageType || "") === "listing");

    const warnings = [
      String(resp.warning || "").trim(),
      isLowQuality ? LOW_QUALITY_WARNING : "",
      truncated ? LARGE_PAGE_WARNING : "",
    ]
      .filter(Boolean)
      .join(" ");

    if (warnings) {
      setStatus(warnings, true);
    } else {
      setStatus(markdown ? "Ready" : "No content found.");
    }
  } catch (err) {
    lastMarkdown = "";
    if (markdownPreviewEl) markdownPreviewEl.value = "";
    if (postActionsEl) postActionsEl.classList.add("hidden");
    setStatus(formatExtractionError(err?.message ?? err), true);
  } finally {
    setBusy(false);
  }
}

async function copyMarkdown() {
  if (!lastMarkdown) return;

  try {
    await navigator.clipboard.writeText(lastMarkdown);
    setStatus("Copied");
  } catch {
    if (!markdownPreviewEl) throw new Error("Preview element not found.");
    markdownPreviewEl.removeAttribute("readonly");
    markdownPreviewEl.select();
    document.execCommand("copy");
    markdownPreviewEl.setAttribute("readonly", "true");
    setStatus("Copied");
  }
}

function downloadMarkdown() {
  if (!lastMarkdown) return;

  const blob = new Blob([lastMarkdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = sanitizeFilename(lastTitle);
  a.click();

  setTimeout(() => URL.revokeObjectURL(url), 2500);
  setStatus("Downloaded");
}

async function init() {
  setBusy(false);
  setStatus("");

  try {
    const tab = await getActiveTab();
    lastTitle = tab?.title || "";
    if (tabTitleEl) {
      tabTitleEl.textContent = lastTitle || "(untitled tab)";
      tabTitleEl.title = lastTitle || "";
    }
  } catch (err) {
    setStatus(String(err?.message ?? err));
  }
}

convertBtn?.addEventListener("click", () => void convertActiveTab());
copyBtn?.addEventListener("click", () => void copyMarkdown());
downloadBtn?.addEventListener("click", () => downloadMarkdown());

void init();
