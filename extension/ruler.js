"use strict";

// FIA Toolkit — Ruler
// Temporary viewport measurement overlay. It does not save, transmit, or
// modify page content.

(() => {
  const ROOT_ID = "__fia_ruler__";
  const STYLE_ID = "__fia_ruler_style__";

  // Re-running the tool replaces any existing ruler and its event listeners.
  if (window.__fiaRuler?.destroy) {
    window.__fiaRuler.destroy();
  } else {
    document.getElementById(ROOT_ID)?.remove();
    document.getElementById(STYLE_ID)?.remove();
  }

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const pointFromEvent = event => ({
    x: clamp(Math.round(event.clientX), 0, window.innerWidth),
    y: clamp(Math.round(event.clientY), 0, window.innerHeight),
  });

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    #${ROOT_ID} {
      position: fixed; inset: 0; z-index: 2147483647; overflow: hidden;
      cursor: crosshair; pointer-events: auto; touch-action: none;
      user-select: none; -webkit-user-select: none;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    #${ROOT_ID}, #${ROOT_ID} * { box-sizing: border-box; }
    #${ROOT_ID} .fia-ruler-guide {
      position: fixed; z-index: 1; pointer-events: none;
      background: rgba(255,255,255,.82);
      box-shadow: 0 0 0 1px rgba(6,9,42,.44);
    }
    #${ROOT_ID} .fia-ruler-guide-x {
      left: 0; width: 100vw; height: 1px; top: 50%;
    }
    #${ROOT_ID} .fia-ruler-guide-y {
      top: 0; height: 100vh; width: 1px; left: 50%;
    }
    #${ROOT_ID} .fia-ruler-selection {
      position: fixed; z-index: 2; display: none; pointer-events: none;
      border: 2px solid #e8b500;
      background: rgba(255,244,128,.38);
      box-shadow: 0 0 0 1px rgba(6,9,42,.35), inset 0 0 0 1px rgba(255,255,255,.34);
    }
    #${ROOT_ID} .fia-ruler-selection.active { display: block; }
    #${ROOT_ID} .fia-ruler-coordinate {
      position: fixed; z-index: 3; min-width: 76px; padding: 4px 6px;
      border: 1px solid rgba(6,9,42,.38); border-radius: 4px;
      color: #06092a; background: #fff2b7; pointer-events: none;
      box-shadow: 0 2px 8px rgba(0,0,0,.24);
      font: 700 10px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace;
      white-space: nowrap;
    }
    #${ROOT_ID} .fia-ruler-help {
      position: fixed; z-index: 4; left: 50%; top: 14px;
      transform: translateX(-50%); padding: 7px 12px;
      border: 1px solid rgba(255,255,255,.16); border-radius: 999px;
      color: #fff; background: rgba(18,20,30,.9); pointer-events: none;
      box-shadow: 0 4px 16px rgba(0,0,0,.25);
      font: 600 11px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      white-space: nowrap;
    }
    #${ROOT_ID} .fia-ruler-readout {
      position: fixed; z-index: 5; top: 12px; right: 12px; width: 164px;
      overflow: hidden; border: 1px solid rgba(255,255,255,.2); border-radius: 8px;
      color: #f7f8fb; background: rgba(25,28,40,.96);
      box-shadow: 0 10px 28px rgba(0,0,0,.34);
      backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
      cursor: default;
    }
    #${ROOT_ID} .fia-ruler-readout-head {
      display: flex; align-items: center; justify-content: space-between;
      min-height: 29px; padding-left: 10px; color: #fff;
      background: #06092a; font-size: 11px; font-weight: 750;
      letter-spacing: .04em;
    }
    #${ROOT_ID} .fia-ruler-close {
      width: 30px; height: 29px; padding: 0; border: 0;
      color: #fff; background: #da0010; cursor: pointer;
      font: 700 17px/1 -apple-system, sans-serif;
    }
    #${ROOT_ID} .fia-ruler-close:hover { background: #b8000d; }
    #${ROOT_ID} .fia-ruler-metrics {
      display: grid; grid-template-columns: auto 1fr; gap: 5px 12px;
      margin: 0; padding: 9px 10px 10px;
      font: 11px/1.25 ui-monospace, SFMono-Regular, Menlo, monospace;
    }
    #${ROOT_ID} .fia-ruler-metrics dt { color: #aeb8c9; }
    #${ROOT_ID} .fia-ruler-metrics dd {
      margin: 0; color: #fff2a8; text-align: right; font-weight: 700;
      font-variant-numeric: tabular-nums;
    }
  `;
  document.documentElement.appendChild(style);

  const root = document.createElement("div");
  root.id = ROOT_ID;
  root.setAttribute("role", "application");
  root.setAttribute("aria-label", "Viewport ruler");
  root.innerHTML = `
    <div class="fia-ruler-guide fia-ruler-guide-x"></div>
    <div class="fia-ruler-guide fia-ruler-guide-y"></div>
    <div class="fia-ruler-selection"></div>
    <div class="fia-ruler-coordinate">X: 0 · Y: 0</div>
    <div class="fia-ruler-help">Drag to measure · Drag again to replace · Esc to close</div>
    <aside class="fia-ruler-readout" aria-label="Ruler measurements">
      <div class="fia-ruler-readout-head">
        <span>RULER</span>
        <button class="fia-ruler-close" type="button" aria-label="Close Ruler">×</button>
      </div>
      <dl class="fia-ruler-metrics">
        <dt>Width</dt><dd data-ruler-field="width">0px</dd>
        <dt>Height</dt><dd data-ruler-field="height">0px</dd>
        <dt>X</dt><dd data-ruler-field="x">0px</dd>
        <dt>Y</dt><dd data-ruler-field="y">0px</dd>
      </dl>
    </aside>
  `;
  document.documentElement.appendChild(root);

  const guideX = root.querySelector(".fia-ruler-guide-x");
  const guideY = root.querySelector(".fia-ruler-guide-y");
  const selection = root.querySelector(".fia-ruler-selection");
  const coordinate = root.querySelector(".fia-ruler-coordinate");
  const readout = root.querySelector(".fia-ruler-readout");
  const fields = {
    width: root.querySelector('[data-ruler-field="width"]'),
    height: root.querySelector('[data-ruler-field="height"]'),
    x: root.querySelector('[data-ruler-field="x"]'),
    y: root.querySelector('[data-ruler-field="y"]'),
  };
  let startPoint = null;
  let measurement = null;
  let dragging = false;
  let activePointerId = null;

  function renderMetrics(value) {
    fields.width.textContent = `${value.width}px`;
    fields.height.textContent = `${value.height}px`;
    fields.x.textContent = `${value.x}px`;
    fields.y.textContent = `${value.y}px`;
    root.dataset.width = String(value.width);
    root.dataset.height = String(value.height);
    root.dataset.x = String(value.x);
    root.dataset.y = String(value.y);
  }

  function moveGuides(point) {
    guideX.style.top = `${point.y}px`;
    guideY.style.left = `${point.x}px`;
    root.dataset.guideX = String(point.x);
    root.dataset.guideY = String(point.y);
    coordinate.textContent = `X: ${point.x} · Y: ${point.y}`;
    coordinate.style.left = `${point.x + 92 > window.innerWidth ? point.x - 84 : point.x + 8}px`;
    coordinate.style.top = `${point.y + 28 > window.innerHeight ? point.y - 24 : point.y + 7}px`;
    if (!measurement && !dragging) {
      renderMetrics({ width: 0, height: 0, x: point.x, y: point.y });
    }
  }

  function updateMeasurement(point) {
    const x = Math.min(startPoint.x, point.x);
    const y = Math.min(startPoint.y, point.y);
    const width = Math.abs(point.x - startPoint.x);
    const height = Math.abs(point.y - startPoint.y);
    measurement = { x, y, width, height };
    selection.classList.add("active");
    selection.style.left = `${x}px`;
    selection.style.top = `${y}px`;
    selection.style.width = `${width}px`;
    selection.style.height = `${height}px`;
    renderMetrics(measurement);
  }

  function onPointerMove(event) {
    const point = pointFromEvent(event);
    moveGuides(point);
    if (dragging) {
      event.preventDefault();
      event.stopPropagation();
      updateMeasurement(point);
    }
  }

  function onPointerDown(event) {
    if (event.button !== 0 || event.target.closest(".fia-ruler-readout")) return;
    event.preventDefault();
    event.stopPropagation();
    const point = pointFromEvent(event);
    startPoint = point;
    measurement = null;
    dragging = true;
    activePointerId = event.pointerId;
    root.setPointerCapture?.(event.pointerId);
    moveGuides(point);
    updateMeasurement(point);
  }

  function finishDrag(event) {
    if (!dragging || (activePointerId !== null && event.pointerId !== activePointerId)) return;
    event.preventDefault();
    event.stopPropagation();
    updateMeasurement(pointFromEvent(event));
    dragging = false;
    root.releasePointerCapture?.(event.pointerId);
    activePointerId = null;
  }

  function blockEvent(event) {
    event.preventDefault();
    event.stopPropagation();
  }

  function onKeyDown(event) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    destroy();
  }

  function destroy() {
    document.removeEventListener("keydown", onKeyDown, true);
    root.removeEventListener("pointermove", onPointerMove, true);
    root.removeEventListener("pointerdown", onPointerDown, true);
    root.removeEventListener("pointerup", finishDrag, true);
    root.removeEventListener("pointercancel", finishDrag, true);
    root.removeEventListener("wheel", blockEvent, true);
    root.removeEventListener("contextmenu", blockEvent, true);
    root.remove();
    style.remove();
    delete window.__fiaRuler;
  }

  root.addEventListener("pointermove", onPointerMove, true);
  root.addEventListener("pointerdown", onPointerDown, true);
  root.addEventListener("pointerup", finishDrag, true);
  root.addEventListener("pointercancel", finishDrag, true);
  root.addEventListener("wheel", blockEvent, { capture: true, passive: false });
  root.addEventListener("contextmenu", blockEvent, true);
  document.addEventListener("keydown", onKeyDown, true);
  readout.addEventListener("pointerdown", event => event.stopPropagation());
  root.querySelector(".fia-ruler-close").addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    destroy();
  });

  window.__fiaRuler = {
    destroy,
    getMeasurement: () => measurement ? { ...measurement } : null,
  };
  moveGuides({ x: Math.round(window.innerWidth / 2), y: Math.round(window.innerHeight / 2) });
})();