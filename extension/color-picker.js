"use strict";

(() => {
  const ROOT_ID = "__fia_color_picker__";
  const STYLE_ID = "__fia_color_picker_style__";
  const MIN_ZOOM = 2;
  const MAX_ZOOM = 8;
  const MAGNIFIER_SIZE = 132;

  function destroy() {
    document.getElementById(ROOT_ID)?.remove();
    document.getElementById(STYLE_ID)?.remove();
    document.removeEventListener("keydown", handleKeyDown, true);
    delete window.__fiaColorPicker;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function toHex(data) {
    return `#${[data[0], data[1], data[2]]
      .map(value => value.toString(16).padStart(2, "0"))
      .join("")}`
      .toUpperCase();
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const input = document.createElement("textarea");
      input.value = text;
      input.setAttribute("readonly", "");
      input.style.cssText = "position:fixed;left:-9999px;top:-9999px;opacity:0;";
      document.body.appendChild(input);
      input.select();
      let copied = false;
      try { copied = document.execCommand("copy"); } catch {}
      input.remove();
      return copied;
    }
  }

  function handleKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      destroy();
    }
  }

  async function start(screenshot) {
    destroy();
    if (typeof screenshot !== "string" || !screenshot.startsWith("data:image/")) return;

    const image = new Image();
    image.decoding = "async";
    image.src = screenshot;
    try { await image.decode(); } catch {
      console.error("[FIA Color Picker] Could not decode page screenshot.");
      return;
    }

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const scaleX = image.naturalWidth / viewportWidth;
    const scaleY = image.naturalHeight / viewportHeight;
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return;
    context.drawImage(image, 0, 0);

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${ROOT_ID} {
        position: fixed; inset: 0; z-index: 2147483647; cursor: none;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        user-select: none; -webkit-user-select: none;
      }
      #${ROOT_ID} .fia-color-picker-magnifier {
        position: fixed; width: ${MAGNIFIER_SIZE}px; height: ${MAGNIFIER_SIZE}px;
        border: 4px solid #fff; border-radius: 50%; pointer-events: none;
        box-shadow: 0 4px 18px rgba(0,0,0,.42), 0 0 0 2px rgba(0,0,0,.7);
        background-repeat: no-repeat; background-color: #888;
        transform: translate(-50%, -50%); overflow: hidden;
      }
      #${ROOT_ID} .fia-color-picker-pixel {
        position: absolute; left: 50%; top: 50%; width: 12px; height: 12px;
        transform: translate(-50%, -50%); border: 2px solid #fff;
        box-shadow: 0 0 0 1px rgba(0,0,0,.9), 0 1px 4px rgba(0,0,0,.65);
        border-radius: 50%; background: #888;
      }
      #${ROOT_ID} .fia-color-picker-readout {
        position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%);
        display: flex; align-items: center; gap: 9px; min-width: 178px;
        padding: 9px 13px; border-radius: 999px; color: #fff;
        background: rgba(18, 20, 25, .92); box-shadow: 0 5px 20px rgba(0,0,0,.35);
        font: 700 13px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
        text-align: left; white-space: nowrap;
      }
      #${ROOT_ID} .fia-color-picker-swatch {
        width: 22px; height: 22px; border-radius: 50%; flex: 0 0 auto;
        border: 2px solid rgba(255,255,255,.82); box-shadow: 0 0 0 1px rgba(0,0,0,.8);
      }
      #${ROOT_ID} .fia-color-picker-help {
        position: fixed; left: 50%; top: 18px; transform: translateX(-50%);
        padding: 8px 13px; border-radius: 999px; color: #fff;
        background: rgba(18, 20, 25, .88); box-shadow: 0 3px 12px rgba(0,0,0,.25);
        font: 600 12px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        white-space: nowrap;
      }
      #${ROOT_ID} .fia-color-picker-toast {
        position: fixed; left: 50%; top: 62px; transform: translate(-50%, -6px);
        display: none; padding: 9px 15px; border-radius: 999px; color: #fff;
        box-shadow: 0 4px 16px rgba(0,0,0,.3);
        font: 700 12px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        white-space: nowrap; pointer-events: none;
      }
      #${ROOT_ID} .fia-color-picker-toast.show {
        display: block; transform: translate(-50%, 0);
      }
      #${ROOT_ID} .fia-color-picker-toast.success { background: #16834a; }
      #${ROOT_ID} .fia-color-picker-toast.error { background: #b52b2b; }
      #${ROOT_ID}.fia-color-picker-copied .fia-color-picker-help {
        background: #16834a;
      }
    `;
    document.documentElement.appendChild(style);

    const root = document.createElement("div");
    root.id = ROOT_ID;
    root.innerHTML = `
      <div class="fia-color-picker-help">Move to a color · Click to copy · Esc to cancel</div>
      <div class="fia-color-picker-toast" role="status" aria-live="polite"></div>
      <div class="fia-color-picker-magnifier">
        <div class="fia-color-picker-pixel" aria-label="Sampled pixel"></div>
      </div>
      <div class="fia-color-picker-readout">
        <span class="fia-color-picker-swatch"></span>
        <span class="fia-color-picker-hex">#------</span>
      </div>
    `;
    document.documentElement.appendChild(root);

    const magnifier = root.querySelector(".fia-color-picker-magnifier");
    const pixelMarker = root.querySelector(".fia-color-picker-pixel");
    const swatch = root.querySelector(".fia-color-picker-swatch");
    const hexLabel = root.querySelector(".fia-color-picker-hex");
    const toast = root.querySelector(".fia-color-picker-toast");
    let currentHex = "#------";
    let zoom = clamp(Math.round(Math.max(scaleX, scaleY) * 4), MIN_ZOOM, MAX_ZOOM);

    function update(event) {
      const x = clamp(event.clientX, 0, viewportWidth - 1);
      const y = clamp(event.clientY, 0, viewportHeight - 1);
      const pixelX = clamp(Math.round(x * scaleX), 0, image.naturalWidth - 1);
      const pixelY = clamp(Math.round(y * scaleY), 0, image.naturalHeight - 1);
      const data = context.getImageData(pixelX, pixelY, 1, 1).data;
      currentHex = toHex(data);
      hexLabel.textContent = currentHex;
      swatch.style.background = currentHex;
      pixelMarker.dataset.color = currentHex;
      pixelMarker.style.backgroundColor = currentHex;
      magnifier.style.left = `${x}px`;
      magnifier.style.top = `${y}px`;
      magnifier.style.backgroundImage = `url("${screenshot}")`;
      magnifier.style.backgroundSize = `${viewportWidth * zoom}px ${viewportHeight * zoom}px`;
      magnifier.style.backgroundPosition = `${MAGNIFIER_SIZE / 2 - x * zoom}px ${MAGNIFIER_SIZE / 2 - y * zoom}px`;
    }

    async function select(event) {
      event.preventDefault();
      event.stopPropagation();
      if (currentHex === "#------") return;
      const copied = await copyText(currentHex);
      root.classList.toggle("fia-color-picker-copied", copied);
      const help = root.querySelector(".fia-color-picker-help");
      if (help) help.textContent = copied ? `Copied ${currentHex} to clipboard` : `Copy failed — try again`;
      if (toast) {
        toast.textContent = copied ? "Color saved to clipboard" : "Could not save color to clipboard";
        toast.className = `fia-color-picker-toast ${copied ? "success" : "error"} show`;
      }
      if (copied) setTimeout(destroy, 1200);
    }

    root.addEventListener("pointermove", update, true);
    root.addEventListener("pointerdown", event => {
      event.preventDefault();
      event.stopPropagation();
    }, true);
    root.addEventListener("click", select, true);
    document.addEventListener("keydown", handleKeyDown, true);
    window.__fiaColorPicker = { destroy };

    update({ clientX: Math.round(viewportWidth / 2), clientY: Math.round(viewportHeight / 2) });
  }

  chrome.runtime.onMessage.addListener(message => {
    if (message?.action === "startFiaColorPicker") void start(message.screenshot);
  });
})();