const MIN_TEXT_LENGTH = 80;
const AUGMENT_MIN_BLOCK_CHARS = 40;
const MAX_CROSS_ORIGIN_IFRAME_STUBS = 20;
const MAX_SHADOW_DEPTH = 3;
const HOMEPAGE_SUBSECTION_MIN_CHARS = 15000;
const HOMEPAGE_SUBSECTION_MIN_RATIO = 0.3;

const PRE_STRIP_SELECTORS = [
  '[id*="onetrust" i]',
  '[class*="onetrust" i]',
  '[id*="cookie" i]',
  '[class*="cookie" i]',
  '[class*="consent" i]',
  '[class*="chat" i]',
  '[id*="chat" i]',
  '[class*="livechat" i]',
  "body > header",
  '[role="banner"]',
  'a[href="#"]',
  'a[href="#null"]',
  'a[href^="javascript:"]',
];

const GENERIC_REMOVE_SELECTORS = [
  "script",
  "style",
  "noscript",
  "iframe",
  "template",
  "nav",
  "footer",
  "aside",
  "dialog",
  "form",
  "button",
  "svg",
  "input",
  "select",
  "textarea",
  "label",
  '[role="navigation"]',
  '[role="banner"]',
  '[role="contentinfo"]',
  '[role="dialog"]',
  '[role="search"]',
  '[role="complementary"]',
  '[role="menu"]',
  '[role="toolbar"]',
  "[hidden]",
  '[aria-hidden="true"]',
  ".sr-only",
  ".sr-only-focusable",
  'a[href="#start-of-content"]',
  '[class*="modal" i]',
  '[class*="overlay" i]',
  '[class*="popup" i]',
  '[id*="onetrust" i]',
  '[class*="onetrust" i]',
  '[id*="cookie" i]',
  '[class*="cookie" i]',
  '[class*="consent" i]',
  '[class*="chat" i]',
  '[id*="chat" i]',
];

const FALLBACK_ROOT_SELECTORS = [
  "article",
  "main",
  '[role="main"]',
  "#content",
  "#main",
  ".post-content",
  ".article-content",
  ".entry-content",
  ".markdown-body",
];

const HOMEPAGE_WARNING =
  "Homepage detected; output may be long. Best results on article or doc pages.";

const YOUTUBE_LISTING_WARNING =
  "YouTube loads videos as you scroll. Scroll to load more videos on the page, then convert again.";

const YOUTUBE_VIDEO_LINK_SELECTORS = [
  "ytd-rich-item-renderer a#video-title-link",
  "ytd-grid-video-renderer a#video-title-link",
  "ytd-video-renderer a#video-title-link",
  "ytd-playlist-video-renderer a#video-title",
  "ytd-compact-video-renderer a#video-title",
  "yt-lockup-view-model a#video-title-link",
  "yt-lockup-view-model a#video-title",
  "a#video-title-link",
  "a#video-title",
];

const YOUTUBE_SIDEBAR_SELECTORS = [
  "ytd-guide-renderer",
  "ytd-mini-guide-renderer",
  "#guide",
  "#guide-content",
  "ytd-masthead",
  "#header",
  "ytd-playability-error-supported-renderers",
];

const YOUTUBE_GRID_ROOT_SELECTORS = [
  "ytd-rich-grid-renderer",
  "ytd-browse[page-subtype]",
  "ytd-tabbed-page-content",
  "#contents",
  "#primary",
  "ytd-section-list-renderer",
];

/** @param {ParentNode} el */
function getTextLength(el) {
  return (el.textContent || "").replace(/\s+/g, " ").trim().length;
}

/** @param {Element} el */
function hasMeaningfulText(el) {
  return getTextLength(el) >= MIN_TEXT_LENGTH;
}

/** @param {ParentNode} root @param {string[]} selectors */
function removeBySelectors(root, selectors) {
  for (const selector of selectors) {
    try {
      root.querySelectorAll(selector).forEach((el) => el.remove());
    } catch {
      // Skip unsupported selectors in older engines.
    }
  }
}

/** @param {Document} doc */
function preStripDocumentNoise(doc) {
  removeBySelectors(doc, PRE_STRIP_SELECTORS);
}

