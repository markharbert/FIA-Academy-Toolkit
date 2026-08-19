// FIA Toolkit — Snippet HTML capture (content script, runs on every page)
//
// Listens for the right-click event BEFORE the context menu appears.
// At that moment the text selection and editable target are still live, so
// the content script can support both Swipe File capture and Link Vault paste.

let lastEditableTarget = null;
let lastEditableSelection = null;
let lastEditableRange = null;

const PASTEABLE_INPUT_TYPES = new Set(["text", "search", "email", "url", "tel", "password"]);

function findEditableTarget(event) {
  const path = typeof event.composedPath === "function" ? event.composedPath() : [event.target];

  for (const node of path) {
    if (!(node instanceof Element)) continue;

    if (node instanceof HTMLTextAreaElement && !node.disabled && !node.readOnly) {
      return node;
    }

    if (
      node instanceof HTMLInputElement &&
      PASTEABLE_INPUT_TYPES.has((node.type || "text").toLowerCase()) &&
      !node.disabled &&
      !node.readOnly
    ) {
      return node;
    }

    if (node.isContentEditable) {
      return node.closest("[contenteditable]") || node;
    }
  }

  return null;
}

function captureEditableContext(event) {
  lastEditableTarget = findEditableTarget(event);
  lastEditableSelection = null;
  lastEditableRange = null;

  if (!lastEditableTarget) return;

  if (lastEditableTarget instanceof HTMLInputElement || lastEditableTarget instanceof HTMLTextAreaElement) {
    lastEditableSelection = {
      start: lastEditableTarget.selectionStart,
      end: lastEditableTarget.selectionEnd,
    };
    return;
  }

  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);
  const commonNode = range.commonAncestorContainer.nodeType === Node.TEXT_NODE
    ? range.commonAncestorContainer.parentNode
    : range.commonAncestorContainer;
  if (commonNode && lastEditableTarget.contains(commonNode)) {
    lastEditableRange = range.cloneRange();
  }
}

function dispatchTextInput(target, text) {
  try {
    target.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      inputType: "insertText",
      data: text,
    }));
  } catch {
    target.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

function insertIntoLastEditable(url) {
  const target = lastEditableTarget;
  if (!target || !target.isConnected) return false;

  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    const value = target.value || "";
    const start = Number.isInteger(lastEditableSelection?.start)
      ? lastEditableSelection.start
      : value.length;
    const end = Number.isInteger(lastEditableSelection?.end)
      ? lastEditableSelection.end
      : start;
    const nextValue = value.slice(0, start) + url + value.slice(end);
    const prototype = target instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;

    target.focus();
    if (setter) setter.call(target, nextValue);
    else target.value = nextValue;
    target.setSelectionRange(start + url.length, start + url.length);
    dispatchTextInput(target, url);
    target.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  if (target.isContentEditable) {
    target.focus();
    const selection = window.getSelection();
    let range = lastEditableRange;

    if (!range || !target.contains(range.commonAncestorContainer)) {
      range = document.createRange();
      range.selectNodeContents(target);
      range.collapse(false);
    }

    selection.removeAllRanges();
    selection.addRange(range);

    // execCommand still has the best compatibility with controlled rich-text
    // editors because it follows the browser's normal editing event path.
    if (document.execCommand("insertText", false, url)) return true;

    range.deleteContents();
    const textNode = document.createTextNode(url);
    range.insertNode(textNode);
    range.setStartAfter(textNode);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    dispatchTextInput(target, url);
    return true;
  }

  return false;
}

function showLinkVaultToast(inserted) {
  const toastId = "__fia_link_vault_toast__";
  document.getElementById(toastId)?.remove();

  const toast = document.createElement("div");
  toast.id = toastId;
  toast.setAttribute("role", "status");
  toast.style.cssText = [
    "position:fixed",
    "top:24px",
    "left:50%",
    "transform:translateX(-50%)",
    "z-index:2147483647",
    "padding:11px 18px",
    "border-radius:999px",
    "background:#06092a",
    "color:#fff",
    "box-shadow:0 10px 30px rgba(6,9,42,.35)",
    "font:600 13px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
    "pointer-events:none",
  ].join(";");
  toast.textContent = inserted
    ? "Link pasted from Link Vault"
    : "Link copied — press Ctrl+V to paste";
  document.documentElement.appendChild(toast);
  setTimeout(() => toast.remove(), 2600);
}

document.addEventListener("contextmenu", (event) => {
  captureEditableContext(event);

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
      // The SW keys the session-storage cache by sender tab ID, so concurrent
      // right-clicks on different tabs cannot overwrite each other's HTML.
      chrome.runtime.sendMessage({ action: "cacheSnippetHtml", html }).catch(() => {});
    }
  } catch {
    // Restricted page or no selection — service worker falls back to plain text
  }
}, true); // capture phase fires before any page handler can cancel

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.action !== "insertVaultLink" || typeof message.url !== "string") return false;

  let inserted = false;
  try {
    inserted = insertIntoLastEditable(message.url);
  } catch {
    inserted = false;
  }

  showLinkVaultToast(inserted);
  sendResponse({ inserted });
  return false;
});
