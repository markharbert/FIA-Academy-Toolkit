---
name: Faithful authenticated UI previews
description: Check actual source parity before treating an isolated design preview as verification.
---

For signed-in page redesigns, verify that isolated previews use the actual
production component and styles, with only external dependencies stubbed.
Do not accept a helper's claim of source extraction without checking parity.

**Why:** A design helper initially supplied a polished but independently written
preview during the account-settings redesign. It did not establish how the real
page rendered, and theme-specific contrast issues remained to be checked.

**How to apply:** Inspect preview source and stylesheet parity before relying on
screenshots. Test relevant themes and viewport sizes. Keep authentication intact
and distinguish fixture-based visual checks from verification of the signed-in UI.
