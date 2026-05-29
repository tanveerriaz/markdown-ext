function getCleanBodyHtml() {
  const body = document.body;
  if (!body) return { html: "", error: "document.body not found" };

  const container = document.createElement("div");
  container.appendChild(body.cloneNode(true));

  for (const selector of ["nav", "footer", "script", "style", "iframe", "noscript"]) {
    container.querySelectorAll(selector).forEach((el) => el.remove());
  }

  const cleanedBody = container.firstElementChild;
  return { html: cleanedBody ? cleanedBody.innerHTML : "" };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "GET_CLEAN_HTML") {
    sendResponse(getCleanBodyHtml());
    return true;
  }

  return false;
});

