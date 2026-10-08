import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import puppeteer from "puppeteer-core";

const version = JSON.parse(await readFile("extension/manifest.json", "utf8")).version;
const temp = await mkdtemp(path.join(os.tmpdir(), "fia-auth-restart-"));
const extensionDir = path.join(temp, "extension");
execFileSync("unzip", ["-q", `extension/fia-toolkit-extension-v${version}.zip`, "-d", extensionDir]);
const launch = () => puppeteer.launch({
  executablePath: process.env.CHROMIUM_PATH || execFileSync("which", ["chromium"]).toString().trim(),
  headless: true, userDataDir: path.join(temp, "profile"),
  args: ["--no-sandbox", "--disable-dev-shm-usage", `--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`],
});
let browser;
try {
  browser = await launch();
  const target = await browser.waitForTarget((t) => t.type() === "service_worker" && t.url().endsWith("/service-worker.js"));
  const extensionId = new URL(target.url()).host;
  await new Promise((resolve) => setTimeout(resolve, 1200));
  const page = await browser.newPage();
  await page.goto(`chrome-extension://${extensionId}/link-picker.html`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.body.textContent.includes("Connect your account"));
  // Reproduce the actual Sign In click against an old deployment returning HTML.
  const initialWorker = await target.createCDPSession();
  await initialWorker.send("Runtime.enable");
  await initialWorker.send("Runtime.evaluate", {
    expression: `globalThis.fetch = async () => new Response("<!DOCTYPE html><html>Old website</html>",
      { status: 200, headers: { "Content-Type": "text/html" } });`,
  });
  await page.evaluate(async () => {
    const { authStore } = await import(chrome.runtime.getURL("auth-store.js"));
    await authStore.set({ extensionLoginPending: { codeVerifier: "x".repeat(43) } });
  });
  const popup = await browser.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`, { waitUntil: "domcontentloaded" });
  await popup.waitForSelector("#sign-in-btn", { visible: true });
  const tabCount = (await browser.pages()).length;
  await popup.click("#sign-in-btn");
  await popup.waitForFunction(() => document.getElementById("setup-error").textContent.includes("publish the update"));
  assert.equal((await browser.pages()).length, tabCount, "old website response must not open any tab");
  const invalidState = await popup.evaluate(async () => {
    const { authStore } = await import(chrome.runtime.getURL("auth-store.js"));
    return !!(await authStore.get("extensionLoginPending")).extensionLoginPending;
  });
  assert.equal(invalidState, false);
  // Verify the popup → worker → browser-tab URL contract against a valid backend.
  await initialWorker.send("Runtime.evaluate", {
    expression: `globalThis.__openedUrl = null;
      chrome.tabs.create = async ({url}) => { globalThis.__openedUrl = url; return { id: 999 }; };
      globalThis.fetch = async () => new Response(JSON.stringify({
        requestId: "r".repeat(43), pollSecret: "p".repeat(43), userCode: "ABCD-1234",
        expiresAt: Date.now()+600000, verificationPath: "/extension/connect?request="+"r".repeat(43)
      }), { status: 200, headers: { "Content-Type": "application/json" } });`,
  });
  await popup.waitForFunction(() => !document.getElementById("sign-in-btn").disabled);
  await popup.click("#sign-in-btn");
  await popup.waitForFunction(() => document.getElementById("login-code").textContent === "ABCD-1234");
  const opened = await initialWorker.send("Runtime.evaluate", { expression: "globalThis.__openedUrl", returnByValue: true });
  assert.equal(opened.result.value, `https://toolkit.fearlessmarketinglab.com/extension/connect?request=${"r".repeat(43)}`);
  await popup.evaluate(async () => {
    const { authStore } = await import(chrome.runtime.getURL("auth-store.js"));
    await authStore.remove("extensionLoginPending");
    await chrome.alarms.clear("extension-login-poll");
  });
  console.log("PASS: packaged Sign In button rejects old HTML responses, clears corrupt pending state, and opens only the validated approval URL.");
  await page.evaluate(async () => {
    await new Promise((resolve, reject) => {
      const request = indexedDB.open("fia-extension-auth", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("state");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const tx = request.result.transaction("state", "readwrite", { durability: "strict" });
        tx.objectStore("state").put({
          accessToken: "fte_access_" + "a".repeat(64), refreshToken: "fte_refresh_" + "b".repeat(64),
          accessExpiresAt: Date.now() - 7 * 86400000, refreshExpiresAt: Date.now() + 90 * 86400000,
          account: { id: "restart-test", email: "restart@example.invalid" },
        }, "extensionAuth");
        tx.oncomplete = () => { request.result.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
    });
  });
  await browser.close();
  browser = await launch();
  const restarted = await browser.waitForTarget((t) => t.type() === "service_worker" && t.url().endsWith("/service-worker.js"));
  assert.equal(new URL(restarted.url()).host, extensionId);
  await new Promise((resolve) => setTimeout(resolve, 1200));
  const worker = await restarted.createCDPSession();
  await worker.send("Runtime.enable");
  await worker.send("Runtime.evaluate", {
    expression: `globalThis.__refreshCount = 0;
      globalThis.fetch = async (url, opts) => {
        const data = String(url).endsWith("/refresh") ? (
          globalThis.__refreshCount++,
          { accessToken: "fte_access_"+"c".repeat(64), refreshToken: "fte_refresh_"+"d".repeat(64),
            accessExpiresAt: Date.now()+900000, refreshExpiresAt: Date.now()+90*86400000,
            account: { id: "restart-test", email: "restart@example.invalid" } }
        ) : String(url).includes("/api/v1/links?") ? { links: [{ id: "test", title: "Persistent connection", url: "https://example.invalid" }] } : null;
        if (!data) throw new Error("Unexpected live network request blocked");
        return new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json" } });
      };`,
  });
  const resumed = await browser.newPage();
  await resumed.goto(`chrome-extension://${extensionId}/link-picker.html`, { waitUntil: "domcontentloaded" });
  await resumed.waitForSelector(".link-button");
  assert.equal(await resumed.$eval(".link-button", (b) => b.textContent.trim()), "Persistent connection");
  const status = await resumed.evaluate(() => chrome.runtime.sendMessage({ type: "AUTH_STATUS" }));
  assert.equal(status.connected, true);
  assert.equal(status.account.id, "restart-test");
  assert.ok(!status.accessToken && !status.refreshToken);
  const count = await worker.send("Runtime.evaluate", { expression: "globalThis.__refreshCount", returnByValue: true });
  assert.equal(count.result.value, 1);
  console.log("PASS: packaged extension survives a full browser restart and renews a week-expired access session automatically.");
} finally {
  await browser?.close();
  await rm(temp, { recursive: true, force: true });
}
