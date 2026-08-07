// FIA Toolkit — Section capture overlay
// Injected into the active tab via chrome.scripting.executeScript
(function () {
  // Remove any stale overlay from a previous invocation
  ["__fia_ovl__", "__fia_sel__", "__fia_hint__"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.remove();
  });

  // Semi-transparent overlay covers the full viewport
  const overlay = document.createElement("div");
  overlay.id = "__fia_ovl__";
  overlay.style.cssText = [
    "position:fixed", "inset:0", "z-index:2147483645",
    "cursor:crosshair", "background:rgba(0,0,0,0.18)",
    "user-select:none", "-webkit-user-select:none",
  ].join(";");
  document.documentElement.appendChild(overlay);

  // Blue selection rectangle
  const selBox = document.createElement("div");
  selBox.id = "__fia_sel__";
  selBox.style.cssText = [
    "position:fixed", "z-index:2147483646",
    "border:2px solid #3b82f6",
    "background:rgba(59,130,246,0.1)",
    "pointer-events:none", "display:none",
    "box-sizing:border-box",
  ].join(";");
  document.documentElement.appendChild(selBox);

  // Instruction hint at top-center
  const hint = document.createElement("div");
  hint.id = "__fia_hint__";
  hint.style.cssText = [
    "position:fixed", "top:14px", "left:50%", "transform:translateX(-50%)",
    "z-index:2147483647",
    "background:rgba(15,15,15,0.82)", "color:#fff",
    "font:600 13px/1 -apple-system,BlinkMacSystemFont,sans-serif",
    "padding:8px 16px", "border-radius:20px",
    "pointer-events:none", "white-space:nowrap",
    "backdrop-filter:blur(4px)",
  ].join(";");
  hint.textContent = "Click and drag to select a region  ·  ESC to cancel";
  document.documentElement.appendChild(hint);

  let startX = 0, startY = 0, dragging = false;

  function cleanup() {
    overlay.remove();
    selBox.remove();
    hint.remove();
    document.removeEventListener("keydown", onKey);
  }

  overlay.addEventListener("mousedown", e => {
    e.preventDefault();
    startX = e.clientX;
    startY = e.clientY;
    dragging = true;
    selBox.style.cssText += ";display:block;left:" + startX + "px;top:" + startY + "px;width:0;height:0";
  }, { passive: false });

  overlay.addEventListener("mousemove", e => {
    if (!dragging) return;
    const x = Math.min(e.clientX, startX);
    const y = Math.min(e.clientY, startY);
    const w = Math.abs(e.clientX - startX);
    const h = Math.abs(e.clientY - startY);
    selBox.style.left   = x + "px";
    selBox.style.top    = y + "px";
    selBox.style.width  = w + "px";
    selBox.style.height = h + "px";
  });

  overlay.addEventListener("mouseup", e => {
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
