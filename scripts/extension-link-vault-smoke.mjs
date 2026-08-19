import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(
  await readFile(path.join(rootDir, "extension", "manifest.json"), "utf8"),
);
const archivePath = process.env.LINK_VAULT_SMOKE_ARCHIVE
  || path.join(rootDir, "extension", `fia-toolkit-extension-v${manifest.version}.zip`);
const linkUrl = "https://example.test/link-vault-smoke";

function fail(message) {
  throw new Error(`Link Vault smoke test failed: ${message}`);
}

function fixtureHtml(kind) {
  const fields = {
    facebook: `
      <main>
        <h1>Facebook-shaped comment fixture</h1>
        <div
          id="facebook-comment"
          role="textbox"
          aria-label="Comment"
          contenteditable="true"
          data-lexical-editor="true"
        ><span data-editor-leaf="true">Reply: </span></div>
      </main>`,
    richtext: `
      <main>
        <h1>Rich-text editor fixture</h1>
        <div id="rich-text-editor" class="ProseMirror" contenteditable="true">
          <p><span data-editor-leaf="true">Draft: </span></p>
        </div>
      </main>`,
    noeditor: `
      <main>
        <h1>No editable destination fixture</h1>
        <p id="read-only-copy">This page intentionally has no editable field.</p>
      </main>`,
    color: `
      <main>
        <h1>Color picker fixture</h1>
        <div id="color-swatch"></div>
      </main>`,
  };

  return `<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <title>Link Vault smoke fixture</title>
        <style>
          body { font: 16px system-ui, sans-serif; margin: 3rem; }
          [contenteditable] { border: 1px solid #94a3b8; border-radius: 8px; min-height: 4rem; padding: 1rem; }
          #color-swatch { position: fixed; left: 140px; top: 180px; width: 180px; height: 160px; background: rgb(18, 52, 86); }
        </style>
      </head>
      <body>${fields[kind] || fields.noeditor}</body>
    </html>`;
}

async function startFixtureServer() {
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url || "/", "http://fixture.test").pathname;
    const kind = pathname.includes("facebook")
      ? "facebook"
      : pathname.includes("richtext")
        ? "richtext"
        : pathname.includes("color")
          ? "color"
          : "noeditor";

    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    });
    response.end(fixtureHtml(kind));
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  if (!address || typeof address === "string") fail("could not start fixture server");
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

async function waitFor(assertion, description, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await assertion();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  fail(`${description}${lastError ? ` (${lastError.message})` : ""}`);
}

async function captureEditableContext(page, selector) {
  await page.waitForSelector(selector);
  await page.evaluate((fieldSelector) => {
    const field = document.querySelector(fieldSelector);
    const eventTarget = field?.querySelector("[data-editor-leaf]") || field;
    if (!field || !eventTarget) throw new Error(`Missing ${fieldSelector}`);

    field.focus();
    const range = document.createRange();
    range.selectNodeContents(field);
    range.collapse(false);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    eventTarget.dispatchEvent(new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      button: 2,
      buttons: 2,
    }));
  }, selector);
}

async function installLinkApiStub(pickerPage) {
  await pickerPage.setRequestInterception(true);
  pickerPage.on("request", (request) => {
    const url = request.url();
    if (url.includes("/api/v1/links?activeOnly=false")) {
      return request.respond({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          links: [{ id: "smoke-link", title: "Smoke-test Link", url: linkUrl }],
        }),
      });
    }
    if (url.includes("/api/v1/links/smoke-link/click")) {
      return request.respond({ status: 204, body: "" });
    }
    return request.continue();
  });
}

