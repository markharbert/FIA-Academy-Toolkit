import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import puppeteer from "puppeteer-core";

const manifest = JSON.parse(await readFile("extension/manifest.json", "utf8"));
const temp = await mkdtemp(path.join(os.tmpdir(), "fia-preload-"));
const extensionDir = path.join(temp, "extension");
execFileSync("unzip", ["-q", `extension/fia-toolkit-extension-v${manifest.version}.zip`, "-d", extensionDir]);
let browser;
try {
  browser = await puppeteer.launch({
    executablePath: process.env.CHROMIUM_PATH || execFileSync("which", ["chromium"]).toString().trim(),
    headless: true, userDataDir: path.join(temp, "profile"),
    args: ["--no-sandbox", "--disable-dev-shm-usage", `--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`],
  });
  const target = await browser.waitForTarget((t) => t.type() === "service_worker" && t.url().endsWith("/service-worker.js"));
  const id = new URL(target.url()).host;
  await new Promise((resolve) => setTimeout(resolve, 1200));
  const session = await target.createCDPSession();
  await session.send("Runtime.enable");
  await session.send("Runtime.evaluate", { awaitPromise: true, expression: `(async () => {
    const canvas = new OffscreenCanvas(40, 24);
    canvas.getContext("2d").fillRect(0,0,40,24);
    globalThis.__image = await (await canvas.convertToBlob({type:"image/png"})).arrayBuffer();
    globalThis.__apiCalls = 0; globalThis.__imageCalls = 0; globalThis.__offline = false;
    globalThis.__links = [
      {id:"a",title:"Preloaded first link",url:"https://example.invalid/a",isActive:true,screenshotUrl:"https://images.example.invalid/a.png"},
      {id:"b",title:"Preloaded second link",url:"https://example.invalid/b",isActive:true,screenshotUrl:"https://images.example.invalid/b.png"}
    ];
    globalThis.fetch = async (url, options={}) => {
      const address = String(url);
      if (__offline) throw new Error("Fixture offline");
      if (address.includes("images.example.invalid")) {
        if (options.headers?.Authorization) throw new Error("Credentials leaked to image host");
        __imageCalls++;
        return new Response(__image.slice(0), {headers:{"Content-Type":"image/png"}});
      }
      const json = (data) => new Response(JSON.stringify(data), {headers:{"Content-Type":"application/json"}});
      if (address.endsWith("/api/extension/auth/logout")) return json({ok:true});
      __apiCalls++;
      if (address.includes("/api/v1/links")) {
        if (options.method === "PATCH") {
          __links[0] = {...__links[0],...JSON.parse(options.body)};
          return json(__links[0]);
        }
        if (options.method === "DELETE") { __links = __links.filter(link => link.id !== "b"); return json({ok:true}); }
        return json({links:__links});
      }
      if (address.includes("/api/v1/dmo/history")) return json({entries:[]});
      if (address.includes("/api/v1/dmo/settings")) return json({visionTarget:30});
      if (address.endsWith("/api/v1/dmo")) return json({date:new Date().toISOString().slice(0,10),entry:null,streak:{currentStreak:0}});
      throw new Error("Unexpected network request blocked");
    };
  })()` });
  const control = await browser.newPage();
  await control.goto(`chrome-extension://${id}/link-picker.html`, {waitUntil:"domcontentloaded"});
  async function seed(accountId) {
    await control.evaluate(async (accountId) => {
      const {authStore} = await import(chrome.runtime.getURL("auth-store.js"));
      await authStore.set({extensionAuth:{
        accessToken:"fte_access_"+"a".repeat(64),refreshToken:"fte_refresh_"+"b".repeat(64),
        accessExpiresAt:Date.now()+900000,refreshExpiresAt:Date.now()+90*86400000,
        account:{id:accountId,email:"preload-fixture@example.invalid"},
      }});
    }, accountId);
  }
  const message = (data) => control.evaluate((data) => chrome.runtime.sendMessage(data), data);
  await seed("preload-A");
  await message({type:"POPUP_CACHE_WARM"});
  await control.waitForFunction(async () => {
    const snapshot = await chrome.runtime.sendMessage({type:"POPUP_CACHE_SNAPSHOT"});
    return Object.keys(snapshot.thumbnails || {}).length === 2;
  });
  let counters = await session.send("Runtime.evaluate", {expression:"JSON.stringify([__apiCalls,__imageCalls])",returnByValue:true});
  assert.deepEqual(JSON.parse(counters.result.value), [4,2], "all four data panels and both thumbnails preload without opening the popup");
  async function openPopup() {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on("request", (request) => {
      if (request.url().startsWith("https://toolkit.fearlessmarketinglab.com/")) {
        request.respond({status:200,contentType:"application/json",body:JSON.stringify({version:manifest.version})});
      } else if (/^https?:/.test(request.url())) request.abort();
      else request.continue();
    });
    await page.goto(`chrome-extension://${id}/popup.html`, {waitUntil:"domcontentloaded"});
    await page.waitForSelector("#main-screen.active");
    return page;
  }
  let popup = await openPopup();
  await popup.waitForFunction(() => [...document.querySelectorAll("#links-content img")].length === 2 &&
    [...document.querySelectorAll("#links-content img")].every(img => img.src.startsWith("data:image/") && img.naturalWidth > 0));
  counters = await session.send("Runtime.evaluate", {expression:"JSON.stringify([__apiCalls,__imageCalls])",returnByValue:true});
  assert.deepEqual(JSON.parse(counters.result.value), [4,2], "opening the popup reuses its preloaded data and images");
  await popup.click('[data-primary="links"]');
  await popup.waitForSelector("#links-content .link-card", {visible:true});
  await popup.screenshot({path:"/tmp/fia-extension-links-preloaded.png"});
  await popup.close();
  await session.send("Runtime.evaluate", {expression:"globalThis.__offline = true"});
  popup = await openPopup();
  await popup.waitForFunction(() => document.querySelectorAll("#links-content img.loaded").length === 2);
  assert.match(await popup.$eval("#links-content", el => el.textContent), /Preloaded first link/);
  console.log("PASS: background data/thumbnails are ready before popup opening, reopen adds no fetches, and offline reopen shows decoded cached images.");
  await session.send("Runtime.evaluate", {expression:"globalThis.__offline = false"});
  const edited = await message({type:"AUTH_REQUEST",path:"/api/v1/links/a",method:"PATCH",
    body:JSON.stringify({title:"Updated link",screenshotUrl:"https://images.example.invalid/a-new.png"})});
  assert.equal(edited.status,200);
  await popup.waitForFunction(() => document.getElementById("links-content").textContent.includes("Updated link") &&
    [...document.querySelectorAll("#links-content img")].some(img => img.dataset.thumbSource.includes("a-new.png") && img.src.startsWith("data:image/") && img.naturalWidth > 0));
  assert.equal((await message({type:"AUTH_REQUEST",path:"/api/v1/links/b",method:"DELETE"})).status,200);
  await popup.waitForFunction(() => document.querySelectorAll("#links-content .link-card").length === 1);
  console.log("PASS: edits, changed screenshots, and deletions refresh the cache and visible cards.");
  assert.equal((await message({type:"AUTH_LOGOUT"})).ok,true);
  await popup.waitForSelector("#setup-screen.active");
  await control.waitForFunction(async () => {
    const request = indexedDB.open("fia-popup-cache",1);
    const rows = await new Promise((resolve,reject) => {
      request.onsuccess = () => {
        const get = request.result.transaction("entries").objectStore("entries").getAll();
        get.onsuccess = () => { request.result.close(); resolve(get.result); };
        get.onerror = () => reject(get.error);
      };
    });
    return rows.length === 0;
  });
  await popup.close();
  await seed("preload-B");
  assert.deepEqual((await message({type:"POPUP_CACHE_SNAPSHOT"})).thumbnails,{});
  const denied = await browser.newPage();
  await denied.goto("data:text/html,<html>Untrusted page</html>");
  // Direct external pages have no extension API; existing content-script guards
  // are also checked in the wider packaged toolkit regression suite.
  assert.equal(await denied.evaluate(() => typeof chrome.runtime), "undefined");
  console.log("PASS: sign-out removes persisted member data and another member cannot receive the previous thumbnail cache.");
} finally {
  await browser?.close();
  await rm(temp,{recursive:true,force:true});
}
