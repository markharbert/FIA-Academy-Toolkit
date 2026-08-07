// FIA Toolkit — Section capture overlay
// Injected into the active tab via chrome.scripting.executeScript.
// Uses a canvas so the selected region is a true cutout — bright page,
// dark surround — rather than darkening everything uniformly.
(function () {
  // Remove any stale overlay from a previous invocation
  ["__fia_ovl__", "__fia_hint__"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.remove();
  });

  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // ── Canvas covers the full viewport ──────────────────────────────────────
  // It handles mouse events AND renders the dark surround + bright cutout.
  const canvas = document.createElement("canvas");
  canvas.id    = "__fia_ovl__";
  canvas.width  = vw;
  canvas.height = vh;
  canvas.style.cssText = [
    "position:fixed", "inset:0", "z-index:2147483645",
    "cursor:crosshair",
    "user-select:none", "-webkit-user-select:none",
  ].join(";");
  document.documentElement.appendChild(canvas);
  const ctx = canvas.getContext("2d");

  // ── Instruction hint at top-center ────────────────────────────────────────
  const hint = document.createElement("div");
  hint.id = "__fia_hint__";
  hint.style.cssText = [
    "position:fixed", "top:14px", "left:50%", "transform:translateX(-50%)",
    "z-index:2147483647",
    "background:rgba(15,15,15,0.82)", "color:#fff",
    "font:600 13px/1 -apple-system,BlinkMacSystemFont,sans-serif",
    "padding:8px 18px", "border-radius:20px",
    "pointer-events:none", "white-space:nowrap",
    "backdrop-filter:blur(4px)", "box-shadow:0 2px 12px rgba(0,0,0,.4)",
  ].join(";");
  hint.textContent = "Drag to select a region  ·  ESC to cancel";
  document.documentElement.appendChild(hint);

  // ── Draw helpers ──────────────────────────────────────────────────────────
  function drawOverlay(selX, selY, selW, selH) {
    ctx.clearRect(0, 0, vw, vh);

    // Dark surround over the entire viewport
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(0, 0, vw, vh);

    if (selW > 0 && selH > 0) {
      // Punch a transparent hole so the real page shows through at full brightness
      ctx.clearRect(selX, selY, selW, selH);

      // Crisp white border around the selected area
      ctx.strokeStyle = "rgba(255,255,255,0.95)";
      ctx.lineWidth   = 2;
      ctx.setLineDash([]);
      ctx.strokeRect(selX + 1, selY + 1, selW - 2, selH - 2);

      // Subtle dimension label
      const label = `${Math.round(selW)} × ${Math.round(selH)}`;
      ctx.font      = "bold 11px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      const lw = ctx.measureText(label).width;
      const lx = Math.min(selX + selW - lw - 8, vw - lw - 12);
      const ly = selY + selH + 18 > vh ? selY - 8 : selY + selH + 18;
      ctx.fillText(label, lx, ly);
    }
  }

  // Initial render: full dark overlay, no selection yet
  drawOverlay(0, 0, 0, 0);

  // ── Drag tracking ─────────────────────────────────────────────────────────
  let startX = 0, startY = 0, dragging = false;

  function cleanup() {
    canvas.remove();
    hint.remove();
    document.removeEventListener("keydown", onKey);
  }

  canvas.addEventListener("mousedown", e => {
    e.preventDefault();
    startX   = e.clientX;
    startY   = e.clientY;
    dragging = true;
  }, { passive: false });

  canvas.addEventListener("mousemove", e => {
    if (!dragging) return;
    drawOverlay(
      Math.min(e.clientX, startX),
      Math.min(e.clientY, startY),
      Math.abs(e.clientX - startX),
      Math.abs(e.clientY - startY)
    );
  });

  canvas.addEventListener("mouseup", e => {
    if (!dragging) return;
    dragging = false;
    const x = Math.min(e.clientX, startX);
    const y = Math.min(e.clientY, startY);
    const w = Math.abs(e.clientX - startX);
    const h = Math.abs(e.clientY - startY);
    cleanup();
    if (w < 10 || h < 10) {
      chrome.runtime.sendMessage({ action: "sectionCancelled" });
      return;
    }
    chrome.runtime.sendMessage({
      action: "sectionSelected",
      rect:   { x, y, width: w, height: h },
      dpr:    window.devicePixelRatio || 1,
    });
  });

  function onKey(e) {
    if (e.key === "Escape") {
      cleanup();
      chrome.runtime.sendMessage({ action: "sectionCancelled" });
    }
  }
  document.addEventListener("keydown", onKey);
})();