async function assertPickerOpeningContract(extensionDir) {
  const serviceWorker = await readFile(path.join(extensionDir, "service-worker.js"), "utf8");

  assert.match(
    serviceWorker,
    /chrome\.contextMenus\.onClicked\.addListener\(async \(info, tab\) => \{[\s\S]*?info\.menuItemId === "fia-link-vault"[\s\S]*?await openLinkVaultPicker\(tab\)/,
    "the packaged context-menu handler no longer opens the Link Vault picker for the clicked tab",
  );
  assert.match(
    serviceWorker,
    /const sourceTabId = tab\?\.id;[\s\S]*?const sourceWindowId = tab\?\.windowId;[\s\S]*?const pickerRequestId = crypto\.randomUUID\(\)/,
    "the packaged picker opener no longer captures the originating tab, window, and request ID",
  );
  assert.match(
    serviceWorker,
    /linkPickerContext: \{[\s\S]*?sourceTabId,[\s\S]*?sourceWindowId,[\s\S]*?pickerRequestId,[\s\S]*?\}[\s\S]*?chrome\.windows\.create\(/,
    "the packaged picker opener no longer persists its initial source context before opening a picker window",
  );
  assert.match(
    serviceWorker,
    /pickerWindowId: picker\?\.id,[\s\S]*?pickerRequestId,[\s\S]*?openedAt: Date\.now\(\)/,
    "the packaged picker opener no longer records the popup window used for cancellation cleanup",
  );
}

async function main() {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "fia-link-vault-smoke-"));
  const extensionDir = path.join(temporaryRoot, "extension");
  const userDataDir = path.join(temporaryRoot, "profile");
  let browser;
  let fixture;

  try {
    execFileSync("unzip", ["-q", "-o", archivePath, "-d", extensionDir], { stdio: "inherit" });
    await assertPickerOpeningContract(extensionDir);
    fixture = await startFixtureServer();

    const chromiumPath = process.env.CHROMIUM_PATH || execFileSync("which", ["chromium"], { encoding: "utf8" }).trim();
    browser = await puppeteer.launch({
      browser: "chrome",
      executablePath: chromiumPath,
      headless: true,
      userDataDir,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        `--disable-extensions-except=${extensionDir}`,
        `--load-extension=${extensionDir}`,
      ],
    });

    const serviceWorker = await browser.waitForTarget(
      (target) => target.type() === "service_worker" && target.url().includes("service-worker.js"),
      { timeout: 10_000 },
    );
    const workerSession = await serviceWorker.createCDPSession();
    await workerSession.send("Runtime.enable");
    await workerSession.send("Runtime.evaluate", {
      expression: "chrome.runtime.getManifest().version",
      awaitPromise: true,
    });

    const extensionId = new URL(serviceWorker.url()).host;
    const extensionPage = await browser.newPage();
    await extensionPage.goto(`chrome-extension://${extensionId}/popup.html`, { waitUntil: "domcontentloaded" });
    await extensionPage.evaluate(async () => {
      await chrome.storage.local.set({ apiKey: "link-vault-smoke-test" });
      await chrome.storage.session.clear();
    });

    async function tabFor(url) {
      return waitFor(async () => {
        const tabs = await extensionPage.evaluate(() => chrome.tabs.query({}));
        return tabs.find((tab) => tab.url === url);
      }, `Chrome did not expose fixture tab ${url}`);
    }

    async function setPickerContext(sourceTab, requestId, pickerWindowId) {
      await extensionPage.evaluate(async ({ sourceTab, requestId, pickerWindowId }) => {
        await chrome.storage.session.set({
          linkPickerContext: {
            sourceTabId: sourceTab.id,
            sourceWindowId: sourceTab.windowId,
            ...(Number.isInteger(pickerWindowId) ? { pickerWindowId } : {}),
            pickerRequestId: requestId,
            openedAt: Date.now(),
          },
        });
      }, { sourceTab, requestId, pickerWindowId });
    }

    async function readPickerContext() {
      return extensionPage.evaluate(async () => {
        const { linkPickerContext } = await chrome.storage.session.get("linkPickerContext");
        return linkPickerContext;
      });
    }

    async function openPicker(sourceTab, requestId, { persistContext = true } = {}) {
      const pickerUrl = `chrome-extension://${extensionId}/link-picker.html?request=${encodeURIComponent(requestId)}`;
      const { windowId } = await extensionPage.evaluate(async (url) => {
        const window = await chrome.windows.create({
          url,
          type: "popup",
          width: 380,
          height: 560,
          focused: true,
        });
        return { windowId: window.id };
      }, pickerUrl);

      if (persistContext) await setPickerContext(sourceTab, requestId, windowId);

      const pickerTarget = await browser.waitForTarget(
        (target) => target.type() === "page" && target.url() === pickerUrl,
        { timeout: 5_000 },
      );
      const pickerPage = await pickerTarget.page();
      await installLinkApiStub(pickerPage);
      await pickerPage.reload({ waitUntil: "domcontentloaded" });
      await pickerPage.waitForSelector(".link-button");

      return { pickerPage, windowId };
    }

    async function chooseSmokeLink(pickerPage) {
      await pickerPage.click(".link-button");
      await pickerPage.waitForFunction(
        () => document.getElementById("result")?.textContent?.trim().length > 0,
      );
      return pickerPage.$eval("#result", (element) => element.textContent?.trim());
    }

    const facebookUrl = `${fixture.baseUrl}/facebook`;
    const facebookPage = await browser.newPage();
    await facebookPage.goto(facebookUrl, { waitUntil: "domcontentloaded" });
    await captureEditableContext(facebookPage, "#facebook-comment");
    const facebookPicker = await openPicker(await tabFor(facebookUrl), "facebook-contenteditable");
    assert.equal(await chooseSmokeLink(facebookPicker.pickerPage), "Link pasted");
    await facebookPage.waitForFunction((url) => document.querySelector("#facebook-comment")?.textContent?.includes(url), {}, linkUrl);

    const richTextUrl = `${fixture.baseUrl}/richtext`;
    const richTextPage = await browser.newPage();
    await richTextPage.goto(richTextUrl, { waitUntil: "domcontentloaded" });
    await captureEditableContext(richTextPage, "#rich-text-editor");
    const richTextPicker = await openPicker(await tabFor(richTextUrl), "generic-rich-text");
    assert.equal(await chooseSmokeLink(richTextPicker.pickerPage), "Link pasted");
    await richTextPage.waitForFunction((url) => document.querySelector("#rich-text-editor")?.textContent?.includes(url), {}, linkUrl);

    const noEditorUrl = `${fixture.baseUrl}/noeditor`;
    const noEditorPage = await browser.newPage();
    await noEditorPage.goto(noEditorUrl, { waitUntil: "domcontentloaded" });
    const noEditorPicker = await openPicker(await tabFor(noEditorUrl), "manual-paste-fallback");
    assert.equal(
      await chooseSmokeLink(noEditorPicker.pickerPage),
      "Copied — press Ctrl+V to paste",
      "a page without an editable destination must retain the copied/manual-paste fallback",
    );
    assert.equal(
      await noEditorPage.$eval("#read-only-copy", (element, url) => element.textContent?.includes(url), linkUrl),
      false,
      "fallback must not alter a non-editable page",
    );

    const cancelledUrl = `${fixture.baseUrl}/facebook?case=cancelled`;
    const reopenedUrl = `${fixture.baseUrl}/richtext?case=reopened`;
    const cancelledPage = await browser.newPage();
    const reopenedPage = await browser.newPage();
    await Promise.all([
      cancelledPage.goto(cancelledUrl, { waitUntil: "domcontentloaded" }),
      reopenedPage.goto(reopenedUrl, { waitUntil: "domcontentloaded" }),
    ]);
    await captureEditableContext(cancelledPage, "#facebook-comment");
    await captureEditableContext(reopenedPage, "#rich-text-editor");

    const cancelledTab = await tabFor(cancelledUrl);
    const reopenedTab = await tabFor(reopenedUrl);
    const cancelledRequestId = "cancelled-picker";
    const cancelledPicker = await openPicker(cancelledTab, cancelledRequestId);
    await extensionPage.evaluate((windowId) => chrome.windows.remove(windowId), cancelledPicker.windowId);
    await waitFor(async () => !(await readPickerContext()), "closing a picker did not clear its request context");

    const reopenedRequestId = "reopened-picker";
    await setPickerContext(reopenedTab, reopenedRequestId);
    const stalePicker = await openPicker(cancelledTab, cancelledRequestId, { persistContext: false });
    assert.equal(
      await chooseSmokeLink(stalePicker.pickerPage),
      "Copied — press Ctrl+V to paste",
      "a stale picker must be rejected instead of writing to the current tab",
    );
    assert.equal(
      await reopenedPage.$eval("#rich-text-editor", (element, url) => element.textContent?.includes(url), linkUrl),
      false,
      "a stale picker wrote to the tab belonging to a newer picker request",
    );
    const contextAfterStaleRequest = await readPickerContext();
    assert.equal(contextAfterStaleRequest?.pickerRequestId, reopenedRequestId);

    const reopenedPicker = await openPicker(reopenedTab, reopenedRequestId);
    assert.equal(await chooseSmokeLink(reopenedPicker.pickerPage), "Link pasted");
    await reopenedPage.waitForFunction((url) => document.querySelector("#rich-text-editor")?.textContent?.includes(url), {}, linkUrl);

    const colorUrl = `${fixture.baseUrl}/color`;
    const colorPage = await browser.newPage();
    await colorPage.goto(colorUrl, { waitUntil: "domcontentloaded" });
    const colorTab = await tabFor(colorUrl);
    await extensionPage.evaluate(async (tabId) => {
      const tab = await chrome.tabs.get(tabId);
      await chrome.tabs.update(tabId, { active: true });
      await chrome.windows.update(tab.windowId, { focused: true });
      await new Promise(resolve => setTimeout(resolve, 100));
      const screenshot = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
      await chrome.scripting.executeScript({ target: { tabId }, files: ["color-picker.js"] });
      await chrome.tabs.sendMessage(tabId, { action: "startFiaColorPicker", screenshot });
    }, colorTab.id);
    await colorPage.waitForSelector("#__fia_color_picker__");
    await colorPage.mouse.move(220, 250);
    await colorPage.waitForFunction(
      () => document.querySelector(".fia-color-picker-hex")?.textContent === "#123456",
    );
    await colorPage.mouse.click(220, 250);
    await colorPage.waitForFunction(
      () => {
        const toast = document.querySelector(".fia-color-picker-toast");
        return toast?.textContent === "Color saved to clipboard"
          && toast.classList.contains("success");
      },
    );

    console.log("✓ Link Vault packaged-extension smoke test passed");
    console.log("  - Facebook-shaped contenteditable insertion");
    console.log("  - generic rich-text editor insertion");
    console.log("  - copied/manual-paste fallback");
    console.log("  - cancel/reopen and stale-picker tab isolation");
    console.log("  - magnified color picker hex sampling and clipboard copy");
  } finally {
    await browser?.close();
    if (fixture?.server) {
      await new Promise((resolve) => fixture.server.close(resolve));
    }
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});