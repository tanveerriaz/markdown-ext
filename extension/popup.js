const statusEl = document.getElementById("status");
const tabTitleEl = document.getElementById("tabTitle");
const convertBtn = document.getElementById("convertBtn");
const postActionsEl = document.getElementById("postActions");
const copyBtn = document.getElementById("copyBtn");
const downloadBtn = document.getElementById("downloadBtn");
const markdownPreviewEl = document.getElementById("markdownPreview");

let lastMarkdown = "";
let lastTitle = "";

function setStatus(msg) {
  if (statusEl) statusEl.textContent = msg ?? "";
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

function getTurndownService() {
  if (typeof TurndownService !== "function") {
    throw new Error("TurndownService not found. Is turndown.min.js loaded?");
  }

  const service = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    emDelimiter: "_",
  });

  return service;
}

async function convertActiveTab() {
  setStatus("Converting…");
  setBusy(true);

  try {
    const tab = await getActiveTab();
    if (!tab?.id) throw new Error("No active tab found.");

    lastTitle = tab.title || "page";

    const resp = await chrome.tabs.sendMessage(tab.id, { type: "GET_CLEAN_HTML" });
    if (!resp) throw new Error("No response from content script.");
    if (resp.error) throw new Error(resp.error);

    const html = String(resp.html || "");
    const turndown = getTurndownService();
    const markdown = turndown.turndown(html).trim();

    lastMarkdown = markdown;
    if (markdownPreviewEl) markdownPreviewEl.value = markdown || "";

    if (postActionsEl) postActionsEl.classList.toggle("hidden", !markdown);
    setStatus(markdown ? "Ready" : "No content found.");
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
    // Fallback for environments where clipboard API is blocked.
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
