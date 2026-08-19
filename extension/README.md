# FIA Toolkit extension checks

## Link Vault paste smoke test

Run this before distributing an updated extension archive:

```bash
npm run extension:smoke
```

The check extracts `fia-toolkit-extension-v2.2.2.zip` into a temporary folder and launches it in a clean Chromium profile. It verifies:

- the archive still connects the right-click Link Vault menu to its originating-tab/window/request handoff;
- insertion into a Facebook-shaped comment `contenteditable`;
- insertion into a separate ProseMirror-shaped rich-text editor;
- the copied/manual-paste fallback when the source page has no editable destination; and
- picker cancellation, reopening, and rejection of a stale picker request so a link cannot land in another tab.

It uses Chromium available on the Replit workspace. Set `CHROMIUM_PATH` when running it somewhere Chromium is not available on the normal command path.

For harness failure checks, `LINK_VAULT_SMOKE_ARCHIVE` can point at a specific archive path. A missing or invalid archive must exit nonzero.

When the extension itself changes, update the manifest version and archive name together, then update the archive path in `scripts/extension-link-vault-smoke.mjs` if needed before running this check.