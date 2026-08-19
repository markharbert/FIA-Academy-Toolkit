"use strict";

// FIA Toolkit — Responsive Preview
// Renders a script-free snapshot of the current page inside a real iframe
// viewport so CSS media queries respond to the selected dimensions.

(() => {
  function start() {
  const ROOT_ID = "__fia_responsive__";
  const STYLE_ID = "__fia_responsive_style__";
  const MIN_WIDTH = 240;
  const MAX_WIDTH = 5120;
  const MIN_HEIGHT = 240;
  const MAX_HEIGHT = 5120;
  const MIN_ZOOM = 0.05;
  const MAX_ZOOM = 2;
  const ZOOM_STEP = 0.1;

  const PRESET_GROUPS = [
    {
      label: "Phones",
      devices: [
        { id: "iphone-se", label: "iPhone SE", width: 375, height: 667 },
        { id: "iphone-mini", label: "iPhone 12 / 13 mini", width: 375, height: 812 },
        { id: "iphone-standard", label: "iPhone 14 / 15", width: 390, height: 844 },
        { id: "iphone-plus", label: "iPhone 14 / 15 Plus", width: 430, height: 932 },
        { id: "iphone-xr", label: "iPhone XR / 11", width: 414, height: 896 },
        { id: "iphone-16", label: "iPhone 16", width: 393, height: 852 },
        { id: "iphone-16-plus", label: "iPhone 16 Plus", width: 430, height: 932 },
        { id: "iphone-16-pro", label: "iPhone 16 Pro", width: 402, height: 874 },
        { id: "iphone-16-pro-max", label: "iPhone 16 Pro Max", width: 440, height: 956 },
        { id: "iphone-17", label: "iPhone 17", width: 402, height: 874 },
        { id: "iphone-17-pro", label: "iPhone 17 Pro", width: 402, height: 874 },
        { id: "iphone-17-pro-max", label: "iPhone 17 Pro Max", width: 440, height: 956 },
        { id: "iphone-18", label: "iPhone 18 (preview)", width: 402, height: 874 },
        { id: "iphone-18-pro", label: "iPhone 18 Pro (preview)", width: 402, height: 874 },
        { id: "iphone-18-pro-max", label: "iPhone 18 Pro Max (preview)", width: 440, height: 956 },
        { id: "pixel-7", label: "Google Pixel 7", width: 412, height: 915 },
        { id: "pixel-8-pro", label: "Google Pixel 8 Pro", width: 448, height: 998 },
        { id: "galaxy-s8", label: "Samsung Galaxy S8+", width: 360, height: 740 },
        { id: "galaxy-s20", label: "Samsung Galaxy S20 Ultra", width: 412, height: 915 },
        { id: "galaxy-fold", label: "Galaxy Z Fold 5 — cover", width: 344, height: 882 },
        { id: "android-small", label: "Small Android", width: 360, height: 800 },
      ],
    },
    {
      label: "Tablets",
      devices: [
        { id: "surface-duo", label: "Microsoft Surface Duo", width: 540, height: 720 },
        { id: "ipad-mini", label: "iPad mini", width: 768, height: 1024 },
        { id: "ipad-standard", label: "iPad 10.2-inch", width: 810, height: 1080 },
        { id: "ipad-air", label: "iPad Air", width: 820, height: 1180 },
        { id: "ipad-pro-11", label: "iPad Pro 11-inch", width: 834, height: 1194 },
        { id: "ipad-pro-13", label: "iPad Pro 12.9-inch", width: 1024, height: 1366 },
        { id: "galaxy-tab", label: "Samsung Galaxy Tab S8", width: 800, height: 1280 },
        { id: "surface-pro", label: "Microsoft Surface Pro 7", width: 912, height: 1368 },
      ],
    },
    {
      label: "Laptops & desktops",
      devices: [
        { id: "laptop-compact", label: "Compact laptop", width: 1280, height: 800 },
        { id: "chromebook", label: "Chromebook / Laptop HD", width: 1366, height: 768 },
        { id: "macbook-air", label: "MacBook Air", width: 1440, height: 900 },
        { id: "desktop-standard", label: "Desktop — common scaling", width: 1536, height: 864 },
        { id: "desktop-hd", label: "Desktop — Full HD", width: 1920, height: 1080 },
        { id: "desktop-qhd", label: "Desktop — QHD", width: 2560, height: 1440 },
      ],
    },
  ];
  const PRESETS = PRESET_GROUPS.flatMap(group => group.devices);

  if (window.__fiaResponsive?.destroy) {
    window.__fiaResponsive.destroy();
  } else {
    document.getElementById(ROOT_ID)?.remove();
    document.getElementById(STYLE_ID)?.remove();
  }

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const previousFocus = document.activeElement;

  function buildPageSnapshot() {
    const clone = document.documentElement.cloneNode(true);
    const originalControls = document.querySelectorAll("input, textarea, select, details");
    const clonedControls = clone.querySelectorAll("input, textarea, select, details");

    originalControls.forEach((original, index) => {
      const copy = clonedControls[index];
      if (!copy || copy.tagName !== original.tagName) return;
      if (original instanceof HTMLInputElement) {
        copy.setAttribute("value", original.value);
        if (original.checked) copy.setAttribute("checked", "");
        else copy.removeAttribute("checked");
      } else if (original instanceof HTMLTextAreaElement) {
        copy.textContent = original.value;
      } else if (original instanceof HTMLSelectElement) {
        Array.from(copy.options).forEach((option, optionIndex) => {
          if (optionIndex === original.selectedIndex) option.setAttribute("selected", "");
          else option.removeAttribute("selected");
        });
      } else if (original instanceof HTMLDetailsElement) {
        if (original.open) copy.setAttribute("open", "");
        else copy.removeAttribute("open");
      }
    });

    // The preview is intentionally script-free. Nested documents can execute their
    // own scripts even when top-level <script> elements have been removed.
    clone.querySelectorAll("script, iframe, frame, object, embed").forEach(element => element.remove());
    clone.querySelectorAll(`style#${STYLE_ID}, #${ROOT_ID}, [id^="__fia_"]`)
      .forEach(element => element.remove());
    clone.querySelectorAll('meta[http-equiv="Content-Security-Policy" i], meta[http-equiv="refresh" i]')
      .forEach(element => element.remove());
    clone.querySelectorAll("*").forEach(element => {
      Array.from(element.attributes).forEach(attribute => {
        const name = attribute.name.toLowerCase();
        const value = attribute.value.trim().toLowerCase();
        if (name.startsWith("on")
          || (["href", "src", "action", "formaction"].includes(name) && value.startsWith("javascript:"))) {
          element.removeAttribute(attribute.name);
        }
      });
    });

    return `<!doctype html>\n${clone.outerHTML}`;
  }

  const snapshot = buildPageSnapshot();
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    #${ROOT_ID} {
      all: initial !important;
      position: fixed !important; inset: 0 !important; z-index: 2147483647 !important;
      display: flex !important; flex-direction: column !important;
      min-width: 0 !important; min-height: 0 !important;
      color: #fff !important; background: #292c33 !important;
      font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
      line-height: 1.2 !important; direction: ltr !important; text-align: left !important;
    }
    #${ROOT_ID}, #${ROOT_ID} * { box-sizing: border-box !important; }
    #${ROOT_ID} .fia-responsive-toolbar {
      all: unset !important; box-sizing: border-box !important;
      flex: 0 0 auto !important; display: flex !important; align-items: center !important;
      width: 100% !important; min-width: 0 !important; min-height: 68px !important;
      gap: 10px !important; min-height: 68px !important; padding: 10px 14px !important;
      overflow-x: auto !important; overflow-y: hidden !important;
      color: #fff !important; background: #06092a !important;
      border-bottom: 1px solid rgba(255,255,255,.12) !important;
      box-shadow: 0 5px 18px rgba(0,0,0,.36) !important;
      scrollbar-width: thin !important; scrollbar-color: rgba(255,255,255,.25) transparent !important;
    }
    #${ROOT_ID} .fia-responsive-toolbar > * {
      all: unset !important; box-sizing: border-box !important;
      flex: 0 0 auto !important; min-width: 0 !important; margin: 0 !important;
    }
    #${ROOT_ID} .fia-responsive-brand {
      flex: 0 0 auto !important; display: flex !important; align-items: center !important;
      gap: 9px !important; padding-right: 11px !important;
      border-right: 1px solid rgba(255,255,255,.16) !important;
    }
    #${ROOT_ID} .fia-responsive-logo {
      display: block !important; width: 42px !important; height: 42px !important;
      flex: 0 0 42px !important; border-radius: 50% !important; object-fit: cover !important;
      background: #06092a !important; box-shadow: 0 0 0 2px rgba(232,181,0,.42) !important;
    }
    #${ROOT_ID} .fia-responsive-brand-copy {
      display: flex !important; flex-direction: column !important; gap: 2px !important;
      white-space: nowrap !important;
    }
    #${ROOT_ID} .fia-responsive-brand-name {
      color: #fff !important; font-size: 12px !important; font-weight: 750 !important;
      letter-spacing: .01em !important;
    }
    #${ROOT_ID} .fia-responsive-brand-tool {
      color: rgba(255,255,255,.53) !important; font-size: 9px !important;
      font-weight: 650 !important; letter-spacing: .08em !important; text-transform: uppercase !important;
    }
    #${ROOT_ID} .fia-responsive-select,
    #${ROOT_ID} .fia-responsive-input {
      all: unset !important; box-sizing: border-box !important; display: block !important; height: 40px !important;
      color: #fff !important; background: rgba(255,255,255,.08) !important;
      border: 1px solid rgba(255,255,255,.2) !important; border-radius: 7px !important;
      font: 600 13px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
      box-shadow: inset 0 1px 0 rgba(255,255,255,.04) !important;
    }
    #${ROOT_ID} .fia-responsive-select-wrap {
      position: relative !important; flex: 0 0 auto !important; width: 276px !important; height: 40px !important;
    }
    #${ROOT_ID} .fia-responsive-select {
      position: absolute !important; inset: 0 !important; width: 100% !important; min-height: 40px !important;
      padding: 0 34px 0 12px !important; color: transparent !important;
      cursor: pointer !important; appearance: none !important; color-scheme: dark !important;
    }
    #${ROOT_ID} .fia-responsive-select-value {
      position: absolute !important; inset: 0 34px 0 12px !important; display: flex !important;
      align-items: center !important; overflow: hidden !important; pointer-events: none !important;
      color: #fff !important; font: 600 13px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
      white-space: nowrap !important; text-overflow: ellipsis !important;
    }
    #${ROOT_ID} .fia-responsive-select-chevron {
      position: absolute !important; right: 14px !important; top: 50% !important;
      width: 7px !important; height: 7px !important; pointer-events: none !important;
      border-right: 2px solid rgba(255,255,255,.72) !important;
      border-bottom: 2px solid rgba(255,255,255,.72) !important;
      transform: translateY(-70%) rotate(45deg) !important;
    }
    #${ROOT_ID} .fia-responsive-select option,
    #${ROOT_ID} .fia-responsive-select optgroup {
      color: #fff !important; background: #171a35 !important;
    }
    #${ROOT_ID} .fia-responsive-dimension {
      all: unset !important; box-sizing: border-box !important;
      position: relative !important; flex: 0 0 auto !important; display: flex !important;
      align-items: center !important; width: 92px !important; height: 40px !important;
      overflow: hidden !important; background: rgba(255,255,255,.08) !important;
      border: 1px solid rgba(255,255,255,.2) !important; border-radius: 7px !important;
      box-shadow: inset 0 1px 0 rgba(255,255,255,.04) !important;
    }
    #${ROOT_ID} .fia-responsive-dimension-prefix {
      all: unset !important; box-sizing: border-box !important;
      position: static !important; z-index: auto !important; display: flex !important;
      align-items: center !important; justify-content: center !important;
      flex: 0 0 24px !important; width: 24px !important; height: 38px !important;
      transform: none !important; color: rgba(255,255,255,.47) !important;
      font: 750 10px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
      pointer-events: none !important; text-transform: uppercase !important;
    }
    #${ROOT_ID} .fia-responsive-input {
      flex: 1 1 auto !important; width: auto !important; min-width: 0 !important; height: 38px !important;
      padding: 0 8px 0 0 !important; color: #fff !important; background: transparent !important;
      border: 0 !important; border-radius: 0 !important; box-shadow: none !important;
      appearance: none !important; -webkit-appearance: none !important; line-height: 38px !important;
      font-variant-numeric: tabular-nums !important; cursor: text !important;
    }
    #${ROOT_ID} .fia-responsive-input::-webkit-outer-spin-button,
    #${ROOT_ID} .fia-responsive-input::-webkit-inner-spin-button {
      appearance: none !important; -webkit-appearance: none !important; margin: 0 !important;
    }
    #${ROOT_ID} .fia-responsive-select:focus {
      border-color: #e8b500 !important; box-shadow: 0 0 0 2px rgba(232,181,0,.22) !important;
    }
    #${ROOT_ID} .fia-responsive-dimension:focus-within {
      border-color: #e8b500 !important; box-shadow: 0 0 0 2px rgba(232,181,0,.22) !important;
    }
    #${ROOT_ID} .fia-responsive-zoom {
      flex: 0 0 auto !important; display: flex !important; align-items: center !important;
      height: 40px !important; overflow: hidden !important;
      border: 1px solid rgba(255,255,255,.18) !important; border-radius: 7px !important;
      background: rgba(255,255,255,.06) !important;
    }
    #${ROOT_ID} .fia-responsive-button {
      all: unset !important; display: inline-flex !important; align-items: center !important;
      justify-content: center !important; height: 40px !important; min-width: 40px !important;
      padding: 0 11px !important; color: #fff !important;
      font: 750 13px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
      cursor: pointer !important; white-space: nowrap !important;
    }
    #${ROOT_ID} .fia-responsive-button:hover { background: rgba(255,255,255,.12) !important; }
    #${ROOT_ID} .fia-responsive-button:focus-visible {
      outline: 2px solid #e8b500 !important; outline-offset: -3px !important;
    }
    #${ROOT_ID} .fia-responsive-zoom .fia-responsive-button {
      border-radius: 0 !important; padding: 0 !important;
    }
    #${ROOT_ID} .fia-responsive-zoom-value {
      display: inline-flex !important; align-items: center !important; justify-content: center !important;
      width: 58px !important; height: 40px !important; color: #fff !important;
      border-right: 1px solid rgba(255,255,255,.14) !important;
      border-left: 1px solid rgba(255,255,255,.14) !important;
      font: 650 12px/1 ui-monospace, SFMono-Regular, Menlo, monospace !important;
      font-variant-numeric: tabular-nums !important;
    }
    #${ROOT_ID} .fia-responsive-fit {
      flex: 0 0 auto !important; border: 1px solid rgba(255,255,255,.18) !important;
      border-radius: 7px !important; background: rgba(255,255,255,.06) !important;
      color: rgba(255,255,255,.78) !important; font-size: 11px !important;
    }
    #${ROOT_ID} .fia-responsive-fit.active {
      border-color: rgba(232,181,0,.66) !important; color: #ffe86d !important;
      background: rgba(232,181,0,.12) !important;
    }
    #${ROOT_ID} .fia-responsive-exit {
      flex: 0 0 auto !important; margin-left: auto !important; min-width: 68px !important;
      border-radius: 7px !important; background: #da0010 !important;
      box-shadow: 0 4px 12px rgba(218,0,16,.28) !important;
    }
    #${ROOT_ID} .fia-responsive-exit:hover { background: #b9000d !important; }
    #${ROOT_ID} .fia-responsive-workspace {
      position: relative !important; flex: 1 1 auto !important; min-height: 0 !important;
      overflow: auto !important; overscroll-behavior: contain !important;
      background:
        radial-gradient(circle at 50% 10%, rgba(255,255,255,.055), transparent 38%),
        #292c33 !important;
    }
    #${ROOT_ID} .fia-responsive-canvas {
      display: flex !important; align-items: flex-start !important; justify-content: center !important;
      width: max-content !important; min-width: 100% !important; min-height: 100% !important;
      padding: 38px !important;
    }
    #${ROOT_ID} .fia-responsive-shell {
      position: relative !important; flex: 0 0 auto !important; overflow: visible !important;
      border: 1px solid #626773 !important; border-radius: 4px !important;
      background: #fff !important; box-shadow: 0 14px 38px rgba(0,0,0,.44) !important;
      transition: width .16s ease, height .16s ease !important;
    }
    #${ROOT_ID} .fia-responsive-frame-mount {
      position: absolute !important; inset: 0 auto auto 0 !important; display: block !important;
      margin: 0 !important; padding: 0 !important; border: 0 !important; background: #fff !important;
    }
    #${ROOT_ID} .fia-responsive-frame {
      position: absolute !important; inset: 0 auto auto 0 !important; display: block !important;
      margin: 0 !important; padding: 0 !important; border: 0 !important;
      background: #fff !important; transform-origin: 0 0 !important;
    }
    #${ROOT_ID} .fia-responsive-size {
      position: absolute !important; top: -25px !important; left: 50% !important;
      transform: translateX(-50%) !important; z-index: 2 !important;
      padding: 4px 8px !important; border-radius: 5px !important;
      color: rgba(255,255,255,.76) !important; background: rgba(13,15,22,.86) !important;
      font: 650 10px/1 ui-monospace, SFMono-Regular, Menlo, monospace !important;
      white-space: nowrap !important; pointer-events: none !important;
    }
    @media (max-width: 980px) {
      #${ROOT_ID} .fia-responsive-brand-copy { display: none !important; }
      #${ROOT_ID} .fia-responsive-select-wrap { width: 230px !important; }
    }
  `;
  const styleRoot = document.head || document.documentElement;
  if (!styleRoot) return;
  styleRoot.appendChild(style);

  const host = document.createElement("div");
  host.id = ROOT_ID;
  host.setAttribute("role", "dialog");
  host.setAttribute("aria-modal", "true");
  host.setAttribute("aria-label", "FIA responsive website preview");
  const logoUrl = chrome.runtime.getURL("icons/icon128.png");
  host.innerHTML = `
    <header class="fia-responsive-toolbar">
      <div class="fia-responsive-brand" title="Fearless Influencer Academy">
        <img class="fia-responsive-logo" src="${logoUrl}" alt="Fearless Influencer Academy lion">
        <div class="fia-responsive-brand-copy">
          <span class="fia-responsive-brand-name">Fearless Influencer Academy</span>
          <span class="fia-responsive-brand-tool">Responsive Preview</span>
        </div>
      </div>
      <div class="fia-responsive-select-wrap">
        <select id="__fia_responsive_preset__" class="fia-responsive-select" aria-label="Device preset"></select>
        <span class="fia-responsive-select-value" aria-hidden="true"></span>
        <span class="fia-responsive-select-chevron" aria-hidden="true"></span>
      </div>
      <div class="fia-responsive-dimension" role="group" aria-label="Viewport width control">
        <span class="fia-responsive-dimension-prefix">W</span>
        <input id="__fia_responsive_width__" class="fia-responsive-input" type="number"
          min="${MIN_WIDTH}" max="${MAX_WIDTH}" step="1" inputmode="numeric" aria-label="Viewport width">
      </div>
      <div class="fia-responsive-dimension" role="group" aria-label="Viewport height control">
        <span class="fia-responsive-dimension-prefix">H</span>
        <input id="__fia_responsive_height__" class="fia-responsive-input" type="number"
          min="${MIN_HEIGHT}" max="${MAX_HEIGHT}" step="1" inputmode="numeric" aria-label="Viewport height">
      </div>
      <div class="fia-responsive-zoom" aria-label="Preview zoom">
        <button id="__fia_responsive_zoom_out__" class="fia-responsive-button" type="button" aria-label="Zoom out">−</button>
        <output id="__fia_responsive_zoom_value__" class="fia-responsive-zoom-value">100%</output>
        <button id="__fia_responsive_zoom_in__" class="fia-responsive-button" type="button" aria-label="Zoom in">+</button>
      </div>
      <button id="__fia_responsive_fit__" class="fia-responsive-button fia-responsive-fit" type="button">Fit</button>
      <button id="__fia_responsive_exit__" class="fia-responsive-button fia-responsive-exit" type="button">Exit</button>
    </header>
    <main class="fia-responsive-workspace">
      <div class="fia-responsive-canvas">
        <div class="fia-responsive-shell">
          <span class="fia-responsive-size"></span>
          <div class="fia-responsive-frame-mount"></div>
        </div>
      </div>
    </main>
  `;
  const hostRoot = document.body || document.documentElement;
  if (!hostRoot) {
    style.remove();
    return;
  }
  hostRoot.appendChild(host);

  const presetSelect = host.querySelector("#__fia_responsive_preset__");
  const presetValue = host.querySelector(".fia-responsive-select-value");
  const widthInput = host.querySelector("#__fia_responsive_width__");
  const heightInput = host.querySelector("#__fia_responsive_height__");
  const zoomValue = host.querySelector("#__fia_responsive_zoom_value__");
  const fitButton = host.querySelector("#__fia_responsive_fit__");
  const workspace = host.querySelector(".fia-responsive-workspace");
  const shell = host.querySelector(".fia-responsive-shell");
  const frameMount = host.querySelector(".fia-responsive-frame-mount");
  const frame = document.createElement("iframe");
  frame.className = "fia-responsive-frame";
  frame.title = "Responsive preview of the current page";
  // The snapshot is sanitized before it reaches this iframe and does not need
  // JavaScript or same-origin privileges. Keep the sandbox completely
  // capability-free so Chrome cannot flag an escape-prone permission pair.
  frame.setAttribute("sandbox", "");
  frame.tabIndex = -1;
  frame.style.cssText = [
    "position:absolute !important",
    "inset:0 auto auto 0 !important",
    "display:block !important",
    "margin:0 !important",
    "padding:0 !important",
    "border:0 !important",
    "background:#fff !important",
    "transform-origin:0 0 !important",
    // This is a static, sanitized visual snapshot—not an interactive browser.
    // Keeping pointer focus in the host makes Escape reliably close the tool.
    "pointer-events:none !important",
  ].join(";");
  frameMount.attachShadow({ mode: "open" }).appendChild(frame);
  const sizeLabel = host.querySelector(".fia-responsive-size");

  for (const group of PRESET_GROUPS) {
    const optgroup = document.createElement("optgroup");
    optgroup.label = group.label;
    for (const device of group.devices) {
      const option = document.createElement("option");
      option.value = device.id;
      option.dataset.width = String(device.width);
      option.dataset.height = String(device.height);
      option.textContent = `${device.label} (${device.width} × ${device.height})`;
      optgroup.appendChild(option);
    }
    presetSelect.appendChild(optgroup);
  }
  const customOption = document.createElement("option");
  customOption.value = "custom";
  customOption.textContent = "Custom size";
  presetSelect.appendChild(customOption);

  let width = 390;
  let height = 844;
  let zoom = 1;
  let fitMode = false;
  let presetId = "iphone-standard";
  let destroyed = false;

  function matchingPreset() {
    return PRESETS.find(device =>
      device.id === presetId && device.width === width && device.height === height,
    ) || PRESETS.find(device => device.width === width && device.height === height);
  }

  function renderPreview() {
    frame.style.width = `${width}px`;
    frame.style.height = `${height}px`;
    frame.style.transform = `scale(${zoom})`;
    shell.style.width = `${Math.ceil(width * zoom) + 2}px`;
    shell.style.height = `${Math.ceil(height * zoom) + 2}px`;
    sizeLabel.textContent = `${width} × ${height} · ${Math.round(zoom * 100)}%`;
    zoomValue.textContent = `${Math.round(zoom * 100)}%`;
    widthInput.value = String(width);
    heightInput.value = String(height);
    const match = matchingPreset();
    presetSelect.value = match?.id || "custom";
    presetValue.textContent = presetSelect.selectedOptions[0]?.textContent || "Custom size";
    fitButton.classList.toggle("active", fitMode);
    fitButton.setAttribute("aria-pressed", String(fitMode));
    host.dataset.width = String(width);
    host.dataset.height = String(height);
    host.dataset.zoom = String(Math.round(zoom * 100));
    host.dataset.preset = match?.id || "custom";
    host.dataset.fit = String(fitMode);
  }

  function setDimensions(nextWidth, nextHeight, nextPresetId = null) {
    width = clamp(Math.round(nextWidth), MIN_WIDTH, MAX_WIDTH);
    height = clamp(Math.round(nextHeight), MIN_HEIGHT, MAX_HEIGHT);
    presetId = nextPresetId && PRESETS.some(device => device.id === nextPresetId)
      ? nextPresetId
      : null;
    if (fitMode) applyFit();
    else renderPreview();
  }

  function setZoom(nextZoom, useFit = false) {
    fitMode = useFit;
    zoom = clamp(Math.round(nextZoom * 1000) / 1000, MIN_ZOOM, MAX_ZOOM);
    renderPreview();
  }

  function applyFit() {
    const horizontalRoom = Math.max(120, workspace.clientWidth - 76);
    const verticalRoom = Math.max(120, workspace.clientHeight - 76);
    const fitted = Math.floor(Math.min(1, horizontalRoom / width, verticalRoom / height) * 1000) / 1000;
    setZoom(fitted, true);
  }

  function commitInputs() {
    const nextWidth = Number.parseInt(widthInput.value, 10);
    const nextHeight = Number.parseInt(heightInput.value, 10);
    setDimensions(
      Number.isFinite(nextWidth) ? nextWidth : width,
      Number.isFinite(nextHeight) ? nextHeight : height,
    );
  }

  function onDimensionInput() {
    const nextWidth = Number.parseInt(widthInput.value, 10);
    const nextHeight = Number.parseInt(heightInput.value, 10);
    if (
      Number.isFinite(nextWidth) && nextWidth >= MIN_WIDTH && nextWidth <= MAX_WIDTH
      && Number.isFinite(nextHeight) && nextHeight >= MIN_HEIGHT && nextHeight <= MAX_HEIGHT
    ) {
      setDimensions(nextWidth, nextHeight);
    }
  }

  function onKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      destroy();
      return;
    }
    if (event.key !== "Tab") return;

    const controls = toolbarControls();
    if (!controls.length) return;
    const first = controls[0];
    const last = controls[controls.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !host.contains(active))) {
      event.preventDefault();
      event.stopPropagation();
      last.focus({ preventScroll: true });
    } else if (!event.shiftKey && (active === last || !host.contains(active))) {
      event.preventDefault();
      event.stopPropagation();
      first.focus({ preventScroll: true });
    }
  }

  function onFrameKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      destroy();
      return;
    }
    if (event.key !== "Tab") return;
    event.preventDefault();
    event.stopPropagation();
    const controls = toolbarControls();
    const target = event.shiftKey ? controls.at(-1) : controls[0];
    target?.focus({ preventScroll: true });
  }

  function toolbarControls() {
    return Array.from(host.querySelectorAll(
      ".fia-responsive-toolbar select, .fia-responsive-toolbar input, .fia-responsive-toolbar button",
    )).filter(element => !element.disabled);
  }

  function onWindowResize() {
    if (fitMode) applyFit();
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    document.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("resize", onWindowResize);
    host.remove();
    style.remove();
    delete window.__fiaResponsive;
    if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
      previousFocus.focus({ preventScroll: true });
    }
  }

  presetSelect.addEventListener("change", () => {
    const selected = PRESETS.find(device => device.id === presetSelect.value);
    if (selected) setDimensions(selected.width, selected.height, selected.id);
  });
  widthInput.addEventListener("input", onDimensionInput);
  heightInput.addEventListener("input", onDimensionInput);
  widthInput.addEventListener("change", commitInputs);
  heightInput.addEventListener("change", commitInputs);
  widthInput.addEventListener("blur", commitInputs);
  heightInput.addEventListener("blur", commitInputs);
  for (const input of [widthInput, heightInput]) {
    input.addEventListener("keydown", event => {
      if (event.key === "Enter") {
        commitInputs();
        input.select();
      }
    });
  }
  host.querySelector("#__fia_responsive_zoom_out__").addEventListener("click", () => {
    setZoom(zoom - ZOOM_STEP);
  });
  host.querySelector("#__fia_responsive_zoom_in__").addEventListener("click", () => {
    setZoom(zoom + ZOOM_STEP);
  });
  fitButton.addEventListener("click", applyFit);
  host.querySelector("#__fia_responsive_exit__").addEventListener("click", destroy);
  document.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("resize", onWindowResize);
  frame.addEventListener("load", () => {
    if (destroyed) return;
    try {
      frame.contentWindow?.addEventListener("keydown", onFrameKeyDown, true);
    } catch (_) {}
  });

  window.__fiaResponsive = {
    destroy,
    getState: () => ({ width, height, zoom, fitMode, preset: matchingPreset()?.id || "custom" }),
  };

  frame.srcdoc = snapshot;
  renderPreview();
  presetSelect.focus({ preventScroll: true });
  }

  if (document.documentElement) {
    start();
  } else if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    queueMicrotask(start);
  }
})();