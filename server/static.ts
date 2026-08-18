import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  // Hashed JS/CSS chunks can be cached long-term — their filenames change on
  // every build so stale assets are never a problem.
  // index.html must NEVER be cached. The lazyPage() helper in App.tsx calls
  // window.location.reload() when a chunk 404s after a new deployment. That
  // only breaks the loop if the browser fetches a FRESH index.html with the
  // updated chunk hashes. If the browser serves a 304-cached index.html, the
  // same missing chunk 404s again → reload again → infinite refresh loop.
  app.use(
    express.static(distPath, {
      setHeaders(res, filePath) {
        if (path.basename(filePath) === "index.html") {
          res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
          res.setHeader("Pragma", "no-cache");
          res.setHeader("Expires", "0");
        }
      },
    }),
  );

  // SPA fallback — also must not be cached for the same reason
  app.use("*", (_req, res) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
