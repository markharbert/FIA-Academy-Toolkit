"use strict";

const API_BASE = "https://toolkit.fearlessmarketinglab.com";

const canvas = document.getElementById("canvas");
const ctx    = canvas.getContext("2d");
const statusEl = document.getElementById("status");

let bgImage      = null;
let annotations  = [];   // committed annotations
let activeTool   = "rect";
let activeColor  = "#e74c3c";
let activeStroke = 3;
let drawing      = false;
let startX = 0, startY = 0;
let pendingTitle = "Screenshot";
let apiKey       = "";

// ── Load image from session storage ──────────────────────────────────────────
chrome.storage.session.get("pendingAnnotation", ({ pendingAnnotation }) => {
  if (!pendingAnnotation?.dataUrl) {
    statusEl.innerHTML = "No screenshot found.<br>Close this tab and capture again.";
    return;
  }
  pendingTitle = pendingAnnotation.title || "Screenshot";

  const img = new Image();
  img.onload = () => {
    bgImage = img;
    canvas.width  = img.naturalWidth;
    canvas.height = img.naturalHeight;
    // Scale display down so it fits the viewport (CSS max-width handles width;
    // set an explicit pixel height cap so tall pages don't overflow)
    // Cap display height so tall pages don't overflow; max-width:100% handles width.
    // Using maxHeight (not height) lets CSS preserve the aspect ratio on both axes.
    const maxH = window.innerHeight - 54 - 48; // toolbar + padding
    canvas.style.maxHeight = maxH + "px";
    canvas.style.display = "block";
    statusEl.style.display = "none";
    render();
  };
  img.onerror = () => { statusEl.textContent = "Failed to load screenshot."; };
  img.src = pendingAnnotation.dataUrl;
});

chrome.storage.local.get("apiKey", ({ apiKey: k }) => { apiKey = k || ""; });

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

  // Two-line arrowhead
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(
    x2 - headLen * Math.cos(angle - Math.PI / 6),
    y2 - headLen * Math.sin(angle - Math.PI / 6)
  );
  ctx.moveTo(x2, y2);
  ctx.lineTo(
    x2 - headLen * Math.cos(angle + Math.PI / 6),
    y2 - headLen * Math.sin(angle + Math.PI / 6)
  );
  ctx.stroke();
}

// ── Canvas coordinate helper (CSS scale-aware) ────────────────────────────────
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
  render(); // clear preview
  ctx.save();
  ctx.strokeStyle  = activeColor;
  ctx.fillStyle    = activeColor;
  ctx.lineWidth    = activeStroke;
  ctx.lineCap      = "round";
  ctx.lineJoin     = "round";
  ctx.globalAlpha  = 0.75;
  if (activeTool === "rect") {
    ctx.strokeRect(startX, startY, x - startX, y - startY);
  } else if (activeTool === "arrow") {
    drawArrow(startX, startY, x, y, activeStroke);
  }
  ctx.restore();
});

canvas.addEventListener("mouseup", (e) => {
  if (!drawing) return;
  drawing = false;
  const { x, y } = canvasPos(e);
  // Ignore tiny drags (accidental clicks)
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

// ── Inline text input (no prompt — works in extension pages) ─────────────────
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
    "background:#1e2538",
    "border:2px solid " + activeColor,
    "color:#fff",
    "font-size:16px",
    "font-weight:700",
    "padding:5px 10px",
    "border-radius:5px",
    "outline:none",
    "min-width:200px",
    "max-width:420px",
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
  // Delay blur handler so Enter has time to commit first
  input.addEventListener("blur", () => setTimeout(() => { if (document.contains(wrap)) wrap.remove(); }, 150));
}

// ── Toolbar: tools ────────────────────────────────────────────────────────────
["rect", "arrow", "text"].forEach(t => {
  document.getElementById(`tool-${t}`).addEventListener("click", () => {
    activeTool = t;
    syncToolUI();
  });
});

// Keyboard shortcuts
document.addEventListener("keydown", (e) => {
  if (document.getElementById("__fia_txt__")) return; // typing in text input
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
document.getElementById("btn-undo").addEventListener("click", () => {
  annotations.pop();
  render();
});

document.getElementById("btn-clear").addEventListener("click", () => {
  if (annotations.length === 0) return;
  annotations = [];
  render();
});

// ── Discard ───────────────────────────────────────────────────────────────────
document.getElementById("btn-discard").addEventListener("click", () => {
  chrome.storage.session.remove("pendingAnnotation");
  window.close();
});

// ── Save ──────────────────────────────────────────────────────────────────────
document.getElementById("btn-save").addEventListener("click", async () => {
  if (!apiKey) {
    alert("Not logged in. Open the FIA Toolkit extension first.");
    return;
  }

  const btn = document.getElementById("btn-save");
  btn.disabled    = true;
  btn.textContent = "Saving…";

  try {
    // Render final state, then export canvas to blob
    render();
    const blob = await new Promise((res, rej) => {
      canvas.toBlob(b => b ? res(b) : rej(new Error("Canvas export failed")), "image/png");
    });

    // 1. Request signed upload URL
    const upRes = await fetch(`${API_BASE}/api/v1/swipe/request-upload-url`, {
      method:  "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!upRes.ok) throw new Error(`Upload URL failed (${upRes.status})`);
    const { uploadURL, objectPath } = await upRes.json();

    // 2. Upload PNG blob directly to GCS
    const putRes = await fetch(uploadURL, {
      method:  "PUT",
      headers: { "Content-Type": "image/png" },
      body:    blob,
    });
    if (!putRes.ok) throw new Error(`Upload failed (${putRes.status})`);

    // 3. Create swipe item
    const saveRes = await fetch(`${API_BASE}/api/v1/swipe`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body:    JSON.stringify({ type: "upload", title: pendingTitle, imagePath: objectPath }),
    });
    if (!saveRes.ok) throw new Error(`Save failed (${saveRes.status})`);
    const { item } = await saveRes.json();

    // 4. Auto-generate share token
    try {
      await fetch(`${API_BASE}/api/v1/swipe/${item.id}/share`, {
        method:  "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
      });
    } catch (_) {}

    // 5. Signal popup to refresh
    await chrome.storage.session.remove("pendingAnnotation");
    await chrome.storage.session.set({ swipeRecentlySaved: true });

    btn.textContent       = "✓ Saved!";
    btn.style.background  = "linear-gradient(135deg,#34c172,#1a9e55)";
    btn.style.boxShadow   = "0 2px 12px rgba(26,158,85,.6)";
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
