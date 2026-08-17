"use strict";

const API_BASE = "https://toolkit.fearlessmarketinglab.com";

const canvas   = document.getElementById("canvas");
const ctx      = canvas.getContext("2d");
const statusEl = document.getElementById("status");

// ── Core state ────────────────────────────────────────────────────────────────
let bgImage      = null;
let annotations  = [];
let activeTool   = "rect";   // "select" | "rect" | "arrow" | "text"
let activeColor  = "#e74c3c";
let activeStroke = 8;
let activeBgColor = "#1e2538"; // text-label background ("none" = transparent)
let pendingTitle = "Screenshot";
let isFullPage   = false;

// Draw-mode state (rect / arrow)
let drawing    = false;
let drawStartX = 0, drawStartY = 0;

// Select-mode state
let selectedIndex = -1;     // index into annotations[]; -1 = none
let dragMode      = null;   // null | "move" | "handle"
let dragHandle    = null;   // rect: "nw"|"n"|"ne"|"e"|"se"|"s"|"sw"|"w"  arrow: "start"|"end"
let dragAnchorX   = 0;     // canvas coords at mousedown
let dragAnchorY   = 0;
let dragOrigAnn   = null;  // snapshot of annotation at drag start

// ── IndexedDB helpers ─────────────────────────────────────────────────────────
function idbOpenDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("fia-toolkit", 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore("pending");
    req.onsuccess  = e => resolve(e.target.result);
    req.onerror    = () => reject(req.error);
  });
}
async function idbGet(key) {
  const db = await idbOpenDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("pending", "readonly");
    const r  = tx.objectStore("pending").get(key);
    r.onsuccess = () => { db.close(); resolve(r.result); };
    r.onerror   = () => { db.close(); reject(r.error); };
  });
}
async function idbDelete(key) {
  const db = await idbOpenDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("pending", "readwrite");
    tx.objectStore("pending").delete(key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror    = () => { db.close(); reject(tx.error); };
  });
}

// ── Image loader ──────────────────────────────────────────────────────────────
function loadAsImage(src) {
  return new Promise((resolve, reject) => {
    const img   = new Image();
    img.onload  = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to decode strip"));
    img.src     = src;
  });
}

// ── Entry point ───────────────────────────────────────────────────────────────
(async () => {
  try {
    const { pendingAnnotation } = await chrome.storage.session.get("pendingAnnotation");
    if (pendingAnnotation?.dataUrl) {
      await initSingleImage(pendingAnnotation.dataUrl, pendingAnnotation.title);
      return;
    }
    const pending = await idbGet("pendingFullPage");
    if (pending?.strips?.length) {
      isFullPage = true;
      await initFullPage(pending);
      return;
    }
    statusEl.innerHTML = "No screenshot found.<br>Close this tab and try again.";
  } catch (err) {
    statusEl.textContent = `Load error: ${err.message}`;
  }
})();

// ── Single image init ─────────────────────────────────────────────────────────
async function initSingleImage(dataUrl, title) {
  pendingTitle = title || "Screenshot";
  const img    = await loadAsImage(dataUrl);
  bgImage       = img;
  canvas.width  = img.naturalWidth;
  canvas.height = img.naturalHeight;
  statusEl.style.display = "none";
  const maxH = window.innerHeight - 54 - 48;
  canvas.style.maxHeight = maxH + "px";
  canvas.style.display   = "block";
  render();
}

// ── Full-page init (multi-strip stitch) ───────────────────────────────────────
async function initFullPage({ strips, title, scrollH, vpH, vpW }) {
  pendingTitle = title || "Full Page";
  statusEl.textContent   = `Stitching full page (0 / ${strips.length})…`;
  statusEl.style.display = "block";
  canvas.width  = vpW;
  canvas.height = scrollH;

  for (let i = 0; i < strips.length; i++) {
    statusEl.textContent = `Stitching full page (${i + 1} / ${strips.length})…`;
    const img  = await loadAsImage(strips[i]);
    const yPos = (i === strips.length - 1) ? Math.max(0, scrollH - vpH) : i * vpH;
    ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, 0, yPos, vpW, vpH);
  }

  bgImage = await createImageBitmap(canvas);
  canvas.style.maxHeight = "none";
  canvas.style.maxWidth  = "none";
  canvas.style.display   = "block";
  statusEl.style.display = "none";
  render();
  await idbDelete("pendingFullPage").catch(() => {});
}

