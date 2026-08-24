---
name: Email asset runtime paths
description: How shared email image assets resolve safely in both development and compiled production runtimes.
---

Shared email assets must prefer the compiled public directory in production and use a source-tree fallback for development. Development TypeScript executes as ESM, where `__dirname` is unavailable; the compiled CJS server has it.

**Why:** A path helper that unconditionally referenced `__dirname` caused the email logo endpoint to fail during development, while a source-only path caused the same endpoint to fail in production.

**How to apply:** When adding server-side public asset lookups, branch safely on runtime availability of `__dirname` and use `process.cwd()/dist/public` for the ESM-compatible compiled-directory fallback, then retain the source public directory for development.