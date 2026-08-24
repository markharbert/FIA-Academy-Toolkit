import assert from "node:assert/strict";
import test from "node:test";
import path from "path";
import { resolveEmailLogoPath } from "./email-assets";

const compiledPublicDir = path.join("/app", "dist", "public");
const sourcePublicDir = path.join("/app", "client", "public");
const compiledLogo = path.join(compiledPublicDir, "lion-logo.png");
const sourceLogo = path.join(sourcePublicDir, "lion-logo.png");

test("email logo resolves from the compiled public directory in production", () => {
  const resolved = resolveEmailLogoPath({
    compiledPublicDir,
    sourcePublicDir,
    fileExists: (filePath) => filePath === compiledLogo,
  });

  assert.equal(resolved, compiledLogo);
});

test("email logo falls back to the source public directory during development", () => {
  const resolved = resolveEmailLogoPath({
    compiledPublicDir,
    sourcePublicDir,
    fileExists: (filePath) => filePath === sourceLogo,
  });

  assert.equal(resolved, sourceLogo);
});

test("email logo lookup fails explicitly when neither asset is available", () => {
  assert.equal(
    resolveEmailLogoPath({
      compiledPublicDir,
      sourcePublicDir,
      fileExists: () => false,
    }),
    undefined,
  );
});