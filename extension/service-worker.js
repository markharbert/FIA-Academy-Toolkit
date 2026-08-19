"use strict";

const API_BASE = "https://toolkit.fearlessmarketinglab.com";

// fetch() does not support data: URLs inside a service worker (throws TypeError).
// Use this helper instead wherever a data URL needs to become a Blob.
function dataUrlToBlob(dataUrl) {
  const [meta, b64] = dataUrl.split(",");
  const mime = meta.match(/:(.*?);/)[1];
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

// ── IndexedDB helpers (shared key-value store for large cross-context data) ───
// Same DB used by annotate.js. Works in both service worker and extension pages.
function idbOpenDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("fia-toolkit", 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore("pending");
    req.onsuccess  = e => resolve(e.target.result);
    req.onerror    = () => reject(req.error);
  });
}
async function idbPut(key, value) {
  const db = await idbOpenDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("pending", "readwrite");
    tx.objectStore("pending").put(value, key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror    = () => { db.close(); reject(tx.error); };
  });
}

// Convert Blob → data URL without fetch (safe in SW; uses small apply chunks).
async function blobToDataUrl(blob) {
  const arrayBuffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const CHUNK = 1024; // well within V8's argument-count limit
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + CHUNK, bytes.length)));
  }
  return `data:${blob.type};base64,${btoa(binary)}`;
}

// Store blob in session storage then open the annotation editor in a new tab.
async function openAnnotationTab(blob, title) {
  const dataUrl = await blobToDataUrl(blob);
  await chrome.storage.session.set({ pendingAnnotation: { dataUrl, title } });
  chrome.tabs.create({ url: chrome.runtime.getURL("annotate.html") });
}

// ─── Context menus ───────────────────────────────────────────────────────────

// Create the context menu items on install/update AND on every SW startup,
// so they're never missing if the SW was killed and restarted.
function ensureContextMenus() {
  chrome.contextMenus.create(
    { id: "fia-save-snippet", title: "Save to Swipe File", contexts: ["selection"] },
    () => { void chrome.runtime.lastError; } // silence "already exists" error
  );
  chrome.contextMenus.create(
    { id: "fia-link-vault", title: "Paste from Link Vault…", contexts: ["all"] },
    () => { void chrome.runtime.lastError; }
  );
}

chrome.runtime.onInstalled.addListener(ensureContextMenus);
chrome.runtime.onStartup.addListener(ensureContextMenus);
ensureContextMenus(); // also run immediately when the SW wakes

async function openLinkVaultPicker(tab) {
  const sourceTabId = tab?.id;
  const sourceWindowId = tab?.windowId;

  // Only one picker should be active. Close a stale one before opening another.
  try {
    const existing = await chrome.storage.session.get("linkPickerContext");
    const oldWindowId = existing?.linkPickerContext?.pickerWindowId;
    if (Number.isInteger(oldWindowId)) await chrome.windows.remove(oldWindowId);
  } catch {
    // The previous picker may already be closed.
  }

  await chrome.storage.session.set({
    linkPickerContext: { sourceTabId, sourceWindowId, openedAt: Date.now() },
  });

  let left;
  let top;
  try {
    const sourceWindow = await chrome.windows.get(sourceWindowId);
    left = Math.round((sourceWindow.left ?? 0) + ((sourceWindow.width ?? 1200) - 380) / 2);
    top = Math.round((sourceWindow.top ?? 0) + ((sourceWindow.height ?? 800) - 560) / 2);
  } catch {
    // Chrome will choose a sensible position.
  }

  const picker = await chrome.windows.create({
    url: chrome.runtime.getURL("link-picker.html"),
    type: "popup",
    width: 380,
    height: 560,
    left,
    top,
    focused: true,
  });

  await chrome.storage.session.set({
    linkPickerContext: {
      sourceTabId,
      sourceWindowId,
      pickerWindowId: picker?.id,
      openedAt: Date.now(),
    },
  });
}

// Cache the selection HTML sent by snippet-capture.js (content script).
// Using message passing is more reliable than calling chrome.storage from
// a content script directly, because sendMessage wakes the SW if needed.
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === "cacheSnippetHtml" && msg.html) {
    chrome.storage.session.set({ pendingSnippetHtml: msg.html }).catch(() => {});
  }
});

