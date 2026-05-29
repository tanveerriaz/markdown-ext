const statusEl = document.getElementById("status");
const tabTitleEl = document.getElementById("tabTitle");
const convertBtn = document.getElementById("convertBtn");
const postActionsEl = document.getElementById("postActions");
const copyBtn = document.getElementById("copyBtn");
const downloadBtn = document.getElementById("downloadBtn");
const markdownPreviewEl = document.getElementById("markdownPreview");

const TRACKING_IMG_RE =
  /bat\.bing\.com|doubleclick|facebook\.com\/tr|google-analytics|\/1x1[./]|pixel\.|tracking/i;

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

/**
 * @param {{ title?: string, url?: string, pageType?: string, extractedAt?: string }} meta
 */
function buildFrontmatter(meta) {
  const title = escapeYamlValue(meta.title || "page");
  const url = escapeYamlValue(meta.url || "");
  const pageType = escapeYamlValue(meta.pageType || "article");
  const extractedAt = escapeYamlValue(meta.extractedAt || new Date().toISOString());

  return [
    "---",
    `title: ${title}`,
    `url: ${url}`,
    `page_type: ${pageType}`,
    `extracted_at: ${extractedAt}`,
    "---",
  ].join("\n");
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
 * @param {{ title?: string, url?: string, pageType?: string, extractedAt?: string }} meta
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

  return service;
}

async function convertActiveTab() {
  setStatus("Converting…");
  setBusy(true);

  try {
    const tab = await getActiveTab();
    if (!tab?.id) throw new Error("No active tab found.");

    const resp = await chrome.tabs.sendMessage(tab.id, { type: "GET_CLEAN_HTML" });
    if (!resp) throw new Error("No response from content script.");
    if (resp.error) throw new Error(resp.error);

    const extractedTitle = String(resp.title || "").trim();
    lastTitle = extractedTitle || tab.title || "page";

    const html = String(resp.html || "");
    const turndown = getTurndownService();
    const rawMarkdown = turndown.turndown(html);

    const markdown = prepareAgentMarkdown(rawMarkdown, {
      title: lastTitle,
      url: tab.url || resp.url || "",
      pageType: resp.pageType || "article",
      extractedAt: new Date().toISOString(),
    });

    lastMarkdown = markdown;
    if (markdownPreviewEl) markdownPreviewEl.value = markdown || "";

    if (postActionsEl) postActionsEl.classList.toggle("hidden", !markdown);

    const warning = String(resp.warning || "").trim();
    if (warning) {
      setStatus(warning, true);
    } else {
      setStatus(markdown ? "Ready" : "No content found.");
    }
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