/** @param {ParentNode} root */
function removeEmptyAnchors(root) {
  root.querySelectorAll("a").forEach((anchor) => {
    const href = (anchor.getAttribute("href") || "").trim().toLowerCase();
    if (href === "#" || href === "#null" || href.startsWith("javascript:")) {
      const text = (anchor.textContent || "").replace(/\s+/g, " ").trim();
      if (text) {
        anchor.replaceWith(document.createTextNode(text));
      } else {
        anchor.remove();
      }
      return;
    }

    const text = (anchor.textContent || "").replace(/\s+/g, "").trim();
    const hasImg = anchor.querySelector("img");
    if (!text && !hasImg) anchor.remove();
  });
}

/** @param {ParentNode} root */
function removeShallowNavLists(root) {
  for (const list of root.querySelectorAll(":scope > ul, :scope > ol")) {
    const directLinkItems = Array.from(list.children).filter(
      (li) => li.querySelector(":scope > a") && getTextLength(li) < 80,
    );
    if (directLinkItems.length > 8) list.remove();
  }
}

const AUGMENT_REMOVE_SELECTORS = GENERIC_REMOVE_SELECTORS.filter((s) => s !== "iframe");

const VISIBLE_REGION_SELECTORS = [
  "main",
  '[role="main"]',
  "article",
  "section",
  ".content",
  "#content",
];

/** @param {ParentNode} root */
function applyGenericCleanup(root) {
  removeBySelectors(root, GENERIC_REMOVE_SELECTORS);
  removeShallowNavLists(root);
  removeEmptyAnchors(root);
}

/** @param {ParentNode} root */
function applyAugmentCleanup(root) {
  removeBySelectors(root, AUGMENT_REMOVE_SELECTORS);
  removeShallowNavLists(root);
  removeEmptyAnchors(root);
}

