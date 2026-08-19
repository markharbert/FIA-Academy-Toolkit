---
name: Responsive toolbar form sizing
description: Preventing native form controls from painting beyond Responsive toolbar flex slots.
---

When using `all: unset` on native form controls in the Responsive toolbar, explicitly restore `box-sizing: border-box` on every control with a declared width and padding.

**Why:** `all: unset` overrides an earlier universal `box-sizing` rule. A `width: 100%` select then uses the content box and adds its left/right padding outside the flex slot, visually covering the adjacent width control even when the toolbar's flex-item gaps are correct.

**How to apply:** Keep structural spacing checks for toolbar children, and separately assert each painted native control's bounding rectangle stays within its wrapper. Do this whenever resetting or restyling native form controls.