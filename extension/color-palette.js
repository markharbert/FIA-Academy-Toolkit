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
        inset: 0;
        z-index: 2147483647;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        background: rgba(3, 7, 20, 0.74);
        backdrop-filter: blur(3px);
        -webkit-backdrop-filter: blur(3px);
      }
      #${OVERLAY_ID} .fia-pal-dialog {
        width: min(640px, calc(100vw - 32px));
        max-height: calc(100vh - 48px);
        overflow-y: auto;
        background: rgba(18, 20, 28, 0.98);
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 20px;
        padding: 24px 26px 22px;
        box-shadow: 0 20px 70px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        user-select: none;
        -webkit-user-select: none;
      }
      #${OVERLAY_ID} .fia-pal-heading {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 20px;
      }
      #${OVERLAY_ID} .fia-pal-title {
        font-size: 15px;
        font-weight: 700;
        color: rgba(255,255,255,0.88);
        text-transform: uppercase;
        letter-spacing: .06em;
      }
      #${OVERLAY_ID} .fia-pal-subtitle {
        margin-top: 4px;
        color: rgba(255,255,255,0.48);
        font-size: 12px;
      }
      #${OVERLAY_ID} .fia-pal-swatches {
        display: grid;
        grid-template-columns: repeat(6, minmax(0, 1fr));
        gap: 12px;
        margin-bottom: 22px;
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
        aspect-ratio: 0.9/1;
        border-radius: 10px;
        border: 2px solid rgba(255,255,255,0.18);
        box-shadow: 0 3px 12px rgba(0,0,0,0.4);
        transition: transform .15s, box-shadow .15s;
      }
      #${OVERLAY_ID} .fia-pal-swatch-wrap:hover .fia-pal-swatch {
        transform: translateY(-3px) scale(1.03);
        box-shadow: 0 7px 18px rgba(0,0,0,0.55);
        border-color: rgba(255,255,255,0.5);
      }
      #${OVERLAY_ID} .fia-pal-hex {
        margin-top: 6px;
        font-size: 10px;
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
        padding: 11px 13px;
        border-radius: 10px;
        border: none;
        font-size: 13px;
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
        font-size: 12px;
        text-align: center;
        margin-top: 8px;
        min-height: 16px;
        color: rgba(255,255,255,0.6);
      }
      #${OVERLAY_ID} .fia-pal-status.ok   { color: #4ade80; }
      #${OVERLAY_ID} .fia-pal-status.err  { color: #f87171; }
      @media (max-width: 520px) {
        #${OVERLAY_ID} { padding: 16px; }
        #${OVERLAY_ID} .fia-pal-dialog {
          width: calc(100vw - 20px);
          padding: 20px 16px 18px;
        }
        #${OVERLAY_ID} .fia-pal-swatches { gap: 7px; }
        #${OVERLAY_ID} .fia-pal-hex { font-size: 8px; letter-spacing: 0; }
      }
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
      <div class="fia-pal-dialog" role="dialog" aria-modal="true" aria-labelledby="__fia_pal_title__">
        <div class="fia-pal-heading">
          <div>
            <div class="fia-pal-title" id="__fia_pal_title__">🎨 Dominant Colors</div>
            <div class="fia-pal-subtitle">Click a swatch to copy its hex code</div>
          </div>
        </div>
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
      </div>
    `;
    document.documentElement.appendChild(overlay);
    overlay.addEventListener("click", event => {
      if (event.target === overlay) destroy();
    });

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
