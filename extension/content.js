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
