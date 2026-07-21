---
name: Popup native dialogs blocked by canvas iframe sandbox
description: Why window.confirm/beforeunload dialogs silently fail in teleprompter-style popups and what to use instead
---

The app is usually viewed inside the Replit canvas iframe. Popups opened via `window.open` from a sandboxed iframe inherit its sandbox flags, and without `allow-modals` the browser **silently suppresses** `window.confirm()`, `alert()`, `prompt()`, AND the native `beforeunload` "Leave site?" dialog. `confirm()` just returns false instantly; `beforeunload` prompts never render. Additionally, Chrome only shows `beforeunload` dialogs after the user has clicked/typed in the window at least once (user-activation rule), even outside sandboxes.

**Why:** Multiple rounds were wasted believing close-confirmation code was broken when the dialogs were being blocked by the environment. No amount of `confirm()`/`beforeunload` tweaking can fix it.

**How to apply:** For any confirmation UX inside a popup opened from the app, use a custom in-page DOM overlay dialog (styled card + Cancel/Confirm buttons) — it can never be blocked. Keep `beforeunload` only as a best-effort backup for the native window X, and store its handler in a variable so it can be `removeEventListener`-ed before a confirmed `window.close()` (otherwise a second dialog may appear outside the sandbox). Also remember: the popup is one giant template literal, so backslash escapes become literal characters in the generated JS — use double quotes, no `\n`/`\'`. Verify generated popup JS with `npx tsx` extraction + `node --check`, and smoke-test visually by writing the HTML to `client/public/__test.html` and screenshotting it (delete after).
