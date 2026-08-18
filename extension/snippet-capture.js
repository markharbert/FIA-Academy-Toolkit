// FIA Toolkit — Snippet HTML capture (content script, runs on every page)
//
// Listens for the right-click event BEFORE the context menu appears.
// At that moment the text selection is still live, so we can clone its
// HTML and send it to the service worker for storage.
// The service worker reads it back in the onClicked handler.

document.addEventListener("contextmenu", () => {
  try {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    const range = sel.getRangeAt(0);
    if (range.collapsed) return;

    const wrapper = document.createElement("div");
    wrapper.appendChild(range.cloneContents());
    const html = wrapper.innerHTML;

    if (html && html.trim()) {
      // Send to service worker — this also wakes the SW if it was sleeping.
      chrome.runtime.sendMessage({ action: "cacheSnippetHtml", html }).catch(() => {});
    }
  } catch {
    // Restricted page or no selection — service worker falls back to plain text
  }
}, true); // capture phase fires before any page handler can cancel
