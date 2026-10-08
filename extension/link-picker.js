import { extensionRequest, extensionStatus } from "./auth-request.js";

"use strict";

const API_BASE = "https://toolkit.fearlessmarketinglab.com";
const content = document.getElementById("content");
const result = document.getElementById("result");
const pickerRequestId = new URLSearchParams(window.location.search).get("request");

function makeState({ icon = "🔗", title, copy, error = false, actionLabel, onAction }) {
  content.replaceChildren();

  const state = document.createElement("div");
  state.className = "state";

  const iconEl = document.createElement("div");
  iconEl.className = "state-icon";
  iconEl.setAttribute("aria-hidden", "true");
  iconEl.textContent = icon;

  const titleEl = document.createElement("h2");
  titleEl.className = "state-title";
  titleEl.textContent = title;

  const copyEl = document.createElement("p");
  copyEl.className = `state-copy${error ? " error" : ""}`;
  copyEl.textContent = copy;

  state.append(iconEl, titleEl, copyEl);

  if (actionLabel && onAction) {
    const action = document.createElement("button");
    action.type = "button";
    action.className = "state-action";
    action.textContent = actionLabel;
    action.addEventListener("click", onAction);
    state.appendChild(action);
  }

  content.appendChild(state);
}

function showResult(message, kind = "success") {
  result.textContent = message;
  result.className = `result ${kind}`;
  result.hidden = false;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    // Fallback for older Chrome versions that deny Clipboard API access.
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.cssText = "position:fixed;opacity:0;pointer-events:none";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Clipboard access was denied");
}

async function chooseLink(link, buttons) {
  buttons.forEach((button) => { button.disabled = true; });

  try {
    await copyText(link.url);

    // Keep Link Vault usage metrics consistent with the extension's main popup.
    // Guard against malformed records that have a missing or invalid id.
    if (link.id != null) {
      extensionRequest(`/api/v1/links/${encodeURIComponent(link.id)}/click`, {
        method: "POST",
      }).catch(() => {});
    }

    let inserted = false;
    try {
      const response = await chrome.runtime.sendMessage({
        action: "pasteVaultLink",
        url: link.url,
        pickerRequestId,
      });
      inserted = response?.inserted === true;
    } catch {
      // Clipboard copy already succeeded, so the user can paste manually.
    }

    showResult(inserted ? "Link pasted" : "Copied — press Ctrl+V to paste");
    setTimeout(() => window.close(), inserted ? 450 : 950);
  } catch {
    showResult("Could not copy this link", "error");
    buttons.forEach((button) => { button.disabled = false; });
  }
}

function renderLinks(links) {
  if (links.length === 0) {
    makeState({
      title: "No links yet",
      copy: "Add a link to your Link Vault in the FIA Toolkit, then try again.",
    });
    return;
  }

  content.replaceChildren();

  const wrap = document.createElement("div");
  wrap.className = "list-wrap";

  const summary = document.createElement("div");
  summary.className = "list-summary";
  summary.textContent = `${links.length} link${links.length === 1 ? "" : "s"}`;

  const list = document.createElement("ul");
  list.className = "link-list";
  const buttons = [];

  for (const link of links) {
    if (!link || typeof link.url !== "string" || !link.url.trim()) continue;

    const item = document.createElement("li");
    item.className = "link-item";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "link-button";
    button.textContent = String(link.title || "Untitled link");
    button.addEventListener("click", () => chooseLink(link, buttons));

    buttons.push(button);
    item.appendChild(button);
    list.appendChild(item);
  }

  if (buttons.length === 0) {
    makeState({
      title: "No usable links",
      copy: "Your Link Vault does not contain a link with a valid URL yet.",
    });
    return;
  }

  wrap.append(summary, list);
  content.appendChild(wrap);
  buttons[0]?.focus();
}

async function loadLinks() {
  content.innerHTML = `
    <div class="state">
      <div class="spinner" aria-hidden="true"></div>
      <p class="state-copy">Loading your links…</p>
    </div>`;

  const stored = await chrome.storage.local.get(["theme"]);
  document.body.classList.toggle("dark", stored.theme === "dark");

  let auth;
  try { auth = await extensionStatus(); }
  catch (err) {
    makeState({ icon: "!", title: "Could not check connection", copy: err.message, error: true, actionLabel: "Try again", onAction: loadLinks });
    return;
  }
  if (!auth.connected) {
    makeState({
      icon: "🔒",
      title: "Connect your account",
      copy: "Open the FIA Toolkit extension and sign in before using Link Vault.",
      actionLabel: "Open FIA Toolkit",
      onAction: async () => {
        try {
          await chrome.action.openPopup();
          window.close();
        } catch {
          makeState({
            icon: "🔒",
            title: "Open the extension",
            copy: "Click the FIA Toolkit icon in Chrome to connect your account.",
          });
        }
      },
    });
    return;
  }

  try {
    const data = await extensionRequest("/api/v1/links?activeOnly=false");
    renderLinks(Array.isArray(data.links) ? data.links : []);
  } catch (error) {
    makeState({
      icon: "!",
      title: "Could not load Link Vault",
      copy: error?.message || "Check your connection and try again.",
      error: true,
      actionLabel: "Try again",
      onAction: loadLinks,
    });
  }
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") window.close();
});

loadLinks();