// The picker copies the URL first, then asks the original page to insert it at
// the right-clicked field. Sites that block insertion still receive clipboard
// fallback, and the original browser window is brought back to the front.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action !== "pasteVaultLink" || typeof msg.url !== "string") return false;

  (async () => {
    const stored = await chrome.storage.session.get("linkPickerContext");
    const context = stored?.linkPickerContext || {};
    let inserted = false;

    if (Number.isInteger(context.sourceTabId)) {
      // Bring the original page forward before asking its editor to insert.
      // Rich-text editors commonly reject execCommand while their tab is hidden.
      try {
        await chrome.tabs.update(context.sourceTabId, { active: true });
      } catch {}

      if (Number.isInteger(context.sourceWindowId)) {
        try {
          await chrome.windows.update(context.sourceWindowId, { focused: true });
        } catch {}
      }

      await swSleep(60);

      try {
        const response = await chrome.tabs.sendMessage(context.sourceTabId, {
          action: "insertVaultLink",
          url: msg.url,
        });
        inserted = response?.inserted === true;
      } catch {
        // Restricted pages and tabs closed since the menu click cannot receive messages.
      }
    } else if (Number.isInteger(context.sourceWindowId)) {
      try {
        await chrome.windows.update(context.sourceWindowId, { focused: true });
      } catch {}
    }

    await chrome.storage.session.remove("linkPickerContext");
    sendResponse({ ok: true, inserted });
  })().catch((err) => {
    console.error("[FIA] Link Vault paste failed:", err);
    sendResponse({ ok: false, inserted: false, error: err?.message || "Paste failed" });
  });

  return true;
});


// ─── Section capture: crop & store for popup ─────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.action !== "sectionSelected") return;
  const { rect, dpr }  = msg;
  const sectionTabId   = sender.tab?.id;
  const sectionWinId   = sender.tab?.windowId;
  const tabTitle       = sender.tab?.title ?? "Section Screenshot";

  // captureVisibleTab requires windowId; <all_urls> in host_permissions makes it work on any site
  (async () => {
    try {
      const dataUrl = await chrome.tabs.captureVisibleTab(sectionWinId, { format: "png" });

      const blob   = dataUrlToBlob(dataUrl);
      const bitmap = await createImageBitmap(blob);

      const cw = Math.max(1, Math.round(rect.width  * dpr));
      const ch = Math.max(1, Math.round(rect.height * dpr));
      const canvas = new OffscreenCanvas(cw, ch);
      const ctx    = canvas.getContext("2d");
      ctx.drawImage(
        bitmap,
        Math.round(rect.x * dpr), Math.round(rect.y * dpr), cw, ch,
        0, 0, cw, ch
      );
      bitmap.close(); // release GPU memory

      const croppedBlob = await canvas.convertToBlob({ type: "image/png" });

      await openAnnotationTab(croppedBlob, tabTitle);
    } catch (err) {
      console.error("[FIA SW] section crop error:", err);
      injectErrorToast(sectionTabId, `Capture failed: ${err.message}`);
    }
  })();
});

// ─── Full Page capture: native scroll-and-stitch ─────────────────────────────

function swSleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Page-level toasts (injected into the active tab) ─────────────────────────
function injectSaveToast(tabId) {
  if (!tabId) return;
  chrome.scripting.executeScript({ target: { tabId }, files: ["save-toast.js"] }).catch(() => {});
}

function injectErrorToast(tabId, message) {
  if (!tabId) return;
  chrome.scripting.executeScript({
    target: { tabId },
    func: (msg) => {
      const TOAST_ID = "__fia_save_toast__", STYLE_ID = "__fia_toast_style__";
      [TOAST_ID, STYLE_ID].forEach(id => { const el = document.getElementById(id); if (el) el.remove(); });
      const style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = "@keyframes _fia_in{from{opacity:0;transform:translateX(-50%) scale(.75)}to{opacity:1;transform:translateX(-50%) scale(1)}}@keyframes _fia_out{from{opacity:1;transform:translateX(-50%) scale(1)}to{opacity:0;transform:translateX(-50%) scale(.75)}}";
      document.head.appendChild(style);
      const toast = document.createElement("div");
      toast.id = TOAST_ID;
      toast.style.cssText = "position:fixed;top:28px;left:50%;transform:translateX(-50%);z-index:2147483647;background:linear-gradient(135deg,#e85d5d 0%,#b52b2b 100%);padding:11px 22px 11px 14px;border-radius:999px;box-shadow:0 8px 28px rgba(185,43,43,.45);display:flex;align-items:center;gap:10px;animation:_fia_in .4s cubic-bezier(.34,1.56,.64,1) both;pointer-events:none;font-family:-apple-system,BlinkMacSystemFont,sans-serif;user-select:none;-webkit-user-select:none";
      toast.innerHTML = `<svg width="26" height="26" viewBox="0 0 26 26" fill="none" style="flex-shrink:0"><circle cx="13" cy="13" r="12" fill="rgba(255,255,255,0.22)"/><path d="M8.5 8.5l9 9M17.5 8.5l-9 9" stroke="white" stroke-width="2.6" stroke-linecap="round"/></svg><span style="color:#fff;font-size:14px;font-weight:650;white-space:nowrap">${msg}</span>`;
      document.body.appendChild(toast);
      setTimeout(() => { toast.style.animation = "_fia_out .32s ease-in both"; setTimeout(() => { toast.remove(); style.remove(); }, 350); }, 4000);
    },
    args: [message],
  }).catch(() => {});
}


chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action !== "startFullPageCapture") return false;
  sendResponse({ ok: true }); // ack immediately; async work runs below
  handleFullPageCapture(msg.tabId, msg.title);
  return false;
});

async function handleFullPageCapture(tabId, title) {
  // Strip-based capture → annotate-editor approach:
  // Each strip is scaled to logical-pixel resolution (DPR=1) via OffscreenCanvas,
  // stored as data URLs in IndexedDB (no 10 MB session-storage cap), then the
  // annotation editor opens and stitches them into one scrollable canvas.

  try {
    // 1. Read page geometry
    const [{ result: dims }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => ({
        scrollH: Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0),
        vpH:     window.innerHeight,
        vpW:     window.innerWidth,
        origX:   window.scrollX,
        origY:   window.scrollY,
      }),
    });
    const { scrollH, vpH, vpW, origX, origY } = dims;

    // Guard: degenerate viewport (some iframes / SPAs) — avoids Math.ceil(x/0) = Infinity.
    if (!vpH || !vpW) throw new Error("Capture aborted: viewport dimensions are zero.");

    // 2. Get windowId for captureVisibleTab
    const { windowId } = await chrome.tabs.get(tabId);

    // 3. Inject progress banner
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const el = document.createElement("div");
        el.id = "__fia_progress__";
        el.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#1a1a2e;color:#fff;font:600 13px -apple-system,sans-serif;padding:9px 18px;text-align:center;pointer-events:none";
        el.textContent = "FIA Toolkit: capturing full page…";
        document.documentElement.appendChild(el);
      },
    });

    // 4. Scroll to top
    await chrome.scripting.executeScript({ target: { tabId }, func: () => window.scrollTo(0, 0) });
    await swSleep(250);

    // 5. Capture each strip
    const totalSteps = Math.ceil(scrollH / vpH);
    const strips     = [];

    for (let i = 0; i < totalSteps; i++) {
      // Last step flushes to the exact bottom so no content is clipped
      const scrollTop = (i === totalSteps - 1) ? Math.max(0, scrollH - vpH) : i * vpH;

      await chrome.scripting.executeScript({
        target: { tabId }, func: (y) => window.scrollTo(0, y), args: [scrollTop],
      });
      // Chrome enforces MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND (≈ 2/s).
      // 600 ms gives scroll time to settle and keeps us comfortably under the limit.
      await swSleep(600);

      // After strip 0 is captured we hide fixed/sticky top elements so they don't
      // repeat in every subsequent strip. Strip 0 shows them naturally (correct).
      if (i === 1) {
        await chrome.scripting.executeScript({
          target: { tabId },
          func: () => {
            document.querySelectorAll("*").forEach(el => {
              if (el.id && el.id.startsWith("__fia_")) return;
              const st  = window.getComputedStyle(el);
              const pos = st.position;
              if (pos !== "fixed" && pos !== "sticky") return;
              const rect = el.getBoundingClientRect();
              if (rect.height <= 0 || rect.width <= 0) return;
              let hide = false;
              if (pos === "fixed") {
                hide = rect.top >= -5 && rect.top < window.innerHeight * 0.35;
              } else {
                const topPx = parseFloat(st.top);
                hide = !isNaN(topPx) && topPx <= 20;
              }
              if (hide) {
                el.dataset.fiaOrigVis = el.style.visibility;
                el.style.setProperty("visibility", "hidden", "important");
              }
            });
          },
        });
      }

      // Hide the progress banner so it doesn't bake into the captured strip,
      // then sleep briefly so the browser repaints before the screenshot fires.
      await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          const el = document.getElementById("__fia_progress__");
          if (el) el.style.visibility = "hidden";
        },
      });
      await swSleep(80); // repaint gap — without this the banner can still be visible in the capture

      // Capture at device DPR and store the raw data URL directly.
      // OffscreenCanvas.convertToBlob() is unreliable in extension SW contexts;
      // the annotate editor uses 9-arg drawImage to handle DPR scaling instead.
      const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: "png" });
      strips.push(dataUrl);

      // Restore the progress banner and update its counter.
      await chrome.scripting.executeScript({
        target: { tabId },
        func: (cur, tot) => {
          const el = document.getElementById("__fia_progress__");
          if (el) {
            el.style.visibility = "visible";
            el.textContent = `FIA Toolkit: capturing full page… ${cur} / ${tot}`;
          }
        },
        args: [i + 1, totalSteps],
      });
    }

    // 6. Restore hidden fixed/sticky elements now that capture is complete
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        document.querySelectorAll("[data-fia-orig-vis]").forEach(el => {
          el.style.visibility = el.dataset.fiaOrigVis;
          delete el.dataset.fiaOrigVis;
        });
      },
    });

    // 7. Restore scroll position
    await chrome.scripting.executeScript({
      target: { tabId }, func: (x, y) => window.scrollTo(x, y), args: [origX, origY],
    });

    // 7. Remove progress banner
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => { const el = document.getElementById("__fia_progress__"); if (el) el.remove(); },
    });

    // 8. Store strips in IndexedDB (no size cap; works across SW + extension page contexts)
    await idbPut("pendingFullPage", { strips, title: title || "Full Page", scrollH, vpH, vpW });

    // 9. Open annotation editor — it will stitch + save the full image
    chrome.tabs.create({ url: chrome.runtime.getURL("annotate.html") });

  } catch (err) {
    console.error("[FIA SW] full page capture error:", err);
    // Restore any hidden fixed/sticky elements before showing the error
    chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        document.querySelectorAll("[data-fia-orig-vis]").forEach(el => {
          el.style.visibility = el.dataset.fiaOrigVis;
          delete el.dataset.fiaOrigVis;
        });
        const banner = document.getElementById("__fia_progress__");
        if (banner) banner.remove();
      },
    }).catch(() => {});
    injectErrorToast(tabId, `Capture failed: ${err.message}`);
  }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "fia-link-vault") {
    try {
      await openLinkVaultPicker(tab);
    } catch (err) {
      console.error("[FIA] Link Vault picker failed:", err);
      injectErrorToast(tab?.id, "Could not open Link Vault");
    }
    return;
  }

  if (info.menuItemId !== "fia-save-snippet") return;
  const text      = info.selectionText ?? "";
  const sourceUrl = tab?.url ?? "";
  const title     = (tab?.title ?? "Snippet").substring(0, 120);

  const stored = await chrome.storage.local.get(["apiKey"]);
  const key = stored.apiKey;
  if (!key) return;

  // snippet-capture.js stashes the selection HTML in session storage at the
  // moment of right-click (before the selection is cleared by the menu click).
  // Read it here and clear it so it doesn't bleed into the next snippet.
  let content = text;
  try {
    const session = await chrome.storage.session.get("pendingSnippetHtml");
    const html = session?.pendingSnippetHtml;
    if (html && html.trim()) {
      content = html;
      await chrome.storage.session.remove("pendingSnippetHtml");
    }
  } catch {
    // Session storage unavailable — plain text fallback is fine
  }

  try {
    await fetch(`${API_BASE}/api/v1/swipe`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": key },
      body:    JSON.stringify({ type: "snippet", title, content, sourceUrl }),
    });
    injectSaveToast(tab?.id);
  } catch (err) {
    console.error("[FIA] Snippet save failed:", err.message);
  }
});
// This public key is safe to embed — it is designed to be shared with clients.
const VAPID_PUBLIC_KEY = "BPdIbvBytx7rxn5z3S3QJ2vI0GhB-PTDrtKpnpyyMa52g_nGrS7MCxYnUpbXEUMGPosBYYFydnRbXFm3rmnRBZE";

