const MIN_TEXT_LENGTH = 80;
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
  "a#video-title-link",
  "a#video-title",
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

/** @param {ParentNode} root */
function applyGenericCleanup(root) {
  removeBySelectors(root, GENERIC_REMOVE_SELECTORS);
  removeShallowNavLists(root);
  removeEmptyAnchors(root);
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

/** @returns {{ title: string, href: string, meta: string }[]} */
function collectYouTubeVideos() {
  /** @type {Map<string, { title: string, href: string, meta: string }>} */
  const videos = new Map();

  for (const selector of YOUTUBE_VIDEO_LINK_SELECTORS) {
    document.querySelectorAll(selector).forEach((node) => {
      if (!(node instanceof HTMLAnchorElement)) return;

      const href = node.href;
      if (!isYouTubeVideoHref(href)) return;

      const title = (node.getAttribute("title") || node.textContent || "")
        .replace(/\s+/g, " ")
        .trim();
      if (!title || title.length < 2) return;

      const row = node.closest(
        "ytd-rich-item-renderer, ytd-grid-video-renderer, ytd-video-renderer, ytd-playlist-video-renderer, ytd-compact-video-renderer",
      );

      let meta = "";
      if (row) {
        const metaParts = Array.from(
          row.querySelectorAll(
            "#metadata-line span.inline-metadata-item, ytd-video-meta-block span, span.inline-metadata-item",
          ),
        )
          .map((el) => (el.textContent || "").trim())
          .filter(Boolean);
        meta = metaParts.slice(0, 3).join(" · ");
      }

      if (!videos.has(href)) {
        videos.set(href, { title, href, meta });
      }
    });
  }

  return Array.from(videos.values());
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

function extractYouTube() {
  if (!isYouTubeHost()) return null;

  // Single video pages: Readability handles title/description better.
  if (isYouTubeWatchPage()) return null;

  const videos = collectYouTubeVideos();
  const meta = getYouTubeChannelMeta();

  if (videos.length === 0) return null;

  const html = buildYouTubeListingHtml(videos, meta);
  const container = htmlToContainer(html);
  const cleanedHtml = container.innerHTML.trim();

  if (!cleanedHtml || getTextLength(container) < MIN_TEXT_LENGTH) return null;

  const title =
    meta.name || document.title.replace(/\s*-\s*YouTube\s*$/i, "").trim() || "YouTube";

  return {
    html: cleanedHtml,
    title,
    pageType: "listing",
    warning: YOUTUBE_LISTING_WARNING,
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

function getCleanBodyHtml() {
  const url = location.href;

  if (!document.body) {
    return {
      html: "",
      error: "document.body not found",
      url,
      pageType: "sparse",
    };
  }

  const youtubeResult = extractYouTube();
  if (youtubeResult?.html) {
    const { html, title, pageType, warning } = youtubeResult;
    return {
      html,
      title,
      pageType,
      url,
      warning,
    };
  }

  const readabilityResult = extractWithReadability();
  if (readabilityResult?.html) {
    const { html, title, pageType } = readabilityResult;
    return {
      html,
      title,
      pageType,
      url,
      warning: pageType === "homepage" ? HOMEPAGE_WARNING : undefined,
    };
  }

  const fallbackResult = extractWithFallback();
  if (fallbackResult?.html) {
    const { html, title, pageType } = fallbackResult;
    return {
      html,
      title,
      pageType,
      url,
      warning: pageType === "homepage" ? HOMEPAGE_WARNING : undefined,
    };
  }

  return {
    html: "",
    error: "No readable content found",
    url,
    pageType: "sparse",
  };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "GET_CLEAN_HTML") {
    sendResponse(getCleanBodyHtml());
    return true;
  }

  return false;
});
