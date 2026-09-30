import assert from "node:assert/strict";
import { test } from "node:test";
import { safeNormalizeWebsite } from "./inboxIntelScreenshots";

test("outbound destinations reject local, metadata and credential-bearing URLs", async () => {
  for (const url of [
    "http://localhost:5000/path",
    "http://127.0.0.1/",
    "http://169.254.169.254/latest/meta-data/",
    "http://10.0.0.1/",
    "http://[::1]/",
    "https://user:password@example.com/",
    "file:///etc/passwd",
  ]) {
    assert.equal(await safeNormalizeWebsite(url), null, url);
  }
});

test("public IP literal destinations remain supported", async () => {
  assert.equal(await safeNormalizeWebsite("https://8.8.8.8/hook"), "https://8.8.8.8/hook");
});