// ─── Push subscription ────────────────────────────────────────────────────────
function urlBase64ToUint8Array(b64) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const base64 = (b64 + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function subscribeToPush(apiKey) {
  try {
    const existing = await self.registration.pushManager.getSubscription();
    if (existing) await existing.unsubscribe();

    const subscription = await self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });

    await fetch(`${API_BASE}/api/extension/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
      body: JSON.stringify(subscription.toJSON()),
    });

    console.log("[FIA] Push subscription registered");
    return { success: true };
  } catch (err) {
    console.warn("[FIA] Push subscription failed:", err.message);
    return { success: false, error: err.message };
  }
}

async function unsubscribeFromPush(apiKey) {
  try {
    const sub = await self.registration.pushManager.getSubscription();
    if (sub) {
      await sub.unsubscribe();
      await fetch(`${API_BASE}/api/extension/unsubscribe`, {
        method: "DELETE",
        headers: { "X-API-Key": apiKey },
      });
    }
  } catch (err) {
    console.warn("[FIA] Unsubscribe failed:", err.message);
  }
}

// ─── Suspended-membership auto-recovery (chrome.alarms) ──────────────────────

const SUSPENDED_ALARM      = "fia-suspended-check";
const SUSPENDED_CHECK_MINS = 5;

// Fires every 5 minutes while the member is suspended.
// Survives popup close because it runs in the service worker.
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== SUSPENDED_ALARM) return;
  checkMembershipAlarm();
});

async function checkMembershipAlarm() {
  const { apiKey, suspended } = await chrome.storage.local.get(["apiKey", "suspended"]);
  if (!apiKey || !suspended) {
    // State no longer requires background checking — cancel the alarm.
    chrome.alarms.clear(SUSPENDED_ALARM);
    return;
  }

  // Record when this check cycle began so the popup can compute the real remainder.
  await chrome.storage.local.set({ lastSuspendedCheckAt: Date.now() });

  try {
    const res = await fetch(`${API_BASE}/api/v1/membership/check`, {
      method: "POST",
      headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
    });
    if (!res.ok) return; // Silent — will retry on next alarm
    const data = await res.json();
    if (!data.enrolled) return; // Still inactive — will retry on next alarm

    // ── Membership restored ──
    chrome.alarms.clear(SUSPENDED_ALARM);
    await chrome.storage.local.set({ suspended: false });

    // Tell the popup if it is currently open (throws if popup is closed — that's fine).
    try {
      await chrome.runtime.sendMessage({ type: "MEMBERSHIP_RESTORED" });
    } catch {}

    // Show a system notification so the member knows even when the popup is closed.
    try {
      chrome.notifications.create("fia-membership-restored", {
        type: "basic",
        iconUrl: "icons/icon128.png",
        title: "FIA Toolkit — Access Restored 🎉",
        message: "Your membership is active again. Open the extension to continue.",
        priority: 2,
      });
    } catch {}
  } catch {
    // Network error — silent, will retry on next alarm
  }
}

// ─── Runtime messages from popup ─────────────────────────────────────────────
// Uses chrome.runtime.onMessage (the correct MV3 extension messaging API).
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const { type, apiKey } = message || {};

  if (type === "START_SUSPENDED_CHECK") {
    chrome.storage.local.set({ suspended: true, lastSuspendedCheckAt: Date.now() }).then(() =>
      chrome.alarms.create(SUSPENDED_ALARM, { periodInMinutes: SUSPENDED_CHECK_MINS })
    );
    sendResponse({ ok: true });
    return false;
  }

  if (type === "STOP_SUSPENDED_CHECK") {
    chrome.storage.local.set({ suspended: false }).then(() =>
      chrome.alarms.clear(SUSPENDED_ALARM)
    );
    sendResponse({ ok: true });
    return false;
  }
});

// ─── Event listeners ──────────────────────────────────────────────────────────

// Messages from popup (push subscription — kept on the existing web-SW channel
// used by the rest of the extension push flow).
self.addEventListener("message", (event) => {
  const { type, apiKey } = event.data || {};
  if (type === "SUBSCRIBE_PUSH") {
    event.waitUntil(subscribeToPush(apiKey));
  }
  if (type === "UNSUBSCRIBE_PUSH") {
    event.waitUntil(unsubscribeFromPush(apiKey));
  }
});

// Incoming push notification
self.addEventListener("push", (event) => {
  let data = { title: "FIA Toolkit", body: "" };
  try { data = { ...data, ...event.data.json() }; } catch (_) {}

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "icons/icon128.png",
      badge: "icons/icon48.png",
      tag: "fia-toolkit-broadcast",
      renotify: true,
    })
  );
});

// Notification click — open the toolkit
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        const existing = windowClients.find((c) => c.url.startsWith(API_BASE));
        if (existing) return existing.focus();
        return clients.openWindow(API_BASE);
      })
  );
});
