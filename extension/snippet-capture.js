// FIA Toolkit — Snippet HTML capture
// Runs on every page. On right-click we immediately capture the selection
// as HTML and stash it in chrome.storage.session so the service worker can
// read it when the "Save to Swipe File" context menu item is clicked.
// (By the time onClicked fires the selection is already gone, so we must
// capture it here, at the contextmenu event, while it still exists.)

document.addEventListener("contextmenu", () => {
  try {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;

    const range = sel.getRangeAt(0);
    const wrapper = document.createElement("div");
    wrapper.appendChild(range.cloneContents());
    const html = wrapper.innerHTML;

    if (html && html.trim()) {
      chrome.storage.session.set({ pendingSnippetHtml: html });
    }
  } catch {
    // Ignore — service worker will fall back to plain selectionText
  }
}, true); // capture phase so we fire before any page listener cancels it
