import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { mkdtemp, writeFile, rm, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// Briefly test the actual compiled server. Never send external HTTP requests or
// leave a second scheduler running beside the normal development workflow.
const dir = await mkdtemp(path.join(os.tmpdir(), "toolkit-production-probe-"));
const guard = path.join(dir, "block-outbound.mjs");
await writeFile(guard, `
import http from "node:http";
import https from "node:https";
import { syncBuiltinESMExports } from "node:module";
const blocked = () => { throw new Error("External HTTP disabled in production readiness probe"); };
http.request = http.get = https.request = https.get = blocked;
globalThis.fetch = blocked;
syncBuiltinESMExports();
`);
const reservation = createServer();
reservation.listen(0, "127.0.0.1");
await once(reservation, "listening");
const port = reservation.address().port;
await new Promise((resolve) => reservation.close(resolve));
const child = spawn(process.execPath, ["--import", guard, "dist/index.cjs"], {
  env: { ...process.env, NODE_ENV: "production", PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"],
});
let output = "";
child.stdout.on("data", (data) => { output = (output + data.toString()).slice(-10000); });
child.stderr.on("data", (data) => { output = (output + data.toString()).slice(-10000); });
try {
  const origin = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 20000;
  let root;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) throw new Error("Compiled server exited before opening its HTTP listener.");
    try {
      root = await fetch(origin, { signal: AbortSignal.timeout(300) });
      if (root.status === 200) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  if (!root || root.status !== 200) throw new Error("Compiled server did not pass its HTTP health check within 20 seconds.");
  assert.equal(root.status, 200, "publishing health-check route must return HTTP 200");
  const html = await root.text();
  assert.ok(!html.includes("/@vite/client"), "production must serve built assets, not the development server");
  const asset = html.match(/src="([^"]*\/assets\/[^"]+\.js)"/)?.[1];
  assert.ok(asset, "production entrypoint must reference a compiled JavaScript asset");
  assert.equal((await fetch(new URL(asset, origin), { method: "HEAD", signal: AbortSignal.timeout(5000) })).status, 200);
  const version = await (await fetch(origin + "/api/extension/version")).json();
  assert.equal(version.version, JSON.parse(await readFile("extension/manifest.json")).version);
  const invalid = await fetch(origin + "/api/extension/auth/start", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ codeChallenge: "invalid" }),
  });
  assert.equal(invalid.status, 400);
  assert.ok(invalid.headers.get("Content-Type").includes("application/json"), "auth route must not fall through to SPA HTML");
  await invalid.json();
  console.log("PASS: compiled production server starts, root health check and built assets return 200, extension version matches, and login API returns JSON.");
} catch (error) {
  console.error("Production startup diagnostics:", output.split("\n").filter((line) =>
    !/key|token|secret|password|cookie|sender configured/i.test(line)).slice(0, 18).join("\n") || "(no startup output)");
  throw error;
} finally {
  if (child.exitCode === null && child.signalCode === null) {
    const exited = once(child, "exit");
    child.kill("SIGKILL");
    await exited;
  }
  await rm(dir, { recursive: true, force: true });
}
