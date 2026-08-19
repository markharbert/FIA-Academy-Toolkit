"use strict";

// FIA Toolkit — Draw
// A temporary, local-only drawing overlay for live demos and recordings.

(() => {
  const ROOT_ID = "__fia_draw__";
  const STYLE_ID = "__fia_draw_style__";

  // A second launch is a deliberate toggle, matching the other page tools.
  if (document.getElementById(ROOT_ID)) {
    if (window.__fiaDrawOverlay?.destroy) window.__fiaDrawOverlay.destroy();
    else {
      document.getElementById(ROOT_ID)?.remove();
      document.getElementById(STYLE_ID)?.remove();
    }
    return;
  }

  const TOOLS = {
    pencil: { label: "Pencil", icon: "✏️", size: 2, smoothing: 0, alpha: 1, composite: "source-over" },
    pen: { label: "Pen", icon: "🖊️", size: 4, smoothing: 0.42, alpha: 1, composite: "source-over" },
    highlighter: { label: "Highlight", icon: "🟡", size: 22, smoothing: 0.5, alpha: 0.38, composite: "source-over" },
    eraser: { label: "Eraser", icon: "⌫", size: 24, smoothing: 0, alpha: 1, composite: "destination-out" },
  };
  const COLORS = [
    ["Red", "#e74c3c"], ["Orange", "#e67e22"], ["Yellow", "#f1c40f"],
    ["Green", "#2ecc71"], ["Blue", "#3498db"], ["White", "#ffffff"], ["Black", "#1a1a2e"],
  ];

  let activeTool = "pen";
  let activeColor = "#e74c3c";
  let activeSize = TOOLS.pen.size;
  let drawing = false;
  let pointerId = null;
  let lastPoint = { x: 0, y: 0 };
  let smoothPoint = { x: 0, y: 0 };
  let dragState = null;
  let toolbarPosition = { x: 16, y: 16 };
  let canvasCssWidth = 0;
  let canvasCssHeight = 0;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    :host {
      all: initial !important; position: fixed !important; inset: 0 !important;
      z-index: 2147483647 !important; pointer-events: none !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
    }
    :host, :host * { box-sizing: border-box !important; }
    .fia-draw-canvas {
      position: fixed !important; inset: 0 !important; display: block !important;
      width: 100% !important; height: 100% !important; pointer-events: auto !important;
      cursor: crosshair !important; touch-action: none !important;
    }
    .fia-draw-toolbar {
      position: fixed !important; display: flex !important; flex-direction: column !important;
      gap: 8px !important; width: 236px !important; padding: 10px !important;
      color: #f5f7fb !important; background: rgba(21,24,39,.96) !important;
      border: 1px solid rgba(255,255,255,.16) !important; border-radius: 12px !important;
      box-shadow: 0 10px 30px rgba(0,0,0,.42), 0 0 0 1px rgba(0,0,0,.18) !important;
      backdrop-filter: blur(10px) !important; -webkit-backdrop-filter: blur(10px) !important;
      pointer-events: auto !important; user-select: none !important; -webkit-user-select: none !important;
    }
    .fia-draw-handle {
      display: flex !important; align-items: center !important; justify-content: space-between !important;
      padding-bottom: 7px !important; border-bottom: 1px solid rgba(255,255,255,.12) !important;
      cursor: grab !important; touch-action: none !important;
    }
    .fia-draw-handle:active { cursor: grabbing !important; }
    .fia-draw-title {
      color: rgba(255,255,255,.56) !important; font-size: 10px !important; font-weight: 750 !important;
      letter-spacing: .08em !important; text-transform: uppercase !important;
    }
    button {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
      cursor: pointer !important;
    }
    .fia-draw-close {
      width: 22px !important; height: 22px !important; padding: 0 !important; border: 0 !important;
      border-radius: 5px !important; color: rgba(255,255,255,.55) !important;
      background: transparent !important; font-size: 18px !important; line-height: 20px !important;
    }
    .fia-draw-close:hover { color: #fff !important; background: rgba(255,255,255,.12) !important; }
    .fia-draw-tools, .fia-draw-actions {
      display: flex !important; gap: 5px !important;
    }
    .fia-draw-tool-btn {
      flex: 1 1 0 !important; display: flex !important; flex-direction: column !important;
      align-items: center !important; gap: 3px !important; min-width: 0 !important;
      padding: 6px 3px !important; border: 1px solid rgba(255,255,255,.15) !important;
      border-radius: 8px !important; color: rgba(255,255,255,.72) !important;
      background: transparent !important; font-size: 9px !important; font-weight: 650 !important;
      line-height: 1.15 !important; white-space: nowrap !important;
    }
    .fia-draw-tool-btn:hover,
    .fia-draw-action-btn:hover {
      color: #fff !important; background: rgba(255,255,255,.08) !important;
      border-color: rgba(255,255,255,.38) !important;
    }
    .fia-draw-tool-btn.active {
      color: #fff !important; background: rgba(63,146,204,.24) !important; border-color: #3f92cc !important;
    }
    .fia-draw-tool-icon { font-size: 15px !important; line-height: 1 !important; }
    .fia-draw-section-label {
      margin-bottom: -4px !important; color: rgba(255,255,255,.38) !important;
      font-size: 9px !important; font-weight: 750 !important; letter-spacing: .08em !important;
      text-transform: uppercase !important;
    }
    .fia-draw-colors { display: flex !important; flex-wrap: wrap !important; gap: 6px !important; }
    .fia-draw-color-btn {
      width: 21px !important; height: 21px !important; padding: 0 !important;
      border: 2px solid rgba(255,255,255,.2) !important; border-radius: 50% !important;
      transition: transform .12s, border-color .12s !important;
    }
    .fia-draw-color-btn:hover { transform: scale(1.16) !important; border-color: rgba(255,255,255,.6) !important; }
    .fia-draw-color-btn.active {
      transform: scale(1.12) !important; border-color: #fff !important; box-shadow: 0 0 0 2px #3f92cc !important;
    }
    .fia-draw-size-row { display: flex !important; align-items: center !important; gap: 9px !important; }
    .fia-draw-size-slider {
      flex: 1 !important; width: 100% !important; height: 4px !important; margin: 0 !important;
      accent-color: #3f92cc !important; cursor: pointer !important;
    }
    .fia-draw-size-value {
      min-width: 27px !important; color: rgba(255,255,255,.65) !important; text-align: right !important;
      font: 700 10px/1 ui-monospace, SFMono-Regular, Menlo, monospace !important;
    }
    .fia-draw-action-btn {
      flex: 1 !important; padding: 6px 5px !important; border: 1px solid rgba(255,255,255,.15) !important;
      border-radius: 7px !important; color: rgba(255,255,255,.72) !important; background: transparent !important;
      font-size: 10px !important; font-weight: 650 !important;
    }
    .fia-draw-clear:hover { color: #ff8a8a !important; border-color: #e74c3c !important; }
  `;

  const root = document.createElement("div");
  root.id = ROOT_ID;
  root.setAttribute("role", "application");
  root.setAttribute("aria-label", "FIA drawing overlay");
  const shadow = root.attachShadow({ mode: "open" });

  const canvas = document.createElement("canvas");
  canvas.className = "fia-draw-canvas";
  canvas.setAttribute("aria-label", "Drawing canvas");
  const ctx = canvas.getContext("2d");

  const toolbar = document.createElement("aside");
  toolbar.className = "fia-draw-toolbar";
  toolbar.setAttribute("aria-label", "Draw controls");
  toolbar.innerHTML = `
    <div class="fia-draw-handle">
      <span class="fia-draw-title">Draw</span>
      <button class="fia-draw-close" type="button" aria-label="Exit Draw">×</button>
    </div>
    <div class="fia-draw-tools" role="group" aria-label="Drawing tool"></div>
    <div class="fia-draw-section-label">Color</div>
    <div class="fia-draw-colors" role="group" aria-label="Drawing color"></div>
    <div class="fia-draw-section-label">Size</div>
    <div class="fia-draw-size-row">
      <input class="fia-draw-size-slider" type="range" min="1" max="40" step="0.5" value="4" aria-label="Stroke size">
      <output class="fia-draw-size-value">4</output>
    </div>
    <div class="fia-draw-actions">
      <button class="fia-draw-action-btn fia-draw-clear" type="button">Clear all</button>
    </div>
  `;

  shadow.append(style, canvas, toolbar);
  document.documentElement.appendChild(root);

  const handle = toolbar.querySelector(".fia-draw-handle");
  const closeButton = toolbar.querySelector(".fia-draw-close");
  const toolsRow = toolbar.querySelector(".fia-draw-tools");
  const colorsRow = toolbar.querySelector(".fia-draw-colors");
  const sizeSlider = toolbar.querySelector(".fia-draw-size-slider");
  const sizeValue = toolbar.querySelector(".fia-draw-size-value");
  const clearButton = toolbar.querySelector(".fia-draw-clear");
  const toolButtons = new Map();
  const colorButtons = new Map();
  let sizeFrame = 0;

  for (const [tool, config] of Object.entries(TOOLS)) {
    const button = document.createElement("button");
    button.className = "fia-draw-tool-btn";
    button.type = "button";
    button.dataset.tool = tool;
    button.setAttribute("aria-label", config.label);
    button.innerHTML = `<span class="fia-draw-tool-icon">${config.icon}</span><span>${config.label}</span>`;
    toolsRow.appendChild(button);
    toolButtons.set(tool, button);
  }
  for (const [label, color] of COLORS) {
    const button = document.createElement("button");
    button.className = "fia-draw-color-btn";
    button.type = "button";
    button.dataset.color = color;
    button.style.background = color;
    button.setAttribute("aria-label", label);
    colorsRow.appendChild(button);
    colorButtons.set(color, button);
  }

  function formatSize(size) {
    return Number.isInteger(size) ? String(size) : size.toFixed(1).replace(/\.0$/, "");
  }

  function renderControls() {
    toolButtons.forEach((button, tool) => button.classList.toggle("active", tool === activeTool));
    colorButtons.forEach((button, color) => button.classList.toggle("active", color === activeColor));
    sizeSlider.value = String(activeSize);
    sizeValue.textContent = formatSize(activeSize);
  }

  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const oldCanvas = document.createElement("canvas");
    const oldWidth = canvas.width;
    const oldHeight = canvas.height;
    const oldCssWidth = canvasCssWidth;
    const oldCssHeight = canvasCssHeight;
    oldCanvas.width = oldWidth;
    oldCanvas.height = oldHeight;
    if (oldWidth && oldHeight) oldCanvas.getContext("2d").drawImage(canvas, 0, 0);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    canvasCssWidth = window.innerWidth;
    canvasCssHeight = window.innerHeight;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (oldWidth && oldHeight && oldCssWidth && oldCssHeight) {
      ctx.drawImage(oldCanvas, 0, 0, oldWidth, oldHeight, 0, 0, oldCssWidth, oldCssHeight);
    }
    clampToolbar();
  }

  function clampToolbar() {
    const width = toolbar.offsetWidth;
    const height = toolbar.offsetHeight;
    toolbarPosition.x = Math.max(8, Math.min(toolbarPosition.x, window.innerWidth - width - 8));
    toolbarPosition.y = Math.max(8, Math.min(toolbarPosition.y, window.innerHeight - height - 8));
    toolbar.style.left = `${toolbarPosition.x}px`;
    toolbar.style.top = `${toolbarPosition.y}px`;
  }

  function prepareStroke() {
    const config = TOOLS[activeTool];
    ctx.globalCompositeOperation = config.composite;
    ctx.globalAlpha = config.alpha;
    ctx.lineWidth = activeSize;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = activeColor;
    ctx.fillStyle = activeColor;
  }

  function pointFromEvent(event) {
    return { x: event.clientX, y: event.clientY };
  }

  function onCanvasPointerDown(event) {
    if (drawing || !event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    drawing = true;
    pointerId = event.pointerId;
    canvas.setPointerCapture(pointerId);
    lastPoint = pointFromEvent(event);
    smoothPoint = { ...lastPoint };
    prepareStroke();
    ctx.beginPath();
    ctx.arc(lastPoint.x, lastPoint.y, ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  function onCanvasPointerMove(event) {
    if (!drawing || event.pointerId !== pointerId) return;
    event.preventDefault();
    const point = pointFromEvent(event);
    const smoothing = TOOLS[activeTool].smoothing;
    smoothPoint = smoothing
      ? { x: smoothPoint.x + (point.x - smoothPoint.x) * (1 - smoothing), y: smoothPoint.y + (point.y - smoothPoint.y) * (1 - smoothing) }
      : point;
    prepareStroke();
    ctx.beginPath();
    ctx.moveTo(lastPoint.x, lastPoint.y);
    ctx.lineTo(smoothPoint.x, smoothPoint.y);
    ctx.stroke();
    lastPoint = smoothPoint;
  }

  function endCanvasStroke(event, commitFinalPoint) {
    if (!drawing || event.pointerId !== pointerId) return;
    event.preventDefault();
    if (commitFinalPoint && TOOLS[activeTool].smoothing) {
      const point = pointFromEvent(event);
      prepareStroke();
      ctx.beginPath();
      ctx.moveTo(lastPoint.x, lastPoint.y);
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
    }
    try { canvas.releasePointerCapture(pointerId); } catch (_) {}
    drawing = false;
    pointerId = null;
  }

  function finishCanvasStroke(event) {
    endCanvasStroke(event, true);
  }

  function cancelCanvasStroke(event) {
    endCanvasStroke(event, false);
  }

  function onCanvasLostPointerCapture(event) {
    if (event.pointerId !== pointerId) return;
    drawing = false;
    pointerId = null;
  }

  function selectTool(tool) {
    activeTool = tool;
    activeSize = TOOLS[tool].size;
    renderControls();
  }

  function onHandlePointerDown(event) {
    if (dragState || !event.isPrimary || event.button !== 0 || event.target.closest("button")) return;
    event.preventDefault();
    event.stopPropagation();
    const bounds = toolbar.getBoundingClientRect();
    dragState = { pointerId: event.pointerId, offsetX: event.clientX - bounds.left, offsetY: event.clientY - bounds.top };
    handle.setPointerCapture(event.pointerId);
  }

  function onHandlePointerMove(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    toolbarPosition.x = event.clientX - dragState.offsetX;
    toolbarPosition.y = event.clientY - dragState.offsetY;
    clampToolbar();
  }

  function endToolbarDrag(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    try { handle.releasePointerCapture(event.pointerId); } catch (_) {}
    dragState = null;
  }

  function finishToolbarDrag(event) {
    endToolbarDrag(event);
  }

  function cancelToolbarDrag(event) {
    endToolbarDrag(event);
  }

  function onHandleLostPointerCapture(event) {
    if (dragState?.pointerId === event.pointerId) dragState = null;
  }

  function preventPageScroll(event) {
    event.preventDefault();
  }

  function onResize() {
    resizeCanvas();
  }

  function onKeyDown(event) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    destroy();
  }

  function destroy() {
    if (sizeFrame) cancelAnimationFrame(sizeFrame);
    canvas.removeEventListener("pointerdown", onCanvasPointerDown);
    canvas.removeEventListener("pointermove", onCanvasPointerMove);
    canvas.removeEventListener("pointerup", finishCanvasStroke);
    canvas.removeEventListener("pointercancel", cancelCanvasStroke);
    canvas.removeEventListener("lostpointercapture", onCanvasLostPointerCapture);
    canvas.removeEventListener("wheel", preventPageScroll);
    handle.removeEventListener("pointerdown", onHandlePointerDown);
    handle.removeEventListener("pointermove", onHandlePointerMove);
    handle.removeEventListener("pointerup", finishToolbarDrag);
    handle.removeEventListener("pointercancel", cancelToolbarDrag);
    handle.removeEventListener("lostpointercapture", onHandleLostPointerCapture);
    window.removeEventListener("resize", onResize);
    document.removeEventListener("keydown", onKeyDown, true);
    root.remove();
    style.remove();
    delete window.__fiaDrawOverlay;
  }

  toolsRow.addEventListener("click", event => {
    const button = event.target.closest("[data-tool]");
    if (button) selectTool(button.dataset.tool);
  });
  colorsRow.addEventListener("click", event => {
    const button = event.target.closest("[data-color]");
    if (!button) return;
    activeColor = button.dataset.color;
    if (activeTool === "eraser") activeTool = "pen";
    renderControls();
  });
  sizeSlider.addEventListener("input", () => {
    activeSize = Number.parseFloat(sizeSlider.value);
    // Keep the value readout in sync at drag speed without needless layout work.
    if (!sizeFrame) sizeFrame = requestAnimationFrame(() => {
      sizeFrame = 0;
      sizeValue.textContent = formatSize(activeSize);
    });
  });
  clearButton.addEventListener("click", () => {
    ctx.save();
    ctx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    ctx.restore();
  });
  closeButton.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    destroy();
  });

  canvas.addEventListener("pointerdown", onCanvasPointerDown);
  canvas.addEventListener("pointermove", onCanvasPointerMove);
  canvas.addEventListener("pointerup", finishCanvasStroke);
  canvas.addEventListener("pointercancel", cancelCanvasStroke);
  canvas.addEventListener("lostpointercapture", onCanvasLostPointerCapture);
  canvas.addEventListener("wheel", preventPageScroll, { passive: false });
  canvas.addEventListener("contextmenu", event => event.preventDefault());
  handle.addEventListener("pointerdown", onHandlePointerDown);
  handle.addEventListener("pointermove", onHandlePointerMove);
  handle.addEventListener("pointerup", finishToolbarDrag);
  handle.addEventListener("pointercancel", cancelToolbarDrag);
  handle.addEventListener("lostpointercapture", onHandleLostPointerCapture);
  window.addEventListener("resize", onResize);
  document.addEventListener("keydown", onKeyDown, true);

  resizeCanvas();
  selectTool("pen");
  renderControls();
  window.__fiaDrawOverlay = { destroy };
})();