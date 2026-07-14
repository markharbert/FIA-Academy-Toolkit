---
name: Funnel canvas theme system
description: How dark/light mode works in the Funnel Planner canvas
---

## Pattern

- `client/src/components/funnel-planner/canvas-theme-context.tsx` — tiny context exporting `CanvasTheme = "dark" | "light"` and `useCanvasTheme()`.
- `editor.tsx` wraps `<ReactFlow>` in `<CanvasThemeContext.Provider value={canvasTheme}>`. State lives in `EditorInner` and is persisted via `localStorage.getItem/setItem("funnelCanvasTheme")`.
- Toggle button (Sun/Moon icon) is in the toolbar next to Export PNG.
- All node components (`TrafficSourceNode`, `EmailNode`, `FunnelPageNode`, `NoteNode`) and `CustomEdge` call `useCanvasTheme()` and apply conditional Tailwind classes.
- `NODE_CONFIGS` has both `color`/`border` (dark) and `lightColor`/`lightBorder` fields.
- `Handles` is a component (not a constant) so it can consume context.

**Why:** React Flow renders node components independently; the only clean way to pass theme without prop-drilling through the RF internals is React Context.

**How to apply:** When adding a new node type, always consume `useCanvasTheme()` and apply the same dark/light conditional pattern used in `FunnelPageNode`. Add `lightColor` and `lightBorder` entries to `NODE_CONFIGS`.