/** @param {string} text */
function normalizeTextForDedup(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * @param {string} blockText
 * @param {string} coreText
 */
function isDuplicateOfCore(blockText, coreText) {
  const block = normalizeTextForDedup(blockText);
  const core = normalizeTextForDedup(coreText);
  if (block.length < AUGMENT_MIN_BLOCK_CHARS) return true;
  if (!core) return false;
  if (core.includes(block)) return true;
  if (block.length > 200 && core.length > 200 && block.includes(core.slice(0, 500))) {
    return true;
  }

  const words = block.split(/\s+/).filter((w) => w.length > 3);
  if (words.length < 8) return core.includes(block);

  let hits = 0;
  for (const word of words) {
    if (core.includes(word)) hits += 1;
  }
  return hits / words.length > 0.85;
}

/** @param {Element} el */
function isElementVisible(el) {
  if (!(el instanceof Element)) return false;
  if (el.closest('[hidden], [aria-hidden="true"]')) return false;

  const style = getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return false;
  if (Number(style.opacity) === 0) return false;

  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

/** @param {HTMLIFrameElement} iframe */
function describeIframeStub(iframe) {
  const src = iframe.src || iframe.getAttribute("src") || "";
  const label =
    iframe.title?.trim() ||
    iframe.getAttribute("aria-label")?.trim() ||
    iframe.name?.trim() ||
    "Embedded frame";
  const safeSrc = escapeHtml(src || "(no URL)");
  const safeLabel = escapeHtml(label);
  if (src) {
    return `<p><strong>Embedded frame:</strong> <a href="${safeSrc}">${safeLabel}</a></p>`;
  }
  return `<p><strong>Embedded frame:</strong> ${safeLabel}</p>`;
}

/** @param {Document} doc */
function canAccessIframeDocument(iframe) {
  try {
    const childDoc = iframe.contentDocument;
    return Boolean(childDoc?.body && getTextLength(childDoc.body) >= AUGMENT_MIN_BLOCK_CHARS);
  } catch {
    return false;
  }
}

/**
 * @param {string} coreText
 * @returns {{ html: string, source: string }[]}
 */
function collectAugmentBlocks(coreText) {
  /** @type {{ html: string, source: string }[]} */
  const blocks = [];
  const doc = document;

  // Open shadow roots
  const shadowHost = document.createElement("div");
  shadowHost.setAttribute("data-source", "shadow");
  let shadowCount = 0;

  const visitShadow = (root, depth) => {
    if (depth > MAX_SHADOW_DEPTH) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    let node = walker.nextNode();
    while (node) {
      if (node instanceof Element && node.shadowRoot) {
        const clone = document.createElement("div");
        clone.appendChild(node.shadowRoot.cloneNode(true));
        applyAugmentCleanup(clone);
        const text = (clone.textContent || "").replace(/\s+/g, " ").trim();
        if (
          text.length >= AUGMENT_MIN_BLOCK_CHARS &&
          !isDuplicateOfCore(text, coreText)
        ) {
          const wrap = document.createElement("div");
          wrap.setAttribute("data-shadow-host", node.tagName.toLowerCase());
          wrap.appendChild(clone);
          shadowHost.appendChild(wrap);
          shadowCount += 1;
        }
        visitShadow(node.shadowRoot, depth + 1);
      }
      node = walker.nextNode();
    }
  };

  if (doc.body) visitShadow(doc.body, 0);
  if (shadowCount > 0) {
    blocks.push({ html: shadowHost.innerHTML, source: "shadow" });
  }

  // Same-origin iframe bodies
  for (const iframe of doc.querySelectorAll("iframe")) {
    if (!isElementVisible(iframe)) continue;
    if (!canAccessIframeDocument(iframe)) continue;

    try {
      const childDoc = iframe.contentDocument;
      if (!childDoc?.body) continue;
      const clone = document.createElement("div");
      clone.appendChild(childDoc.body.cloneNode(true));
      applyAugmentCleanup(clone);
      const text = (clone.textContent || "").replace(/\s+/g, " ").trim();
      if (text.length < AUGMENT_MIN_BLOCK_CHARS || isDuplicateOfCore(text, coreText)) {
        continue;
      }
      const src = iframe.src || "";
      blocks.push({
        html: `<h3>Embedded frame</h3><p>Source: <a href="${escapeHtml(src)}">${escapeHtml(src)}</a></p>${clone.innerHTML}`,
        source: "iframe",
      });
    } catch {
      // Cross-origin or sandboxed.
    }
  }

  // Visible regions not fully captured
  for (const selector of VISIBLE_REGION_SELECTORS) {
    try {
      doc.querySelectorAll(selector).forEach((el) => {
        if (!(el instanceof HTMLElement) || !isElementVisible(el)) return;
        if (getTextLength(el) < 120) return;

        const clone = el.cloneNode(true);
        applyAugmentCleanup(clone);
        const text = (clone.textContent || "").replace(/\s+/g, " ").trim();
        if (text.length < AUGMENT_MIN_BLOCK_CHARS || isDuplicateOfCore(text, coreText)) {
          return;
        }

        blocks.push({
          html: clone.innerHTML,
          source: "visible",
        });
      });
    } catch {
      // Skip invalid selectors.
    }
  }

  // Visible form fields (labels + values)
  const formParts = [];
  doc.querySelectorAll("input, select, textarea").forEach((field) => {
    if (!(field instanceof HTMLElement) || !isElementVisible(field)) return;
    const type = (field.getAttribute("type") || "").toLowerCase();
    if (type === "password" || type === "hidden") return;

    let label = "";
    const id = field.id;
    if (id) {
      const safeId = id.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      const labelEl = doc.querySelector(`label[for="${safeId}"]`);
      label = labelEl?.textContent?.trim() || "";
    }
    if (!label) {
      label = field.getAttribute("aria-label")?.trim() || field.getAttribute("name") || "";
    }

    let value = "";
    if (field instanceof HTMLSelectElement) {
      value = field.options[field.selectedIndex]?.text?.trim() || "";
    } else if (field instanceof HTMLInputElement) {
      if (field.type === "checkbox" || field.type === "radio") {
        value = field.checked ? "checked" : "unchecked";
      } else {
        value = field.value?.trim() || "";
      }
    } else if (field instanceof HTMLTextAreaElement) {
      value = field.value?.trim() || "";
    }

    if (!label && !value) return;
    formParts.push(
      `<li><strong>${escapeHtml(label || "Field")}:</strong> ${escapeHtml(value || "—")}</li>`,
    );
  });

  if (formParts.length > 0) {
    const formHtml = `<h3>Form fields</h3><ul>${formParts.join("")}</ul>`;
    if (!isDuplicateOfCore(formHtml, coreText)) {
      blocks.push({ html: formHtml, source: "forms" });
    }
  }

  // Cross-origin iframe stubs
  const stubParts = [];
  let stubCount = 0;
  for (const iframe of doc.querySelectorAll("iframe")) {
    if (stubCount >= MAX_CROSS_ORIGIN_IFRAME_STUBS) break;
    if (!isElementVisible(iframe)) continue;
    if (canAccessIframeDocument(iframe)) continue;
    stubParts.push(describeIframeStub(iframe));
    stubCount += 1;
  }

  if (stubParts.length > 0) {
    blocks.push({
      html: `<section class="embedded-frames"><h3>Embedded frames (external)</h3>${stubParts.join("")}</section>`,
      source: "iframe_stub",
    });
  }

  return blocks;
}

/**
 * @param {string} coreHtml
 * @param {string} coreText
 * @param {{ html: string, source: string }[]} augmentBlocks
 * @param {string[]} sources
 */
function mergeCoreAndAugment(coreHtml, coreText, augmentBlocks, sources) {
  const merged = document.createElement("div");
  merged.className = "markdown-ext-root";
  if (coreHtml) merged.innerHTML = coreHtml;

  const seenSources = new Set(sources);

  for (const block of augmentBlocks) {
    if (!block.html?.trim()) continue;
    const blockText = block.html.replace(/<[^>]+>/g, " ");
    if (isDuplicateOfCore(blockText, coreText)) continue;

    const section = document.createElement("section");
    section.className = "md-ext-augment";
    section.setAttribute("data-source", block.source);
    section.innerHTML = block.html;
    merged.appendChild(section);
    seenSources.add(block.source);
  }

  return {
    html: merged.innerHTML.trim(),
    sources: Array.from(seenSources),
  };
}

/**
 * @param {string} html
 * @returns {HTMLElement}
 */
function htmlToContainer(html) {
  const container = document.createElement("div");
  container.innerHTML = html;
  applyGenericCleanup(container);
  return container;
}

/**
 * @param {HTMLElement} container
 * @param {Document} doc
 * @returns {"article" | "homepage" | "sparse"}
 */
function detectPageType(container, doc) {
  const text = (container.textContent || "").replace(/\s+/g, " ").trim();
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words < 20) return "sparse";

  const anchors = container.querySelectorAll("a").length;
  const linkDensity = anchors / words;

  const paragraphText = Array.from(container.querySelectorAll("p"))
    .map((p) => p.textContent || "")
    .join(" ");
  const paragraphWords = paragraphText.split(/\s+/).filter(Boolean).length;
  const paragraphRatio = paragraphWords / words;

  const hasArticle = Boolean(doc.querySelector("article"));
  const sectionCount = doc.querySelectorAll("main section, body > section").length;

  if (linkDensity > 0.15 && paragraphRatio < 0.35) return "homepage";
  if (!hasArticle && sectionCount >= 4) return "homepage";

  return "article";
}

/**
 * @param {HTMLElement} container
 * @returns {HTMLElement}
 */
function isYouTubeHost() {
  const host = location.hostname.replace(/^www\./, "");
  return host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com";
}

/** @param {string} value */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** @param {string} href */
function isYouTubeVideoHref(href) {
  try {
    const url = new URL(href, location.origin);
    if (!url.hostname.includes("youtube.com")) return false;
    return (
      url.pathname === "/watch" ||
      url.pathname.startsWith("/shorts/") ||
      url.pathname.startsWith("/live/")
    );
  } catch {
    return false;
  }
}

/** @returns {{ name: string, handle: string, stats: string, description: string }} */
function getYouTubeChannelMeta() {
  const name =
    document
      .querySelector(
        "yt-dynamic-text-view-model h1, ytd-channel-name #text, #channel-name yt-formatted-string",
      )
      ?.textContent?.trim() ||
    document.querySelector('meta[property="og:title"]')?.getAttribute("content")?.trim() ||
    "";

  const handle =
    document
      .querySelector("#channel-handle, ytd-channel-handle, [id='handle']")
      ?.textContent?.trim() || "";

  const stats =
    document
      .querySelector(
        "#subscriber-count, yt-content-metadata-view-model, ytd-c4-tabbed-header-renderer #metadata",
      )
      ?.textContent?.replace(/\s+/g, " ")
      .trim() || "";

  const description =
    document
      .querySelector(
        "#description-container, ytd-text-inline-expander, yt-attributed-string#description",
      )
      ?.textContent?.replace(/\s+/g, " ")
      .trim() ||
    document.querySelector('meta[name="description"]')?.getAttribute("content")?.trim() ||
    "";

  return { name, handle, stats, description };
}

/**
 * @param {{ title: string, href: string, meta: string }[]} videos
 * @param {{ name: string, handle: string, stats: string, description: string }} meta
 */
function buildYouTubeListingHtml(videos, meta) {
  const parts = [];

  if (meta.name) parts.push(`<h1>${escapeHtml(meta.name)}</h1>`);
  if (meta.handle) parts.push(`<p><strong>${escapeHtml(meta.handle)}</strong></p>`);
  if (meta.stats) parts.push(`<p>${escapeHtml(meta.stats)}</p>`);
  if (meta.description) {
    parts.push(`<p>${escapeHtml(meta.description.slice(0, 2000))}</p>`);
  }

  if (videos.length > 0) {
    parts.push(`<h2>Videos (${videos.length})</h2>`);
    parts.push("<ul>");
    for (const video of videos) {
      const metaHtml = video.meta
        ? ` <span>(${escapeHtml(video.meta)})</span>`
        : "";
      parts.push(
        `<li><a href="${escapeHtml(video.href)}">${escapeHtml(video.title)}</a>${metaHtml}</li>`,
      );
    }
    parts.push("</ul>");
  }

  return parts.join("\n");
}

function isYouTubeWatchPage() {
  return location.pathname === "/watch" || location.search.includes("v=");
}

function isYouTubeListingPage() {
  const path = location.pathname;
  if (isYouTubeWatchPage()) return false;
  if (path.includes("/results") || path === "/feed/subscriptions") return false;

  return (
    path.includes("/@") ||
    path.startsWith("/channel/") ||
    path.startsWith("/c/") ||
    path.startsWith("/user/") ||
    /\/(videos|shorts|streams|playlists|featured|channels|about)$/.test(path)
  );
}

function isInsideYouTubeSidebar(el) {
  return YOUTUBE_SIDEBAR_SELECTORS.some((selector) => {
    try {
      return Boolean(el.closest(selector));
    } catch {
      return false;
    }
  });
}

function getYouTubeVideoGridRoot() {
  for (const selector of YOUTUBE_GRID_ROOT_SELECTORS) {
    const el = document.querySelector(selector);
    if (el && !isInsideYouTubeSidebar(el)) return el;
  }
  return document.querySelector("ytd-app") || document.body || document;
}

/** @param {HTMLAnchorElement} node */
function getYouTubeVideoTitle(node) {
  const fromAttr =
    node.getAttribute("title")?.trim() || node.getAttribute("aria-label")?.trim() || "";
  if (fromAttr && fromAttr.length > 2) return fromAttr;

  const formatted = node.querySelector("yt-formatted-string, .yt-formatted-string");
  const fromFormatted = (formatted?.textContent || "").replace(/\s+/g, " ").trim();
  if (fromFormatted.length > 2) return fromFormatted;

  return (node.textContent || "").replace(/\s+/g, " ").trim();
}

/** @param {HTMLAnchorElement} node */
function getYouTubeVideoMeta(node) {
  const row = node.closest(
    [
      "ytd-rich-item-renderer",
      "ytd-grid-video-renderer",
      "ytd-video-renderer",
      "ytd-playlist-video-renderer",
      "ytd-compact-video-renderer",
      "yt-lockup-view-model",
      "ytd-rich-grid-media",
    ].join(", "),
  );

  if (!row) return "";

  const metaParts = Array.from(
    row.querySelectorAll(
      [
        "#metadata-line span.inline-metadata-item",
        "ytd-video-meta-block span",
        "span.inline-metadata-item",
        ".ytd-video-meta-block",
        "yt-content-metadata-view-model span",
        "span.ytd-video-meta-block",
      ].join(", "),
    ),
  )
    .map((el) => (el.textContent || "").replace(/\s+/g, " ").trim())
    .filter(Boolean);

  return [...new Set(metaParts)].slice(0, 3).join(" · ");
}

/** @returns {{ title: string, href: string, meta: string }[]} */
function collectYouTubeVideosFromRoot(root) {
  /** @type {Map<string, { title: string, href: string, meta: string }>} */
  const videos = new Map();

  const addVideo = (node) => {
    if (!(node instanceof HTMLAnchorElement)) return;
    if (isInsideYouTubeSidebar(node)) return;

    const href = node.href;
    if (!isYouTubeVideoHref(href)) return;

    const title = getYouTubeVideoTitle(node);
    if (!title || title.length < 2) return;

    const key = href.split("&")[0];
    if (!videos.has(key)) {
      videos.set(key, { title, href: key, meta: getYouTubeVideoMeta(node) });
    }
  };

  for (const selector of YOUTUBE_VIDEO_LINK_SELECTORS) {
    root.querySelectorAll(selector).forEach(addVideo);
  }

  root.querySelectorAll('a[href*="/watch"], a[href*="/shorts/"], a[href*="/live/"]').forEach(addVideo);

  return Array.from(videos.values());
}

function collectYouTubeVideos() {
  const root = getYouTubeVideoGridRoot();
  const fromGrid = collectYouTubeVideosFromRoot(root);
  if (fromGrid.length > 0) return fromGrid;

  return collectYouTubeVideosFromRoot(document);
}

function extractYouTube() {
  if (!isYouTubeHost()) return null;

  // Single video pages: Readability handles title/description better.
  if (isYouTubeWatchPage()) return null;

  if (!isYouTubeListingPage()) return null;

  const videos = collectYouTubeVideos();
  const meta = getYouTubeChannelMeta();
  const html = buildYouTubeListingHtml(videos, meta);
  const container = htmlToContainer(html);
  const cleanedHtml = container.innerHTML.trim();

  if (!cleanedHtml) return null;

  const title =
    meta.name || document.title.replace(/\s*-\s*YouTube\s*$/i, "").trim() || "YouTube";

  let warning = YOUTUBE_LISTING_WARNING;
  if (videos.length === 0) {
    warning =
      "No videos found in the page yet. Scroll down the channel to load videos, then convert again.";
  }

  return {
    html: cleanedHtml,
    title,
    pageType: "listing",
    warning,
  };
}

function tryHomepageSubsection(container) {
  const totalLen = getTextLength(container);
  if (totalLen < HOMEPAGE_SUBSECTION_MIN_CHARS) return container;

  let best = null;
  let bestScore = 0;

  for (const child of container.children) {
    if (!(child instanceof HTMLElement)) continue;
    const pCount = child.querySelectorAll("p").length;
    const len = getTextLength(child);
    const score = pCount * 100 + len;
    if (score > bestScore) {
      bestScore = score;
      best = child;
    }
  }

  if (best && getTextLength(best) >= totalLen * HOMEPAGE_SUBSECTION_MIN_RATIO) {
    const narrowed = document.createElement("div");
    narrowed.appendChild(best.cloneNode(true));
    applyGenericCleanup(narrowed);
    return narrowed;
  }

  return container;
}

function extractWithReadability() {
  if (typeof Readability !== "function") {
    return null;
  }

  const clone = document.cloneNode(true);
  preStripDocumentNoise(clone);

  const reader = new Readability(clone, {
    charThreshold: 100,
    keepClasses: false,
  });

  const article = reader.parse();
  if (!article?.content?.trim()) return null;

  let container = htmlToContainer(article.content);
  let pageType = detectPageType(container, document);

  if (pageType === "homepage") {
    container = tryHomepageSubsection(container);
  }

  const html = container.innerHTML.trim();
  if (!html || getTextLength(container) < MIN_TEXT_LENGTH) return null;

  return {
    html,
    title: (article.title || "").trim(),
    pageType,
  };
}

function extractWithFallback() {
  for (const selector of FALLBACK_ROOT_SELECTORS) {
    const el = document.querySelector(selector);
    if (el && hasMeaningfulText(el)) {
      const container = document.createElement("div");
      container.appendChild(el.cloneNode(true));
      applyGenericCleanup(container);
      const html = container.innerHTML.trim();
      if (html && getTextLength(container) >= MIN_TEXT_LENGTH) {
        const pageType = detectPageType(container, document);
        return { html, title: "", pageType };
      }
    }
  }

  const body = document.body;
  if (!body) return null;

  const container = document.createElement("div");
  container.appendChild(body.cloneNode(true));
  applyGenericCleanup(container);
  const html = container.innerHTML.trim();
  if (!html || getTextLength(container) < MIN_TEXT_LENGTH) return null;

  return {
    html,
    title: "",
    pageType: detectPageType(container, document),
  };
}

/**
 * Lightweight extraction for child frames (same-origin / accessible frames).
 */
function extractSubFrame() {
  const url = location.href;
  if (!document.body) {
    return {
      html: "",
      title: "",
      pageType: "sparse",
      url,
      sources: [],
      isTop: false,
    };
  }

  const container = document.createElement("div");
  container.appendChild(document.body.cloneNode(true));
  applyAugmentCleanup(container);
  removeShallowNavLists(container);
  const html = container.innerHTML.trim();
  const textLen = getTextLength(container);

  if (textLen < AUGMENT_MIN_BLOCK_CHARS) {
    return {
      html: "",
      title: (document.title || "").trim(),
      pageType: "sparse",
      url,
      sources: [],
      isTop: false,
    };
  }

  return {
    html,
    title: (document.title || "").trim(),
    pageType: "article",
    url,
    sources: ["frame"],
    isTop: false,
  };
}

/**
 * @returns {{
 *   html: string;
 *   title: string;
 *   pageType: string;
 *   url: string;
 *   warning?: string;
 *   sources?: string[];
 *   error?: string;
 *   isTop: boolean;
 *   iframeOrder?: string[];
 * }}
 */
function extractPage() {
  const url = location.href;
  const isTop = window === window.top;

  if (!isTop) {
    return extractSubFrame();
  }

  if (!document.body) {
    return {
      html: "",
      error: "document.body not found",
      url,
      pageType: "sparse",
      sources: [],
      isTop: true,
      iframeOrder: [],
    };
  }

  const iframeOrder = Array.from(document.querySelectorAll("iframe"))
    .map((f) => {
      try {
        return f.src || "";
      } catch {
        return "";
      }
    })
    .filter(Boolean);

  /** @type {string[]} */
  const sources = [];
  let warning;
  let coreHtml = "";
  let title = (document.title || "").trim();
  let pageType = "sparse";

  const youtubeResult = extractYouTube();
  if (youtubeResult?.html) {
    coreHtml = youtubeResult.html;
    title = youtubeResult.title || title;
    pageType = youtubeResult.pageType || "listing";
    warning = youtubeResult.warning;
    sources.push("youtube");
  } else {
    const readabilityResult = extractWithReadability();
    if (readabilityResult?.html) {
      coreHtml = readabilityResult.html;
      title = readabilityResult.title || title;
      pageType = readabilityResult.pageType || "article";
      sources.push("readability");
      if (pageType === "homepage") warning = HOMEPAGE_WARNING;
    } else {
      const fallbackResult = extractWithFallback();
      if (fallbackResult?.html) {
        coreHtml = fallbackResult.html;
        title = fallbackResult.title || title;
        pageType = fallbackResult.pageType || "article";
        sources.push("fallback");
        if (pageType === "homepage") warning = HOMEPAGE_WARNING;
      }
    }
  }

  const coreContainer = coreHtml ? htmlToContainer(coreHtml) : null;
  const coreText = coreContainer
    ? (coreContainer.textContent || "").replace(/\s+/g, " ").trim()
    : "";

  const augmentBlocks = collectAugmentBlocks(coreText);
  const merged = mergeCoreAndAugment(coreHtml, coreText, augmentBlocks, sources);
  const finalHtml = merged.html;
  const finalSources = merged.sources;

  if (!finalHtml || getTextLength(htmlToContainer(finalHtml)) < MIN_TEXT_LENGTH) {
    return {
      html: "",
      error: "No readable content found",
      url,
      pageType: "sparse",
      sources: finalSources,
      isTop: true,
      iframeOrder,
    };
  }

  if (!coreHtml) {
    pageType = detectPageType(htmlToContainer(finalHtml), document);
    title = title || (document.title || "").trim();
  }

  return {
    html: finalHtml,
    title,
    pageType,
    url,
    warning,
    sources: finalSources,
    isTop: true,
    iframeOrder,
  };
}

/** Entry point for popup executeScript (all frames). */
function extractFramePayload() {
  return extractPage();
}

function getCleanBodyHtml() {
  return extractPage();
}

globalThis.markdownConvertExtractFrame = extractFramePayload;

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "GET_CLEAN_HTML") {
    sendResponse(getCleanBodyHtml());
    return true;
  }

  return false;
});
