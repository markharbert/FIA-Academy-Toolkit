import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import bcrypt from "bcrypt";
import puppeteer from "puppeteer-core";
import { pool } from "../server/db";
import { extensionPkceChallenge } from "../server/extension-auth";

const domain = process.env.REPLIT_DEV_DOMAIN;
if (!domain) throw new Error("The development preview domain is required.");
const base = `https://${domain}`;
const id = randomUUID();
const email = `extension-browser-test-${id}@example.invalid`;
const password = randomBytes(24).toString("hex");
const verifier = randomBytes(32).toString("base64url");
let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;
let requestId: string | undefined;
const post = async (path: string, data: any) => {
  const response = await fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
  return { status: response.status, data: await response.json() };
};
try {
  await pool.query("INSERT INTO users(id,email,password_hash,is_admin) VALUES($1,$2,$3,true)", [id, email, await bcrypt.hash(password, 10)]);
  const start = await post("/api/extension/auth/start", { codeChallenge: extensionPkceChallenge(verifier) });
  assert.equal(start.status, 200);
  requestId = start.data.requestId;
  browser = await puppeteer.launch({
    executablePath: process.env.CHROMIUM_PATH || execFileSync("which", ["chromium"]).toString().trim(),
    headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage();
  page.on("dialog", (dialog) => { void dialog.accept(); });
  await page.goto(base + start.data.verificationPath, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('input[name="email"]');
  assert.ok(page.url().includes("redirect="), "logged-out members return to the connection request after normal login");
  await page.type('input[name="email"]', email);
  await page.type('input[name="password"]', password);
  await page.click('[data-testid="button-login-submit"]');
  await page.waitForFunction((code) => document.body.textContent?.includes(code), { timeout: 25000 }, start.data.userCode);
  assert.ok(page.url().includes("/extension/connect"), "normal login preserves the pending authorization destination");
  await page.waitForSelector('[data-testid="button-approve-extension"]', { visible: true, timeout: 10000 });
  await page.click('[data-testid="button-approve-extension"]');
  await page.waitForFunction(() => document.body.textContent?.includes("Connection approved"));
  const grant = await post("/api/extension/auth/poll", { requestId, pollSecret: start.data.pollSecret, codeVerifier: verifier });
  assert.equal(grant.data.status, "connected");
  assert.equal(grant.data.account.id, id);
  await page.goto(base + "/account", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.body.textContent?.includes("Browser extension sessions"), { timeout: 25000 });
  await page.waitForFunction(() => document.querySelector('button[aria-label="Revoke session for Chrome extension"]'));
  await page.click('button[aria-label="Revoke session for Chrome extension"]');
  await page.waitForFunction(() => document.body.textContent?.includes("No active extension sessions"));
  const revoked = await post("/api/extension/auth/refresh", { refreshToken: grant.data.refreshToken });
  assert.equal(revoked.status, 401);
  const apiKey = await page.evaluate(async () => {
    const response = await fetch("/api/account/api-key", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label: "readiness fixture" }),
    });
    if (!response.ok) throw new Error("Could not issue fixture API key");
    return (await response.json()).rawKey;
  });
  assert.equal(typeof apiKey, "string");
  await pool.query("UPDATE users SET is_disabled=true WHERE id=$1", [id]);
  const disabled = await fetch(base + "/api/v1/me", { headers: { "X-API-Key": apiKey } });
  assert.equal(disabled.status, 403, "disabled accounts must not retain access via legacy API keys");
  console.log("PASS: disabled-account legacy API access is blocked.");
  console.log("PASS: normal login redirect, visible approval code, explicit connection approval, account session list and device revocation.");
} catch (error) {
  if (browser) {
    const pages = await browser.pages();
    const page = pages[pages.length - 1];
    console.error("Browser state:", new URL(page.url()).pathname, await page.$eval("body", (body) => body.innerText.slice(0, 1600)));
    await page.screenshot({ path: "/tmp/extension-login-test.jpg" });
  }
  throw error;
} finally {
  await browser?.close();
  if (requestId) await pool.query("DELETE FROM extension_auth_requests WHERE id=$1", [requestId]);
  await pool.query("DELETE FROM users WHERE id=$1", [id]);
  await pool.query("DELETE FROM user_sessions WHERE sess->>'userId'=$1", [id]);
  await pool.end();
}