// ── Geometry helpers ──────────────────────────────────────────────────────────
// Normalise rect so x1≤x2, y1≤y2 (needed for handle math)
function normRect(ann) {
  return {
    x1: Math.min(ann.x1, ann.x2), y1: Math.min(ann.y1, ann.y2),
    x2: Math.max(ann.x1, ann.x2), y2: Math.max(ann.y1, ann.y2),
  };
}

function getRectHandles(x1, y1, x2, y2) {
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  return [
    ["nw", x1, y1], ["n", mx, y1], ["ne", x2, y1],
    ["w",  x1, my],                ["e",  x2, my],
    ["sw", x1, y2], ["s", mx, y2], ["se", x2, y2],
  ];
}

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// Convert a desired on-screen pixel size to canvas units (accounts for CSS scale).
function scaledR(screenPx) {
  const r  = canvas.getBoundingClientRect();
  const sx = r.width  > 0 ? canvas.width  / r.width  : 1;
  const sy = r.height > 0 ? canvas.height / r.height : 1;
  return screenPx * (sx + sy) / 2;
}

// ── Hit testing ───────────────────────────────────────────────────────────────
function hitTest(ann, x, y) {
  const hr = scaledR(12); // handle hit radius
  const bt = scaledR(10); // body tolerance

  if (ann.type === "rect") {
    const { x1, y1, x2, y2 } = normRect(ann);
    for (const [name, hx, hy] of getRectHandles(x1, y1, x2, y2)) {
      if (Math.abs(x - hx) <= hr && Math.abs(y - hy) <= hr)
        return { hit: "handle", handle: name };
    }
    if (x >= x1 - bt && x <= x2 + bt && y >= y1 - bt && y <= y2 + bt)
      return { hit: "move" };
  }

  if (ann.type === "arrow") {
    if (Math.hypot(x - ann.x1, y - ann.y1) <= hr) return { hit: "handle", handle: "start" };
    if (Math.hypot(x - ann.x2, y - ann.y2) <= hr) return { hit: "handle", handle: "end" };
    if (distToSegment(x, y, ann.x1, ann.y1, ann.x2, ann.y2) <= scaledR(8 + ann.stroke))
      return { hit: "move" };
  }

  if (ann.type === "text") {
    const fontSize = Math.max(18, ann.stroke * 7);
    ctx.font = `bold ${fontSize}px Arial, sans-serif`;
    const w = ctx.measureText(ann.text).width;
    if (x >= ann.x1 - bt && x <= ann.x1 + w + bt &&
        y >= ann.y1 - fontSize - bt && y <= ann.y1 + bt)
      return { hit: "move" };
  }

  return null;
}

// Find topmost annotation under (x,y). Returns {index, hit, handle?} or null.
function findHit(x, y) {
  for (let i = annotations.length - 1; i >= 0; i--) {
    const result = hitTest(annotations[i], x, y);
    if (result) return { index: i, ...result };
  }
  return null;
}

// Apply a handle drag delta to a rect annotation (orig must already be normalised).
function applyRectHandle(orig, handle, dx, dy) {
  const out = { ...orig };
  switch (handle) {
    case "nw": out.x1 += dx; out.y1 += dy; break;
    case "n":               out.y1 += dy; break;
    case "ne": out.x2 += dx; out.y1 += dy; break;
    case "e":  out.x2 += dx;              break;
    case "se": out.x2 += dx; out.y2 += dy; break;
    case "s":               out.y2 += dy; break;
    case "sw": out.x1 += dx; out.y2 += dy; break;
    case "w":  out.x1 += dx;              break;
  }
  return out;
}

// ── Render ────────────────────────────────────────────────────────────────────
function render() {
  if (!bgImage) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bgImage, 0, 0);
  annotations.forEach((ann, i) => {
    drawAnnotation(ann);
    if (i === selectedIndex) drawSelectionOverlay(ann);
  });
  updateCtxBars();
}

