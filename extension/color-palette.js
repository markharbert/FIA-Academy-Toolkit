"use strict";

// Injected by the FIA Toolkit extension when the user clicks "Color Palette".
// Displays a floating overlay showing six dominant colors extracted from the
// full-page screenshots; each swatch lets the user copy the hex value or save
// the palette to their Swipe File.

(() => {
  if (window.__fiaColorPaletteScriptLoaded) return;
  window.__fiaColorPaletteScriptLoaded = true;

  const OVERLAY_ID   = "__fia_color_palette__";
  const STYLE_ID     = "__fia_color_palette_style__";

  function destroy() {
    document.getElementById(OVERLAY_ID)?.remove();
    document.getElementById(STYLE_ID)?.remove();
    delete window.__fiaColorPalette;
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;left:-9999px;top:-9999px;opacity:0;";
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch {}
      ta.remove();
      return ok;
    }
  }

  function injectStyles() {
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${OVERLAY_ID} {
        position: fixed;
        bottom: 28px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 2147483647;
        background: rgba(18, 20, 28, 0.96);
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 16px;
        padding: 16px 18px 14px;
        box-shadow: 0 8px 36px rgba(0,0,0,0.55);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        user-select: none;
        -webkit-user-select: none;
        min-width: 310px;
        max-width: 420px;
      }
      #${OVERLAY_ID} .fia-pal-title {
        font-size: 12px;
        font-weight: 700;
        color: rgba(255,255,255,0.65);
        text-transform: uppercase;
        letter-spacing: .06em;
        margin-bottom: 12px;
        text-align: center;
      }
      #${OVERLAY_ID} .fia-pal-swatches {
        display: flex;
        gap: 8px;
        margin-bottom: 12px;
        justify-content: center;
      }
      #${OVERLAY_ID} .fia-pal-swatch-wrap {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        cursor: pointer;
        flex: 1;
        min-width: 0;
        padding: 0;
        border: 0;
        background: transparent;
        font: inherit;
      }
      #${OVERLAY_ID} .fia-pal-swatch {
        width: 100%;
        aspect-ratio: 1/1;
        border-radius: 8px;
        border: 2px solid rgba(255,255,255,0.18);
        box-shadow: 0 2px 8px rgba(0,0,0,0.35);
        transition: transform .12s, box-shadow .12s;
      }
      #${OVERLAY_ID} .fia-pal-swatch-wrap:hover .fia-pal-swatch {
        transform: scale(1.08);
        box-shadow: 0 4px 14px rgba(0,0,0,0.5);
        border-color: rgba(255,255,255,0.5);
      }
      #${OVERLAY_ID} .fia-pal-hex {
        font-size: 9px;
        font-weight: 700;
        color: rgba(255,255,255,0.7);
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        text-align: center;
        white-space: nowrap;
        letter-spacing: .03em;
      }
      #${OVERLAY_ID} .fia-pal-swatch-wrap.fia-pal-copied .fia-pal-hex {
        color: #4ade80;
      }
      #${OVERLAY_ID} .fia-pal-swatch-wrap.fia-pal-copy-fail .fia-pal-hex {
        color: #f87171;
      }
      #${OVERLAY_ID} .fia-pal-actions {
        display: flex;
        gap: 8px;
      }
      #${OVERLAY_ID} .fia-pal-btn {
        flex: 1;
        padding: 8px 10px;
        border-radius: 9px;
        border: none;
        font-size: 12px;
        font-weight: 650;
        font-family: inherit;
        cursor: pointer;
        transition: opacity .12s;
      }
      #${OVERLAY_ID} .fia-pal-btn:hover:not(:disabled) { opacity: .85; }
      #${OVERLAY_ID} .fia-pal-btn:disabled { opacity: .45; cursor: not-allowed; }
      #${OVERLAY_ID} .fia-pal-cancel {
        background: rgba(255,255,255,0.1);
        color: rgba(255,255,255,0.75);
      }
      #${OVERLAY_ID} .fia-pal-save {
        background: #3f92cc;
        color: #fff;
      }
      #${OVERLAY_ID} .fia-pal-status {
        font-size: 11px;
        text-align: center;
        margin-top: 8px;
        min-height: 16px;
        color: rgba(255,255,255,0.6);
      }
      #${OVERLAY_ID} .fia-pal-status.ok   { color: #4ade80; }
      #${OVERLAY_ID} .fia-pal-status.err  { color: #f87171; }
    `;
    document.documentElement.appendChild(style);
  }

  function show(colors, sourceUrl, sourceTitle) {
    // colors: array of six "#RRGGBB" strings
    destroy();
    if (!Array.isArray(colors) || colors.length !== 6 || colors.some(hex => !/^#[0-9A-F]{6}$/.test(hex))) return;
    injectStyles();

    const overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.innerHTML = `
      <div class="fia-pal-title">🎨 Dominant Colors</div>
      <div class="fia-pal-swatches">
        ${colors.map(hex => `
          <button type="button" class="fia-pal-swatch-wrap" data-hex="${hex}" title="Click to copy ${hex}" aria-label="Copy color ${hex}">
            <div class="fia-pal-swatch" style="background:${hex}"></div>
            <div class="fia-pal-hex">${hex}</div>
          </button>
        `).join("")}
      </div>
      <div class="fia-pal-actions">
        <button class="fia-pal-btn fia-pal-cancel" id="__fia_pal_cancel__">Cancel</button>
        <button class="fia-pal-btn fia-pal-save"   id="__fia_pal_save__">Save to Swipe File</button>
      </div>
      <div class="fia-pal-status" id="__fia_pal_status__"></div>
    `;
    document.documentElement.appendChild(overlay);

    // Per-swatch copy
    overlay.querySelectorAll(".fia-pal-swatch-wrap").forEach(wrap => {
      wrap.addEventListener("click", async () => {
        const hex = wrap.dataset.hex;
        const copied = await copyText(hex);
        // Clear any prior state on all swatches first
        overlay.querySelectorAll(".fia-pal-swatch-wrap").forEach(w => {
          w.classList.remove("fia-pal-copied", "fia-pal-copy-fail");
        });
        wrap.classList.add(copied ? "fia-pal-copied" : "fia-pal-copy-fail");
        const hexEl = wrap.querySelector(".fia-pal-hex");
        if (hexEl) {
          const original = hex;
          hexEl.textContent = copied ? "✓ Copied" : "✗ Failed";
          setTimeout(() => {
            hexEl.textContent = original;
            wrap.classList.remove("fia-pal-copied", "fia-pal-copy-fail");
          }, 1500);
        }
      });
    });

    // Cancel
    overlay.querySelector("#__fia_pal_cancel__").addEventListener("click", destroy);

    // Save to Swipe File
    overlay.querySelector("#__fia_pal_save__").addEventListener("click", async () => {
      const saveBtn   = overlay.querySelector("#__fia_pal_save__");
      const cancelBtn = overlay.querySelector("#__fia_pal_cancel__");
      const statusEl  = overlay.querySelector("#__fia_pal_status__");

      saveBtn.disabled   = true;
      cancelBtn.disabled = true;
      statusEl.textContent = "Saving…";
      statusEl.className   = "fia-pal-status";

      try {
        const resp = await chrome.runtime.sendMessage({
          action:    "saveColorPalette",
          colors,
          sourceUrl,
          sourceTitle,
        });

        if (resp?.ok) {
          statusEl.textContent = "✓ Saved to Swipe File!";
          statusEl.className   = "fia-pal-status ok";
          saveBtn.disabled     = false;
          cancelBtn.disabled   = false;
          setTimeout(destroy, 1800);
        } else {
          throw new Error(resp?.error || "Save failed");
        }
      } catch (err) {
        statusEl.textContent = `✗ ${err.message || "Save failed"}`;
        statusEl.className   = "fia-pal-status err";
        saveBtn.disabled     = false;
        cancelBtn.disabled   = false;
      }
    });

    window.__fiaColorPalette = { destroy };
  }

  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && document.getElementById(OVERLAY_ID)) {
      event.preventDefault();
      destroy();
    }
  }, true);

  chrome.runtime.onMessage.addListener(message => {
    if (message?.action === "showColorPalette") {
      show(message.colors, message.sourceUrl, message.sourceTitle);
    }
    if (message?.action === "colorPaletteFailed") {
      // Show error via a brief injected toast instead of the full overlay
      const TOAST_ID = "__fia_pal_err_toast__";
      const existing = document.getElementById(TOAST_ID);
      if (existing) existing.remove();
      const toast = document.createElement("div");
      toast.id = TOAST_ID;
      toast.style.cssText = "position:fixed;top:28px;left:50%;transform:translateX(-50%);z-index:2147483647;background:linear-gradient(135deg,#e85d5d 0%,#b52b2b 100%);padding:11px 22px;border-radius:999px;box-shadow:0 8px 28px rgba(185,43,43,.45);color:#fff;font-size:13px;font-weight:650;font-family:-apple-system,sans-serif;pointer-events:none;white-space:nowrap;";
      toast.textContent = message.error || "Color Palette extraction failed";
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 4000);
    }
  });
})();
