"use strict";

// FIA Toolkit — Site Inspector
// Injected into the active page from the Swipe File tools panel. The inspector
// is intentionally page-local: it reads computed styles and accessibility
// metadata in the browser and does not save or send page content anywhere.

(() => {
  const ROOT_ID = "__fia_site_inspector__";
  const STYLE_ID = "__fia_site_inspector_style__";
  const HIGHLIGHT_ID = "__fia_site_inspector_highlight__";
  const PANEL_ID = "__fia_site_inspector_panel__";
  const LABEL_ID = "__fia_site_inspector_label__";

  if (document.getElementById(ROOT_ID)) {
    // Delegate teardown to the previous instance's destroy() so the correct
    // closure-bound listener references are removed.
    if (window.__fiaSiteInspector?.destroy) {
      window.__fiaSiteInspector.destroy();
    } else {
      document.getElementById(ROOT_ID)?.remove();
      document.getElementById(STYLE_ID)?.remove();
    }
    return;
  }

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const round = value => Math.round(value * 10) / 10;
  const text = value => value == null || value === "" ? "—" : String(value);

  function shortText(value, max = 72) {
    const normalized = String(value || "").replace(/\s+/g, " ").trim();
    return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized;
  }

  function implicitRole(element) {
    const tag = element.tagName.toLowerCase();
    if (/^h[1-6]$/.test(tag)) return tag;
    if (tag === "a" && element.hasAttribute("href")) return "link";
    if (tag === "button") return "button";
    if (tag === "img") return "img";
    if (tag === "textarea" || tag === "select") return "textbox";
    if (tag === "input") {
      return ({
        button: "button", checkbox: "checkbox", radio: "radio",
        range: "slider", search: "searchbox",
      })[element.type] || "textbox";
    }
    return "";
  }

  function isKeyboardFocusable(element) {
    if (element.matches("a[href],button,input,select,textarea,summary,[contenteditable='true']")) {
      return !element.disabled && element.tabIndex >= 0;
    }
    return element.tabIndex >= 0;
  }

  function formatColor(value) {
    const normalized = String(value || "").trim();
    if (!normalized || normalized === "rgba(0, 0, 0, 0)") return "transparent";
    return normalized;
  }

  function appendRow(container, label, value, options = {}) {
    const row = document.createElement("div");
    row.className = "fia-inspector-row";

    const labelEl = document.createElement("span");
    labelEl.className = "fia-inspector-row-label";
    labelEl.textContent = label;

    const valueEl = document.createElement("span");
    valueEl.className = "fia-inspector-row-value";
    valueEl.textContent = text(value);
    if (options.color) {
      const swatch = document.createElement("span");
      swatch.className = "fia-inspector-color";
      swatch.style.background = options.color;
      valueEl.prepend(swatch);
    }

    row.append(labelEl, valueEl);
    container.appendChild(row);
  }

  function buildPanel() {
    const panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Site Inspector details");
    panel.innerHTML = `
      <div class="fia-inspector-panel-head">
        <div>
          <div class="fia-inspector-tag"></div>
          <div class="fia-inspector-selector"></div>
        </div>
        <button class="fia-inspector-close" type="button" aria-label="Close Site Inspector">×</button>
      </div>
      <div class="fia-inspector-size"></div>
      <section>
        <div class="fia-inspector-section-title">Typography</div>
        <div class="fia-inspector-typography"></div>
      </section>
      <section>
        <div class="fia-inspector-section-title">Appearance</div>
        <div class="fia-inspector-appearance"></div>
      </section>
      <section>
        <div class="fia-inspector-section-title">Accessibility</div>
        <div class="fia-inspector-accessibility"></div>
      </section>
      <div class="fia-inspector-hint">Move over another element to inspect it · Esc to close</div>
    `;
    return panel;
  }

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    #${ROOT_ID} {
      position: fixed; inset: 0; z-index: 2147483646;
      pointer-events: none; font-family: -apple-system, BlinkMacSystemFont,
      "Segoe UI", sans-serif; user-select: none; -webkit-user-select: none;
    }
    #${ROOT_ID} .fia-inspector-highlight {
      position: fixed; display: none; pointer-events: none;
      border: 2px solid #3f92cc; background: rgba(63,146,204,.12);
      box-shadow: 0 0 0 1px rgba(255,255,255,.75), 0 3px 14px rgba(0,0,0,.22);
    }
    #${ROOT_ID} .fia-inspector-label {
      position: fixed; display: none; padding: 3px 6px; border-radius: 4px;
      color: #fff; background: #1b4161; font: 700 10px/1.2 ui-monospace,
      SFMono-Regular, Menlo, monospace; white-space: nowrap;
      box-shadow: 0 2px 8px rgba(0,0,0,.28);
    }
    #${ROOT_ID} #${PANEL_ID} {
      position: fixed; display: none; width: 298px; max-height: min(440px, calc(100vh - 24px));
      overflow-y: auto; pointer-events: auto; color: #f4f7fb;
      background: rgba(31,35,52,.97); border: 1px solid rgba(255,255,255,.16);
      border-radius: 9px; box-shadow: 0 12px 34px rgba(0,0,0,.35), 0 0 0 1px rgba(0,0,0,.16);
      backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
      font-size: 12px; line-height: 1.35;
    }
    #${ROOT_ID} .fia-inspector-panel-head {
      display: flex; align-items: flex-start; justify-content: space-between;
      gap: 10px; padding: 11px 12px 9px;
    }
    #${ROOT_ID} .fia-inspector-tag {
      color: #f6f8fc; font: 700 13px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace;
    }
    #${ROOT_ID} .fia-inspector-selector {
      max-width: 246px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      margin-top: 4px; color: #91a0b8; font: 10px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace;
    }
    #${ROOT_ID} .fia-inspector-close {
      flex: 0 0 auto; width: 23px; height: 23px; padding: 0; border: 0;
      border-radius: 5px; color: #b9c3d4; background: transparent; cursor: pointer;
      font: 400 21px/20px -apple-system, sans-serif;
    }
    #${ROOT_ID} .fia-inspector-close:hover { color: #fff; background: rgba(255,255,255,.12); }
    #${ROOT_ID} .fia-inspector-size {
      margin: 0 12px 3px; padding: 8px 0; border-top: 1px solid rgba(255,255,255,.13);
      border-bottom: 1px solid rgba(255,255,255,.13); color: #72b8ef; text-align: right;
      font: 700 12px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace;
    }
    #${ROOT_ID} section { padding: 8px 12px 9px; border-bottom: 1px solid rgba(255,255,255,.09); }
    #${ROOT_ID} .fia-inspector-section-title {
      margin-bottom: 5px; color: #8f9db3; font-size: 10px; font-weight: 700;
      letter-spacing: .08em; text-transform: uppercase;
    }
    #${ROOT_ID} .fia-inspector-row {
      display: flex; align-items: baseline; justify-content: space-between; gap: 14px;
      min-height: 20px;
    }
    #${ROOT_ID} .fia-inspector-row-label { color: #aeb8c9; flex: 0 0 auto; }
    #${ROOT_ID} .fia-inspector-row-value {
      min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      color: #f4f7fb; text-align: right;
    }
    #${ROOT_ID} .fia-inspector-color {
      display: inline-block; width: 11px; height: 11px; margin-right: 5px;
      vertical-align: -1px; border: 1px solid rgba(255,255,255,.7); border-radius: 3px;
    }
    #${ROOT_ID} .fia-inspector-hint {
      padding: 8px 12px 10px; color: #8290a8; font-size: 10px; text-align: center;
    }
    @media (max-width: 420px) {
      #${ROOT_ID} #${PANEL_ID} { width: min(298px, calc(100vw - 20px)); }
    }
  `;
  document.documentElement.appendChild(style);

  const root = document.createElement("div");
  root.id = ROOT_ID;
  const highlight = document.createElement("div");
  highlight.id = HIGHLIGHT_ID;
  highlight.className = "fia-inspector-highlight";
  const label = document.createElement("div");
  label.id = LABEL_ID;
  label.className = "fia-inspector-label";
  const panel = buildPanel();
  root.append(highlight, label, panel);
  document.documentElement.appendChild(root);

  const tagEl = panel.querySelector(".fia-inspector-tag");
  const selectorEl = panel.querySelector(".fia-inspector-selector");
  const sizeEl = panel.querySelector(".fia-inspector-size");
  const typographyEl = panel.querySelector(".fia-inspector-typography");
  const appearanceEl = panel.querySelector(".fia-inspector-appearance");
  const accessibilityEl = panel.querySelector(".fia-inspector-accessibility");
  let currentElement = null;

  function elementSelector(element) {
    const tag = element.tagName.toLowerCase();
    if (element.id) return `${tag}#${element.id}`;
    const classes = [...element.classList].slice(0, 2).map(name => `.${name}`).join("");
    return `${tag}${classes}`;
  }

  function updatePanel(element, rect, styles) {
    const tag = element.tagName.toUpperCase();
    tagEl.textContent = tag;
    selectorEl.textContent = elementSelector(element);
    label.textContent = tag;
    sizeEl.textContent = `${Math.round(rect.width)} × ${Math.round(rect.height)} px`;

    typographyEl.replaceChildren();
    appendRow(typographyEl, "Font", shortText(styles.fontFamily.replace(/["']/g, "")));
    appendRow(typographyEl, "Size", styles.fontSize);
    appendRow(typographyEl, "Weight", styles.fontWeight);
    appendRow(typographyEl, "Line height", styles.lineHeight);
    appendRow(typographyEl, "Letter spacing", styles.letterSpacing);

    appearanceEl.replaceChildren();
    appendRow(appearanceEl, "Color", formatColor(styles.color), { color: styles.color });
    appendRow(appearanceEl, "Background", formatColor(styles.backgroundColor), { color: styles.backgroundColor });
    appendRow(appearanceEl, "Display", styles.display);
    appendRow(appearanceEl, "Padding", `${styles.paddingTop} ${styles.paddingRight} ${styles.paddingBottom} ${styles.paddingLeft}`);
    appendRow(appearanceEl, "Margin", `${styles.marginTop} ${styles.marginRight} ${styles.marginBottom} ${styles.marginLeft}`);

    accessibilityEl.replaceChildren();
    appendRow(accessibilityEl, "Role", element.getAttribute("role") || implicitRole(element));
    appendRow(accessibilityEl, "Focusable", isKeyboardFocusable(element) ? "Yes" : "No");
    appendRow(accessibilityEl, "Label", shortText(element.getAttribute("aria-label") || element.getAttribute("alt") || ""));
    appendRow(accessibilityEl, "Text", shortText(element.textContent || "", 58));
  }

  function positionPanel(rect) {
    panel.style.display = "block";
    const gap = 14;
    const panelWidth = panel.offsetWidth;
    const panelHeight = panel.offsetHeight;
    let left = rect.right + gap;
    let top = rect.top;
    if (left + panelWidth > window.innerWidth - 10) left = rect.left - panelWidth - gap;
    if (left < 10) left = 10;
    if (top + panelHeight > window.innerHeight - 10) top = window.innerHeight - panelHeight - 10;
    if (top < 10) top = 10;
    panel.style.left = `${Math.round(left)}px`;
    panel.style.top = `${Math.round(top)}px`;
  }

  function showElement(element) {
    if (!element || element === document.documentElement || element === root || root.contains(element)) {
      clearInspection();
      return;
    }
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      clearInspection();
      return;
    }
    currentElement = element;
    const styles = window.getComputedStyle(element);
    highlight.style.display = "block";
    highlight.style.left = `${Math.round(rect.left)}px`;
    highlight.style.top = `${Math.round(rect.top)}px`;
    highlight.style.width = `${Math.round(rect.width)}px`;
    highlight.style.height = `${Math.round(rect.height)}px`;
    label.style.display = "block";
    const labelTop = rect.top >= 24 ? rect.top - 22 : rect.bottom + 4;
    label.style.left = `${clamp(Math.round(rect.left), 8, Math.max(8, window.innerWidth - 80))}px`;
    label.style.top = `${clamp(Math.round(labelTop), 8, Math.max(8, window.innerHeight - 24))}px`;
    updatePanel(element, rect, styles);
    positionPanel(rect);
  }

  function clearInspection() {
    currentElement = null;
    highlight.style.display = "none";
    label.style.display = "none";
    panel.style.display = "none";
  }

  function onPointerMove(event) {
    if (root.contains(event.target)) return;
    const element = document.elementFromPoint(event.clientX, event.clientY);
    showElement(element);
  }

  function onScroll() {
    if (currentElement) showElement(currentElement);
  }

  function destroy() {
    root.remove();
    style.remove();
    document.removeEventListener("pointermove", onPointerMove, true);
    document.removeEventListener("keydown", onKeyDown, true);
    document.removeEventListener("scroll", onScroll, true);
    delete window.__fiaSiteInspector;
  }

  function onKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      destroy();
    }
  }

  panel.querySelector(".fia-inspector-close").addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    destroy();
  });
  document.addEventListener("pointermove", onPointerMove, true);
  document.addEventListener("keydown", onKeyDown, true);
  document.addEventListener("scroll", onScroll, true);
  window.__fiaSiteInspector = { destroy, getCurrentElement: () => currentElement };
})();