// ── Context bars (one per annotation type) ────────────────────────────────────
function updateCtxBars() {
  const shapeBar = document.getElementById("ctx-bar-shapes");
  const textBar  = document.getElementById("ctx-bar-text");
  shapeBar.style.display = "none";
  textBar.style.display  = "none";

  const ann = selectedIndex >= 0 ? annotations[selectedIndex] : null;
  if (!ann) return;

  if (ann.type === "rect" || ann.type === "arrow") {
    positionCtxBar(shapeBar, ann);
  } else if (ann.type === "text") {
    positionCtxBar(textBar, ann);
  }

  syncColorUI();
  syncStrokeUI();
  syncBgUI();
}

function positionCtxBar(bar, ann) {
  const r  = canvas.getBoundingClientRect();
  const sx = r.width  / canvas.width;
  const sy = r.height / canvas.height;

  let anchorX, anchorY;

  if (ann.type === "rect") {
    const n  = normRect(ann);
    anchorX  = r.left + n.x1 * sx;
    anchorY  = r.top  + n.y2 * sy + 10;
  } else if (ann.type === "arrow") {
    // Anchor below the lower of the two endpoints
    anchorX  = r.left + Math.min(ann.x1, ann.x2) * sx;
    anchorY  = r.top  + Math.max(ann.y1, ann.y2) * sy + 14;
  } else if (ann.type === "text") {
    const pad = Math.max(5, ann.stroke * 2);
    anchorX   = r.left + ann.x1 * sx;
    anchorY   = r.top  + (ann.y1 + pad) * sy + 10;
  }

  // Keep bar on-screen
  bar.style.left    = `${Math.max(8, Math.min(anchorX, window.innerWidth  - bar.offsetWidth  - 8))}px`;
  bar.style.top     = `${Math.max(8, Math.min(anchorY, window.innerHeight - bar.offsetHeight - 8))}px`;
  bar.style.display = "flex";
}

