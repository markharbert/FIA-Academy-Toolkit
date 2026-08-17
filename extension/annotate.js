"use strict";

const API_BASE = "https://toolkit.fearlessmarketinglab.com";

const canvas   = document.getElementById("canvas");
const ctx      = canvas.getContext("2d");
const statusEl = document.getElementById("status");

let bgImage      = null;
let annotations  = [];
let activeTool   = "rect";
let activeColor  = "#e74c3c";
let activeStroke = 3;
let drawing      = false;
let startX = 0, startY = 0;
let pendingTitle = "Screenshot";
let isFullPage   = false; // true when loaded from IndexedDB full-page strip set

// ── IndexedDB helpers ─────────────────────────────────────────────────────────
// Shared with service-worker.js (same DB name + object store).
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

// ── Load a data-URL string into an HTMLImageElement ───────────────────────────
function loadAsImage(src) {
  return new Promise((resolve, reject) => {
    const img   = new Image();
    img.onload  = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to decode strip"));
    img.src     = src;
  });
}

// ── Entry point: check session storage first, then IndexedDB ──────────────────
(async () => {
  try {
    // 1. Visible-area / section capture → session storage
    const { pendingAnnotation } = await chrome.storage.session.get("pendingAnnotation");
    if (pendingAnnotation?.dataUrl) {
      await initSingleImage(pendingAnnotation.dataUrl, pendingAnnotation.title);
      return;
    }

    // 2. Full-page capture → IndexedDB
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

// ── Single image (visible area / section) ────────────────────────────────────
async function initSingleImage(dataUrl, title) {
  pendingTitle = title || "Screenshot";
  const img    = await loadAsImage(dataUrl);

  bgImage       = img;
  canvas.width  = img.naturalWidth;
  canvas.height = img.naturalHeight;

  // Hide status before showing canvas so flex layout doesn't briefly show both.
  statusEl.style.display = "none";

  // Scale display down to fit the viewport; preserve aspect ratio via maxHeight.
  // max-width: 100% from the stylesheet handles width — leave maxWidth unset.
  const maxH = window.innerHeight - 54 - 48; // toolbar (54px) + wrap padding (24px*2)
  canvas.style.maxHeight = maxH + "px";
  canvas.style.display   = "block";
  render();
}

// ── Full page (multi-strip stitch) ────────────────────────────────────────────
async function initFullPage({ strips, title, scrollH, vpH, vpW }) {
  pendingTitle = title || "Full Page";

  // Show progress while stitching
  statusEl.textContent   = `Stitching full page (0 / ${strips.length})…`;
  statusEl.style.display = "block";

  // Canvas at logical-pixel resolution — stays within Chrome's 32 767 px dimension limit.
  // Each strip was already scaled to logical resolution in the service worker.
  canvas.width  = vpW;
  canvas.height = scrollH;

  for (let i = 0; i < strips.length; i++) {
    statusEl.textContent = `Stitching full page (${i + 1} / ${strips.length})…`;
    const img = await loadAsImage(strips[i]);
    // Last strip flushes to the exact page bottom (mirrors SW capture logic).
    const yPos = (i === strips.length - 1) ? Math.max(0, scrollH - vpH) : i * vpH;
    // Strips are already vpW × vpH — draw 1:1, no scaling needed.
    ctx.drawImage(img, 0, yPos);
  }

  // Snapshot stitched canvas as ImageBitmap so render() can clear+redraw cheaply.
  bgImage = await createImageBitmap(canvas);

  // Full page: override the stylesheet's max-width/max-height so the canvas
  // renders at its natural logical-pixel size; the canvas-wrap div scrolls.
  // (removeProperty only affects inline styles, so we set inline overrides instead.)
  canvas.style.maxHeight = "none";
  canvas.style.maxWidth  = "none";
  canvas.style.display   = "block";
  statusEl.style.display = "none";

  render();

  // Free IndexedDB slot; if the user discards, the handler is a no-op.
  await idbDelete("pendingFullPage").catch(() => {});
}

// ── Render ────────────────────────────────────────────────────────────────────
function render() {
  if (!bgImage) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bgImage, 0, 0);
  annotations.forEach(ann => drawAnnotation(ann));
}

function drawAnnotation(ann) {
  ctx.save();
  ctx.strokeStyle = ann.color;
  ctx.fillStyle   = ann.color;
  ctx.lineWidth   = ann.stroke;
  ctx.lineCap     = "round";
  ctx.lineJoin    = "round";

  if (ann.type === "rect") {
    ctx.strokeRect(ann.x1, ann.y1, ann.x2 - ann.x1, ann.y2 - ann.y1);

  } else if (ann.type === "arrow") {
    drawArrow(ann.x1, ann.y1, ann.x2, ann.y2, ann.stroke);

  } else if (ann.type === "text") {
    const fontSize = Math.max(18, ann.stroke * 7);
    ctx.font = `bold ${fontSize}px Arial, sans-serif`;
    ctx.shadowColor   = "rgba(0,0,0,0.6)";
    ctx.shadowBlur    = 3;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;
    ctx.fillText(ann.text, ann.x1, ann.y1);
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

// ── Canvas coordinate helper (CSS scale-aware) ────────────────────────────────
// Works correctly whether the canvas is CSS-scaled (single image) or natural-size (full page).
function canvasPos(e) {
  const r  = canvas.getBoundingClientRect();
  const sx = canvas.width  / r.width;
  const sy = canvas.height / r.height;
  return { x: (e.clientX - r.left) * sx, y: (e.clientY - r.top) * sy };
}

// ── Mouse/pointer events ──────────────────────────────────────────────────────
canvas.addEventListener("mousedown", (e) => {
  if (activeTool === "text") return;
  const { x, y } = canvasPos(e);
  drawing = true;
  startX  = x;
  startY  = y;
});

canvas.addEventListener("mousemove", (e) => {
  if (!drawing) return;
  const { x, y } = canvasPos(e);
  render();
  ctx.save();
  ctx.strokeStyle = activeColor;
  ctx.fillStyle   = activeColor;
  ctx.lineWidth   = activeStroke;
  ctx.lineCap     = "round";
  ctx.lineJoin    = "round";
  ctx.globalAlpha = 0.75;
  if (activeTool === "rect")  ctx.strokeRect(startX, startY, x - startX, y - startY);
  if (activeTool === "arrow") drawArrow(startX, startY, x, y, activeStroke);
  ctx.restore();
});

canvas.addEventListener("mouseup", (e) => {
  if (!drawing) return;
  drawing = false;
  const { x, y } = canvasPos(e);
  if (Math.abs(x - startX) < 5 && Math.abs(y - startY) < 5) { render(); return; }
  annotations.push({ type: activeTool, x1: startX, y1: startY, x2: x, y2: y, color: activeColor, stroke: activeStroke });
  render();
});

canvas.addEventListener("mouseleave", () => {
  if (drawing) { drawing = false; render(); }
});

canvas.addEventListener("click", (e) => {
  if (activeTool !== "text") return;
  const { x, y } = canvasPos(e);
  showTextInput(x, y, e.clientX, e.clientY);
});

// ── Inline text input ─────────────────────────────────────────────────────────
function showTextInput(canvX, canvY, screenX, screenY) {
  const old = document.getElementById("__fia_txt__");
  if (old) old.remove();

  const wrap  = document.createElement("div");
  wrap.id     = "__fia_txt__";
  wrap.style.cssText = `position:fixed;left:${screenX}px;top:${screenY}px;z-index:9999;`;

  const input = document.createElement("input");
  input.type        = "text";
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

  function commit() {
    const text = input.value.trim();
    wrap.remove();
    if (!text) return;
    annotations.push({ type: "text", x1: canvX, y1: canvY, text, color: activeColor, stroke: activeStroke });
    render();
  }

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter")  commit();
    if (e.key === "Escape") wrap.remove();
    e.stopPropagation();
  });
  input.addEventListener("blur", () => setTimeout(() => { if (document.contains(wrap)) wrap.remove(); }, 150));
}

// ── Toolbar: tools ────────────────────────────────────────────────────────────
["rect", "arrow", "text"].forEach(t => {
  document.getElementById(`tool-${t}`).addEventListener("click", () => {
    activeTool = t;
    syncToolUI();
  });
});

document.addEventListener("keydown", (e) => {
  if (document.getElementById("__fia_txt__")) return;
  if (e.key === "r" || e.key === "R") { activeTool = "rect";  syncToolUI(); }
  if (e.key === "a" || e.key === "A") { activeTool = "arrow"; syncToolUI(); }
  if (e.key === "t" || e.key === "T") { activeTool = "text";  syncToolUI(); }
  if ((e.ctrlKey || e.metaKey) && e.key === "z") { annotations.pop(); render(); }
});

// ── Toolbar: colors ───────────────────────────────────────────────────────────
document.querySelectorAll(".swatch").forEach(el => {
  el.addEventListener("click", () => {
    activeColor = el.dataset.color;
    syncColorUI();
  });
});

// ── Toolbar: stroke size ──────────────────────────────────────────────────────
document.querySelectorAll(".stroke-btn").forEach(el => {
  el.addEventListener("click", () => {
    activeStroke = parseInt(el.dataset.stroke, 10);
    syncStrokeUI();
  });
});

// ── Undo / Clear ──────────────────────────────────────────────────────────────
document.getElementById("btn-undo").addEventListener("click", () => { annotations.pop(); render(); });

document.getElementById("btn-clear").addEventListener("click", () => {
  if (!annotations.length) return;
  annotations = [];
  render();
});

// ── Discard ───────────────────────────────────────────────────────────────────
document.getElementById("btn-discard").addEventListener("click", async () => {
  // Clean up whichever storage mechanism was used
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

    // Export final annotated canvas to PNG blob
    render();
    const blob = await new Promise((res, rej) => {
      canvas.toBlob(b => b ? res(b) : rej(new Error("Canvas export failed")), "image/png");
    });

    // 1. Request signed upload URL
    const upRes = await fetch(`${API_BASE}/api/v1/swipe/request-upload-url`, {
      method: "POST", headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!upRes.ok) throw new Error(`Upload URL failed (${upRes.status})`);
    const { uploadURL, objectPath } = await upRes.json();

    // 2. PUT blob to GCS
    const putRes = await fetch(uploadURL, {
      method: "PUT", headers: { "Content-Type": "image/png" }, body: blob,
    });
    if (!putRes.ok) throw new Error(`Upload failed (${putRes.status})`);

    // 3. Create swipe item
    const saveRes = await fetch(`${API_BASE}/api/v1/swipe`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ type: "upload", title: pendingTitle, imagePath: objectPath }),
    });
    if (!saveRes.ok) throw new Error(`Save failed (${saveRes.status})`);
    const { item } = await saveRes.json();

    // 4. Auto-generate share token
    try {
      await fetch(`${API_BASE}/api/v1/swipe/${item.id}/share`, {
        method: "POST", headers: { Authorization: `Bearer ${apiKey}` },
      });
    } catch (_) {}

    // 5. Clean up pending data and signal popup to refresh
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
  ["rect", "arrow", "text"].forEach(t => {
    document.getElementById(`tool-${t}`).classList.toggle("active", t === activeTool);
  });
  canvas.className = activeTool === "text" ? "cur-text" : "";
}

function syncColorUI() {
  document.querySelectorAll(".swatch").forEach(el => {
    el.classList.toggle("active", el.dataset.color === activeColor);
  });
}

function syncStrokeUI() {
  document.querySelectorAll(".stroke-btn").forEach(el => {
    el.classList.toggle("active", el.dataset.stroke === String(activeStroke));
  });
}