function drawAnnotation(ann) {
  ctx.save();
  ctx.strokeStyle = ann.color;
  ctx.fillStyle   = ann.color;
  ctx.lineWidth   = ann.stroke;
  ctx.lineCap     = "round";
  ctx.lineJoin    = "round";

  if (ann.type === "rect") {
    const { x1, y1, x2, y2 } = normRect(ann);
    ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
  } else if (ann.type === "arrow") {
    drawArrow(ann.x1, ann.y1, ann.x2, ann.y2, ann.stroke);
  } else if (ann.type === "text") {
    const fontSize = Math.max(18, ann.stroke * 7);
    ctx.font = `bold ${fontSize}px Arial, sans-serif`;

    // Background pill behind the text
    const bg = ann.bgColor ?? activeBgColor;
    if (bg && bg !== "none") {
      const w   = ctx.measureText(ann.text).width;
      const pad = Math.max(5, ann.stroke * 2);
      ctx.save();
      ctx.globalAlpha = 0.88;
      ctx.fillStyle   = bg;
      ctx.shadowColor = "transparent";
      ctx.shadowBlur  = 0;
      // Slightly rounded rect via path
      const rx = ann.x1 - pad, ry = ann.y1 - fontSize - pad;
      const rw = w + pad * 2, rh = fontSize + pad * 2, r2 = 4;
      ctx.beginPath();
      ctx.moveTo(rx + r2, ry);
      ctx.lineTo(rx + rw - r2, ry);
      ctx.arcTo(rx + rw, ry,    rx + rw, ry + r2,    r2);
      ctx.lineTo(rx + rw, ry + rh - r2);
      ctx.arcTo(rx + rw, ry + rh, rx + rw - r2, ry + rh, r2);
      ctx.lineTo(rx + r2, ry + rh);
      ctx.arcTo(rx, ry + rh, rx, ry + rh - r2, r2);
      ctx.lineTo(rx, ry + r2);
      ctx.arcTo(rx, ry, rx + r2, ry, r2);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    ctx.shadowColor   = "rgba(0,0,0,0.6)";
    ctx.shadowBlur    = 3;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;
    ctx.fillText(ann.text, ann.x1, ann.y1);
  }

  ctx.restore();
}

function drawSelectionOverlay(ann) {
  const hs  = scaledR(5);    // handle half-size (≈5 px on screen)
  const lw  = scaledR(1.5);  // selection border line width
  const pad = scaledR(4);    // inset padding around annotation

  ctx.save();
  ctx.strokeStyle = "#4a90d9";
  ctx.fillStyle   = "#ffffff";
  ctx.lineWidth   = lw;

  if (ann.type === "rect") {
    const { x1, y1, x2, y2 } = normRect(ann);
    ctx.setLineDash([scaledR(5), scaledR(3)]);
    ctx.strokeRect(x1 - pad, y1 - pad, (x2 - x1) + pad * 2, (y2 - y1) + pad * 2);
    ctx.setLineDash([]);
    // 8 square handles
    for (const [, hx, hy] of getRectHandles(x1, y1, x2, y2)) {
      ctx.fillRect(hx - hs, hy - hs, hs * 2, hs * 2);
      ctx.strokeRect(hx - hs, hy - hs, hs * 2, hs * 2);
    }
  } else if (ann.type === "arrow") {
    ctx.setLineDash([]);
    const r = scaledR(7);
    [[ann.x1, ann.y1], [ann.x2, ann.y2]].forEach(([x, y]) => {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
  } else if (ann.type === "text") {
    const fontSize = Math.max(18, ann.stroke * 7);
    ctx.font = `bold ${fontSize}px Arial, sans-serif`;
    const w = ctx.measureText(ann.text).width;
    ctx.setLineDash([scaledR(5), scaledR(3)]);
    ctx.strokeRect(ann.x1 - pad, ann.y1 - fontSize - pad, w + pad * 2, fontSize + pad * 2);
    ctx.setLineDash([]);
    // Move handle: small square at top-left of text box
    ctx.fillRect(ann.x1 - pad - hs, ann.y1 - fontSize - pad - hs, hs * 2, hs * 2);
    ctx.strokeRect(ann.x1 - pad - hs, ann.y1 - fontSize - pad - hs, hs * 2, hs * 2);
  }

  ctx.restore();
}

function drawArrow(x1, y1, x2, y2, strokeW) {
  const angle   = Math.atan2(y2 - y1, x2 - x1);
  const headLen = Math.max(16, strokeW * 5);

  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
  ctx.stroke();
}

// ── Canvas coordinate helper ──────────────────────────────────────────────────
function canvasPos(e) {
  const r  = canvas.getBoundingClientRect();
  const sx = canvas.width  / r.width;
  const sy = canvas.height / r.height;
  return { x: (e.clientX - r.left) * sx, y: (e.clientY - r.top) * sy };
}

// ── Cursor management (select mode only) ──────────────────────────────────────
const HANDLE_CURSORS = {
  nw: "nw-resize", n: "ns-resize", ne: "ne-resize",
  e: "ew-resize",  se: "se-resize", s: "ns-resize",
  sw: "sw-resize", w: "ew-resize",
  start: "crosshair", end: "crosshair",
};

function updateCursor(x, y) {
  if (activeTool !== "select") return;
  const h = findHit(x, y);
  if (!h)                 { canvas.style.cursor = "default"; return; }
  if (h.hit === "handle") { canvas.style.cursor = HANDLE_CURSORS[h.handle] || "crosshair"; return; }
  canvas.style.cursor = "move";
}

// ── Mouse events ──────────────────────────────────────────────────────────────
canvas.addEventListener("mousedown", (e) => {
  if (e.button !== 0) return;
  const { x, y } = canvasPos(e);

  if (activeTool === "select") {
    const h = findHit(x, y);
    if (h) {
      selectedIndex = h.index;
      dragMode      = h.hit;
      dragHandle    = h.handle ?? null;
      dragAnchorX   = x;
      dragAnchorY   = y;
      // Normalise rect now so handle math is always clean
      if (annotations[h.index].type === "rect") {
        annotations[h.index] = { ...annotations[h.index], ...normRect(annotations[h.index]) };
      }
      dragOrigAnn = { ...annotations[h.index] };
    } else {
      selectedIndex = -1;
    }
    render();
    return;
  }

  if (activeTool === "text") return; // handled via click

  drawing    = true;
  drawStartX = x;
  drawStartY = y;
});

canvas.addEventListener("mousemove", (e) => {
  const { x, y } = canvasPos(e);

  // Update cursor when not dragging
  if (activeTool === "select" && !dragMode) {
    updateCursor(x, y);
  }

  // ── Handle drag ──
  if (dragMode) {
    const dx = x - dragAnchorX;
    const dy = y - dragAnchorY;
    const ann = annotations[selectedIndex];

    if (dragMode === "move") {
      annotations[selectedIndex] = {
        ...dragOrigAnn,
        x1: dragOrigAnn.x1 + dx, y1: dragOrigAnn.y1 + dy,
        x2: dragOrigAnn.x2 + dx, y2: dragOrigAnn.y2 + dy,
      };
    } else { // "handle"
      if (ann.type === "rect") {
        annotations[selectedIndex] = applyRectHandle(dragOrigAnn, dragHandle, dx, dy);
      } else if (ann.type === "arrow") {
        const out = { ...dragOrigAnn };
        if (dragHandle === "start") { out.x1 = dragOrigAnn.x1 + dx; out.y1 = dragOrigAnn.y1 + dy; }
        if (dragHandle === "end")   { out.x2 = dragOrigAnn.x2 + dx; out.y2 = dragOrigAnn.y2 + dy; }
        annotations[selectedIndex] = out;
      }
    }
    render();
    return;
  }

  // ── Draw preview ──
  if (!drawing) return;
  render();
  ctx.save();
  ctx.strokeStyle = activeColor;
  ctx.fillStyle   = activeColor;
  ctx.lineWidth   = activeStroke;
  ctx.lineCap     = "round";
  ctx.lineJoin    = "round";
  ctx.globalAlpha = 0.75;
  if (activeTool === "rect")  ctx.strokeRect(drawStartX, drawStartY, x - drawStartX, y - drawStartY);
  if (activeTool === "arrow") drawArrow(drawStartX, drawStartY, x, y, activeStroke);
  ctx.restore();
});

canvas.addEventListener("mouseup", (e) => {
  // Finish a drag
  if (dragMode) {
    dragMode    = null;
    dragOrigAnn = null;
    render();
    return;
  }

  if (!drawing) return;
  drawing = false;
  const { x, y } = canvasPos(e);
  if (Math.abs(x - drawStartX) < 5 && Math.abs(y - drawStartY) < 5) { render(); return; }

  // Commit the annotation, normalise rects so handles work cleanly
  let ann = { type: activeTool, x1: drawStartX, y1: drawStartY, x2: x, y2: y, color: activeColor, stroke: activeStroke };
  if (ann.type === "rect") ann = { ...ann, ...normRect(ann) };
  annotations.push(ann);
  selectedIndex = annotations.length - 1;

  // Auto-switch to select so the user can immediately reposition / resize
  activeTool = "select";
  syncToolUI();
  render();
});

// Stop drag if mouse released anywhere (including outside canvas)
document.addEventListener("mouseup", () => {
  if (dragMode) { dragMode = null; dragOrigAnn = null; render(); }
  if (drawing)  { drawing  = false; render(); }
});

canvas.addEventListener("mouseleave", () => {
  if (!dragMode) canvas.style.cursor = "";
});

// Single-click in text mode → open input
canvas.addEventListener("click", (e) => {
  if (activeTool !== "text") return;
  const { x, y } = canvasPos(e);
  showTextInput(x, y, e.clientX, e.clientY);
});

// Double-click in select mode on a text annotation → re-open input to edit
canvas.addEventListener("dblclick", (e) => {
  if (activeTool !== "select") return;
  const { x, y } = canvasPos(e);
  const h = findHit(x, y);
  if (!h || annotations[h.index].type !== "text") return;
  selectedIndex = h.index;
  const ann = annotations[h.index];
  // Remove the annotation temporarily; re-add on commit
  annotations.splice(h.index, 1);
  selectedIndex = -1;
  render();
  showTextInput(ann.x1, ann.y1, e.clientX, e.clientY, ann.text);
});

// ── Inline text input ─────────────────────────────────────────────────────────
function showTextInput(canvX, canvY, screenX, screenY, prefill = "") {
  const old = document.getElementById("__fia_txt__");
  if (old) old.remove();

  const wrap      = document.createElement("div");
  wrap.id         = "__fia_txt__";
  wrap.style.cssText = `position:fixed;left:${screenX}px;top:${screenY}px;z-index:9999;`;

  const input = document.createElement("input");
  input.type        = "text";
  input.value       = prefill;
  input.placeholder = "Type and press Enter…";
  input.style.cssText = [
    "background:#1e2538", "border:2px solid " + activeColor,
    "color:#fff", "font-size:16px", "font-weight:700",
    "padding:5px 10px", "border-radius:5px", "outline:none",
    "min-width:200px", "max-width:420px",
    "box-shadow:0 4px 16px rgba(0,0,0,.5)",
  ].join(";");
  wrap.appendChild(input);
  document.body.appendChild(wrap);
  input.focus();
  input.select();

  function commit() {
    const text = input.value.trim();
    wrap.remove();
    if (!text) return;
    annotations.push({ type: "text", x1: canvX, y1: canvY, text, color: activeColor, stroke: activeStroke, bgColor: activeBgColor });
    selectedIndex = annotations.length - 1;
    // Auto-switch to select so the user can immediately drag the text
    activeTool = "select";
    syncToolUI();
    render();
  }

  input.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter")  commit();
    if (ev.key === "Escape") wrap.remove();
    ev.stopPropagation();
  });
  input.addEventListener("blur", () => setTimeout(() => { if (document.contains(wrap)) wrap.remove(); }, 150));
}

// ── Toolbar: tools ────────────────────────────────────────────────────────────
["select", "rect", "arrow", "text"].forEach(t => {
  document.getElementById(`tool-${t}`).addEventListener("click", () => {
    activeTool = t;
    if (t !== "select") { selectedIndex = -1; render(); }
    syncToolUI();
  });
});

document.addEventListener("keydown", (e) => {
  if (document.getElementById("__fia_txt__")) return;
  if (e.key === "Escape" || e.key === "v" || e.key === "V") { activeTool = "select"; syncToolUI(); }
  if (e.key === "r" || e.key === "R") { activeTool = "rect";  selectedIndex = -1; render(); syncToolUI(); }
  if (e.key === "a" || e.key === "A") { activeTool = "arrow"; selectedIndex = -1; render(); syncToolUI(); }
  if (e.key === "t" || e.key === "T") { activeTool = "text";  selectedIndex = -1; render(); syncToolUI(); }

  if ((e.ctrlKey || e.metaKey) && e.key === "z") {
    annotations.pop();
    if (selectedIndex >= annotations.length) selectedIndex = -1;
    render();
  }

  // Delete / Backspace removes selected annotation
  if ((e.key === "Delete" || e.key === "Backspace") && selectedIndex >= 0 && activeTool === "select") {
    annotations.splice(selectedIndex, 1);
    selectedIndex = -1;
    render();
  }
});

// ── Toolbar: text color ───────────────────────────────────────────────────────
document.querySelectorAll(".swatch").forEach(el => {
  el.addEventListener("click", () => {
    activeColor = el.dataset.color;
    // Live-update selected annotation's colour
    if (selectedIndex >= 0) {
      annotations[selectedIndex] = { ...annotations[selectedIndex], color: activeColor };
      render();
    }
    syncColorUI();
  });
});

// ── Toolbar: text background color ────────────────────────────────────────────
document.querySelectorAll(".bg-swatch").forEach(el => {
  el.addEventListener("click", () => {
    activeBgColor = el.dataset.bgColor;
    // Live-update selected text annotation's background
    if (selectedIndex >= 0 && annotations[selectedIndex].type === "text") {
      annotations[selectedIndex] = { ...annotations[selectedIndex], bgColor: activeBgColor };
      render();
    }
    syncBgUI();
  });
});

// ── Toolbar: stroke size ──────────────────────────────────────────────────────
document.querySelectorAll(".stroke-btn").forEach(el => {
  el.addEventListener("click", () => {
    activeStroke = parseInt(el.dataset.stroke, 10);
    // Live-update selected annotation's stroke
    if (selectedIndex >= 0) {
      annotations[selectedIndex] = { ...annotations[selectedIndex], stroke: activeStroke };
      render();
    }
    syncStrokeUI();
  });
});

// ── Undo / Clear ──────────────────────────────────────────────────────────────
document.getElementById("btn-undo").addEventListener("click", () => {
  annotations.pop();
  if (selectedIndex >= annotations.length) selectedIndex = -1;
  render();
});

document.getElementById("btn-clear").addEventListener("click", () => {
  if (!annotations.length) return;
  annotations   = [];
  selectedIndex = -1;
  render();
});

// ── Discard ───────────────────────────────────────────────────────────────────
document.getElementById("btn-discard").addEventListener("click", async () => {
  await chrome.storage.session.remove("pendingAnnotation").catch(() => {});
  if (isFullPage) await idbDelete("pendingFullPage").catch(() => {});
  window.close();
});

// ── Save ──────────────────────────────────────────────────────────────────────
document.getElementById("btn-save").addEventListener("click", async () => {
  const btn = document.getElementById("btn-save");
  btn.disabled    = true;
  btn.textContent = "Saving…";

  try {
    const { apiKey } = await chrome.storage.local.get("apiKey");
    if (!apiKey) throw new Error("Not logged in — open the FIA Toolkit extension first.");

    // Deselect before exporting so handles don't appear in the saved image
    selectedIndex = -1;
    render();

    const blob = await new Promise((res, rej) => {
      canvas.toBlob(b => b ? res(b) : rej(new Error("Canvas export failed")), "image/png");
    });

    const upRes = await fetch(`${API_BASE}/api/v1/swipe/request-upload-url`, {
      method: "POST", headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!upRes.ok) throw new Error(`Upload URL failed (${upRes.status})`);
    const { uploadURL, objectPath } = await upRes.json();

    const putRes = await fetch(uploadURL, {
      method: "PUT", headers: { "Content-Type": "image/png" }, body: blob,
    });
    if (!putRes.ok) throw new Error(`Upload failed (${putRes.status})`);

    const saveRes = await fetch(`${API_BASE}/api/v1/swipe`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ type: "upload", title: pendingTitle, imagePath: objectPath }),
    });
    if (!saveRes.ok) throw new Error(`Save failed (${saveRes.status})`);
    const { item } = await saveRes.json();

    try {
      await fetch(`${API_BASE}/api/v1/swipe/${item.id}/share`, {
        method: "POST", headers: { Authorization: `Bearer ${apiKey}` },
      });
    } catch (_) {}

    await chrome.storage.session.remove("pendingAnnotation").catch(() => {});
    if (isFullPage) await idbDelete("pendingFullPage").catch(() => {});
    await chrome.storage.session.set({ swipeRecentlySaved: true });

    btn.textContent      = "✓ Saved!";
    btn.style.background = "linear-gradient(135deg,#34c172,#1a9e55)";
    btn.style.boxShadow  = "0 2px 12px rgba(26,158,85,.6)";
    setTimeout(() => window.close(), 1100);

  } catch (err) {
    btn.disabled    = false;
    btn.textContent = "Save to Swipe File ✓";
    alert(`Save failed: ${err.message}`);
  }
});

// ── UI sync helpers ───────────────────────────────────────────────────────────
function syncToolUI() {
  ["select", "rect", "arrow", "text"].forEach(t => {
    document.getElementById(`tool-${t}`).classList.toggle("active", t === activeTool);
  });
  if      (activeTool === "text")   canvas.style.cursor = "text";
  else if (activeTool === "select") canvas.style.cursor = "default";
  else                              canvas.style.cursor = "crosshair";
}

function syncColorUI() {
  document.querySelectorAll(".swatch").forEach(el => {
    el.classList.toggle("active", el.dataset.color === activeColor);
  });
}

function syncBgUI() {
  document.querySelectorAll(".bg-swatch").forEach(el => {
    el.classList.toggle("active", el.dataset.bgColor === activeBgColor);
  });
}

function syncStrokeUI() {
  document.querySelectorAll(".stroke-btn").forEach(el => {
    el.classList.toggle("active", el.dataset.stroke === String(activeStroke));
  });
}
