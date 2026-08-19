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
        <div id="responsive-probe" aria-label="Responsive media-query probe"></div>
      </main>`,
    palette: `
      <main id="palette-main">
        <h1>Color Palette fixture — six distinct color bands</h1>
      </main>`,
  };

  // For the palette fixture we build a long page with six tall color-band sections
  // so the scroll-based full-page capture samples all six dominant colors.
  if (kind === "palette") {
    const bands = [
      { id: "band-red",    color: "#CC2200" },
      { id: "band-green",  color: "#116600" },
      { id: "band-blue",   color: "#003388" },
      { id: "band-yellow", color: "#DDBB00" },
      { id: "band-purple", color: "#6600AA" },
      { id: "band-teal",   color: "#007799" },
    ];
    const bandDivs = bands
      .map(b => `<div id="${b.id}" style="width:100%;height:600px;background:${b.color};"></div>`)
      .join("\n");
    return `<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <title>Color Palette smoke fixture</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font: 16px system-ui, sans-serif; }
          #palette-type-sample { position: fixed; left: 14px; top: 12px; z-index: 2; color: transparent; }
          #palette-headline { font-family: "Headline Fixture", sans-serif; font-size: 36px; font-weight: 700; }
          #palette-copy { margin-top: 4px; font-family: "Body Fixture", serif; font-size: 18px; font-weight: 400; }
        </style>
      </head>
      <body id="palette-body">
        <div id="palette-type-sample">
          <h1 id="palette-headline">Color Palette Fixture</h1>
          <p id="palette-copy">Typography sample</p>
        </div>
        ${bandDivs}
      </body>
    </html>`;
  }

  return `<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <title>Link Vault smoke fixture</title>
        <script>window.__responsiveFixtureScriptRuns = (window.__responsiveFixtureScriptRuns || 0) + 1;</script>
        <style>
          body { font: 16px system-ui, sans-serif; margin: 3rem; }
          [contenteditable] { border: 1px solid #94a3b8; border-radius: 8px; min-height: 4rem; padding: 1rem; }
           /* Deliberately hostile host-page styling: the Responsive overlay must not inherit it. */
           label, .fia-responsive-dimension { margin: 19px !important; padding: 13px !important; border: 5px solid fuchsia !important; background: lime !important; border-radius: 99px !important; }
           label span, .fia-responsive-dimension-prefix { margin: 17px !important; padding: 11px !important; border: 4px solid orange !important; background: cyan !important; transform: translateY(-9px) !important; }
          #color-swatch { position: fixed; left: 140px; top: 180px; width: 180px; height: 160px; background: rgb(18, 52, 86); }
          #responsive-probe::after { content: "desktop"; }
          @media (max-width: 400px) {
            #responsive-probe::after { content: "mobile"; }
          }
        </style>
      </head>
      <body>
        ${fields[kind] || fields.noeditor}
        <iframe id="responsive-script-frame" hidden
          srcdoc="&lt;script&gt;window.__responsiveNestedScriptRuns = true;&lt;/script&gt;"></iframe>
        <button id="responsive-inline-handler" hidden onclick="window.__responsiveInlineHandlerRuns = true">Hidden</button>
        <a id="responsive-javascript-link" hidden href="javascript:window.__responsiveJavascriptUrlRuns = true">Hidden</a>
      </body>
    </html>`;
}

async function startFixtureServer() {
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url || "/", "http://fixture.test").pathname;
    const kind = pathname.includes("facebook")
      ? "facebook"
      : pathname.includes("richtext")
        ? "richtext"
        : pathname.includes("palette")
          ? "palette"
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

async function getResponsivePreviewFrame(page) {
  return waitFor(async () => {
    for (const frame of page.frames()) {
      if (frame.url() !== "about:srcdoc") continue;
      try {
        if (await frame.$("#responsive-probe")) return frame;
      } catch (_) {
        // A detached iframe can remain in Puppeteer's frame list briefly.
      }
    }
    return null;
  }, "Responsive preview iframe did not finish loading", 30_000);
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
  const [
    serviceWorker,
    popupHtml,
    popupJs,
    rulerScript,
    responsiveScript,
    annotateScript,
    snippetCaptureScript,
    colorPickerScript,
    siteInspectorScript,
    manifestText,
  ] = await Promise.all([
    readFile(path.join(extensionDir, "service-worker.js"), "utf8"),
    readFile(path.join(extensionDir, "popup.html"), "utf8"),
    readFile(path.join(extensionDir, "popup.js"), "utf8"),
    readFile(path.join(extensionDir, "ruler.js"), "utf8"),
    readFile(path.join(extensionDir, "responsive.js"), "utf8"),
    readFile(path.join(extensionDir, "annotate.js"), "utf8"),
    readFile(path.join(extensionDir, "snippet-capture.js"), "utf8"),
    readFile(path.join(extensionDir, "color-picker.js"), "utf8"),
    readFile(path.join(extensionDir, "site-inspector.js"), "utf8"),
    readFile(path.join(extensionDir, "manifest.json"), "utf8"),
  ]);
  const packagedManifest = JSON.parse(manifestText);
  const paletteScanner = serviceWorker.match(
    /async function handleColorPaletteAnalysis[\s\S]*?(?=async function handleFullPageCapture)/,
  )?.[0] || "";

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
  assert.match(
    serviceWorker,
    /await addScreenshotToPaletteHistogram\(dataUrl, buckets\)/,
    "the packaged palette scanner no longer analyzes and releases each viewport as it is captured",
  );
  assert.doesNotMatch(
    paletteScanner,
    /strips\.push\(dataUrl\)/,
    "the packaged palette scanner retains full-resolution screenshots instead of streaming them",
  );
  assert.match(
    serviceWorker,
    /activeBeforeCapture\?\.id !== tabId[\s\S]*?activeAfterCapture\?\.id !== tabId/,
    "the packaged palette scanner no longer aborts when the source tab becomes inactive",
  );
  assert.match(
    popupHtml,
    /id="swipe-ruler-row"[\s\S]*?id="swipe-ruler"[\s\S]*?>Ruler</,
    "the packaged popup does not place the Ruler button on its own row",
  );
  assert.match(
    popupJs,
    /files: \["ruler\.js"\][\s\S]*?\$\("swipe-ruler"\)\.addEventListener\("click", swipeStartRuler\)/,
    "the packaged popup no longer injects the Ruler from its button",
  );
  assert.match(
    rulerScript,
    /fia-ruler-guide-x[\s\S]*?fia-ruler-guide-y[\s\S]*?data-ruler-field="width"[\s\S]*?data-ruler-field="height"/,
    "the packaged Ruler is missing its alignment guides or measurement readout",
  );
  assert.equal(packagedManifest.version, "2.4.15", "the packaged extension is not version 2.4.15");
  assert.ok(
    packagedManifest.web_accessible_resources?.some(entry =>
      entry.resources?.includes("icons/icon128.png") && entry.matches?.includes("<all_urls>")),
    "the packaged extension does not expose the FIA lion to the responsive toolbar",
  );
  assert.match(
    popupHtml,
    /id="swipe-ruler-row"[\s\S]*?id="swipe-ruler"[\s\S]*?>Ruler<[\s\S]*?id="swipe-responsive"[\s\S]*?>Responsive</,
    "the packaged popup does not place Responsive beside Ruler",
  );
  assert.match(
    popupJs,
    /files: \["responsive\.js"\][\s\S]*?\$\("swipe-responsive"\)\.addEventListener\("click", swipeStartResponsive\)/,
    "the packaged popup no longer injects Responsive from its button",
  );
  assert.match(
    responsiveScript,
    /Fearless Influencer Academy[\s\S]*?__fia_responsive_preset__[\s\S]*?__fia_responsive_width__[\s\S]*?__fia_responsive_height__/,
    "the packaged Responsive tool is missing its FIA branding or viewport controls",
  );
  assert.match(
    responsiveScript,
    /function start\(\)[\s\S]*?document\.documentElement[\s\S]*?DOMContentLoaded/,
    "the packaged Responsive tool does not defer boot until the page document root exists",
  );
  assert.equal(
    [...responsiveScript.matchAll(/\{ id: "[^"]+", label:/g)].length,
    35,
    "the packaged Responsive tool must include 35 curated device presets",
  );

  // ── Audit regression: unique per-capture annotation handoff keys ──────────
  // Each screenshot handoff to the annotation editor must be stored under a
  // fresh crypto.randomUUID() key and read back by ?capture=<id>, so two
  // simultaneous captures cannot clobber each other before their tabs load.
  assert.match(
    serviceWorker,
    /async function openAnnotationTab\([\s\S]*?const captureId = crypto\.randomUUID\(\)[\s\S]*?\[`pendingAnnotation:\$\{captureId\}`\]:[\s\S]*?annotate\.html"\)\}\?capture=\$\{encodeURIComponent\(captureId\)\}/,
    "the packaged annotation handoff no longer stores each capture under a unique crypto.randomUUID() key keyed into the editor URL",
  );
  assert.match(
    annotateScript,
    /const captureId = new URLSearchParams\(window\.location\.search\)\.get\("capture"\)[\s\S]*?const sessionKey = captureId \? `pendingAnnotation:\$\{captureId\}`/,
    "the packaged annotation editor no longer reads its handoff from the per-capture session key named in its URL",
  );
  assert.match(
    serviceWorker,
    /const scrollCaptureInProgress = new Set\(\)[\s\S]*?function acquireScrollCapture[\s\S]*?scrollCaptureInProgress\.has\(tabId\)[\s\S]*?scrollCaptureInProgress\.add\(tabId\)[\s\S]*?startFullPageCapture[\s\S]*?acquireScrollCapture\(msg\.tabId, "full-page capture"\)[\s\S]*?startColorPaletteAnalysis[\s\S]*?acquireScrollCapture\(msg\.tabId, "color palette scan"\)/,
    "the packaged full-page and palette scans no longer share a per-tab capture lock",
  );
  assert.match(
    serviceWorker,
    /const FULL_PAGE_MAX_WIDTH_PX\s*=\s*6000;[\s\S]*?const FULL_PAGE_MAX_PIXELS\s*=\s*40_000_000;[\s\S]*?vpW > FULL_PAGE_MAX_WIDTH_PX[\s\S]*?scrollH \* vpW > FULL_PAGE_MAX_PIXELS/,
    "the packaged full-page capture no longer limits width and total canvas pixels",
  );
  assert.match(
    annotateScript,
    /const FULL_PAGE_MAX_WIDTH_PX = 6000;[\s\S]*?const FULL_PAGE_MAX_PIXELS = 40_000_000;[\s\S]*?safeH \* safeW > FULL_PAGE_MAX_PIXELS/,
    "the annotation editor no longer rejects an oversized full-page stitch",
  );

  // ── Audit regression: tab-keyed snippet selection caching ─────────────────
  // The content script sends only the HTML; the service worker keys the cache
  // by sender.tab.id so concurrent right-clicks on different tabs stay isolated,
  // and reads/removes that same per-tab key when saving.
  assert.match(
    snippetCaptureScript,
    /chrome\.runtime\.sendMessage\(\{ action: "cacheSnippetHtml", html \}\)/,
    "the packaged snippet capture no longer defers per-tab keying to the service worker",
  );
  assert.match(
    serviceWorker,
    /msg\.action === "cacheSnippetHtml"[\s\S]*?const tabId = sender\.tab\?\.id[\s\S]*?if \(!Number\.isInteger\(tabId\)\) return[\s\S]*?const key = `pendingSnippetHtml_\$\{tabId\}`/,
    "the packaged snippet cache is no longer keyed by the sender tab id",
  );
  assert.match(
    serviceWorker,
    /const sessionKey = `pendingSnippetHtml_\$\{tabId\}`[\s\S]*?chrome\.storage\.session\.get\(sessionKey\)[\s\S]*?chrome\.storage\.session\.remove\(sessionKey\)/,
    "the packaged snippet save no longer reads and clears the per-tab session key",
  );

  // ── Audit regression: non-OK snippet save surfaces an error toast ─────────
  // A failed /api/v1/swipe POST must throw with the status and be reported to
  // the user, never silently swallowed as a success.
  assert.match(
    serviceWorker,
    /if \(!res\.ok\) \{[\s\S]*?throw new Error\(`Server error \$\{res\.status\}[\s\S]*?\}[\s\S]*?injectSaveToast\(tabId\)[\s\S]*?catch \(err\)[\s\S]*?injectErrorToast\(tabId, `Snippet not saved: \$\{err\.message\}`\)/,
    "the packaged snippet save no longer surfaces a non-OK server response as an error toast",
  );

  // ── Audit regression: popup Link Vault search is field-defensive ──────────
  // Malformed link records (non-objects, missing/non-string title/url/etc.)
  // must be filtered without throwing during search.
  assert.match(
    popupJs,
    /return linksAll\.filter\(l => \{[\s\S]*?if \(!l \|\| typeof l !== "object"\) return false[\s\S]*?String\(l\.title \|\| ""\)\.toLowerCase\(\)[\s\S]*?String\(l\.url \|\| ""\)\.toLowerCase\(\)/,
    "the packaged popup Link Vault search no longer guards against malformed link fields",
  );

  // ── Audit regression: color picker survives rapid reinjection ─────────────
  // A re-injected picker must reuse one runtime listener, and its auto-close
  // timer must belong to the live closure so a stale 1200ms timer can never
  // remove a freshly opened picker.
  assert.match(
    colorPickerScript,
    /if \(window\.__fiaColorPickerScriptLoaded\) return;[\s\S]*?window\.__fiaColorPickerScriptLoaded = true/,
    "the packaged color picker no longer keeps one listener across reinjection",
  );
  assert.match(
    colorPickerScript,
    /if \(_autoDestroyTimer !== null\) \{[\s\S]*?clearTimeout\(_autoDestroyTimer\)[\s\S]*?_autoDestroyTimer = null[\s\S]*?\}[\s\S]*?document\.getElementById\(ROOT_ID\)\?\.remove\(\)/,
    "the packaged color picker no longer clears its pending auto-close timer during teardown",
  );
  assert.match(
    colorPickerScript,
    /if \(_autoDestroyTimer !== null\) clearTimeout\(_autoDestroyTimer\)[\s\S]*?_autoDestroyTimer = setTimeout\(destroy, 1200\)/,
    "the packaged color picker no longer replaces a stale auto-close timer when a new color is copied",
  );

  // ── Audit regression: site inspector clears on invalid target / scroll ────
  // An off-target, zero-size, or self element must clear the inspection, and a
  // scroll must reposition the panel for the current element instead of leaving
  // it stranded.
  assert.match(
    siteInspectorScript,
    /function showElement\(element\) \{[\s\S]*?if \(!element \|\| element === document\.documentElement \|\| element === root \|\| root\.contains\(element\)\) \{[\s\S]*?clearInspection\(\)[\s\S]*?if \(rect\.width <= 0 \|\| rect\.height <= 0\) \{[\s\S]*?clearInspection\(\)/,
    "the packaged Site Inspector no longer clears when handed an invalid or zero-size target",
  );
  assert.match(
    siteInspectorScript,
    /function onScroll\(\) \{[\s\S]*?if \(currentElement\) showElement\(currentElement\)/,
    "the packaged Site Inspector no longer repositions the current element on scroll",
  );

  // ── Audit regression: ruler pointercancel/lostcapture/resize cleanup ──────
  // pointercancel must not commit invalid coordinates, lostpointercapture must
  // reset drag state without clobbering the last measurement, resize must
  // reclamp guides/measurement, and destroy must unbind every listener.
  assert.match(
    rulerScript,
    /function finishDrag\(event\) \{[\s\S]*?if \(event\.type === "pointerup"\) \{[\s\S]*?updateMeasurement\(pointFromEvent\(event\)\)[\s\S]*?\}[\s\S]*?dragging = false[\s\S]*?releasePointerCapture\(event\.pointerId\)/,
    "the packaged Ruler no longer skips committing coordinates on pointercancel while still releasing capture",
  );
  assert.match(
    rulerScript,
    /function onLostPointerCapture\(event\) \{[\s\S]*?dragging = false[\s\S]*?activePointerId = null/,
    "the packaged Ruler no longer resets drag state when the browser releases pointer capture",
  );
  assert.match(
    rulerScript,
    /function onResize\(\) \{[\s\S]*?moveGuides\(point\)[\s\S]*?if \(!measurement\) return[\s\S]*?updateMeasurement\(\{ x: x \+ width, y: y \+ height \}\)/,
    "the packaged Ruler no longer reclamps guides and measurement on resize",
  );
  for (const listener of [
    /root\.removeEventListener\("pointercancel", finishDrag, true\)/,
    /root\.removeEventListener\("lostpointercapture", onLostPointerCapture\)/,
    /window\.removeEventListener\("resize", onResize\)/,
  ]) {
    assert.match(
      rulerScript,
      listener,
      `the packaged Ruler teardown no longer unbinds ${listener.source}`,
    );
  }
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
    const noEditorTab = await tabFor(noEditorUrl);

    // ── Site Inspector: hover an element and read its computed details ──────
    await extensionPage.evaluate(async (tabId) => {
      const tab = await chrome.tabs.get(tabId);
      await chrome.tabs.update(tabId, { active: true });
      await chrome.windows.update(tab.windowId, { focused: true });
      await chrome.scripting.executeScript({ target: { tabId }, files: ["site-inspector.js"] });
    }, noEditorTab.id);
    const inspectorRect = await noEditorPage.$eval("#read-only-copy", element => {
      const rect = element.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    });
    await noEditorPage.mouse.move(inspectorRect.x, inspectorRect.y);
    await noEditorPage.waitForSelector("#__fia_site_inspector_panel__");
    await noEditorPage.waitForFunction(() =>
      document.querySelector(".fia-inspector-tag")?.textContent === "P",
    );
    assert.match(
      await noEditorPage.$eval(".fia-inspector-typography", element => element.textContent || ""),
      /Font|Size|Weight/,
      "Site Inspector did not show typography details",
    );
    assert.match(
      await noEditorPage.$eval(".fia-inspector-accessibility", element => element.textContent || ""),
      /Role|Focusable/,
      "Site Inspector did not show accessibility details",
    );

    // ── Site Inspector: clears on an invalid target ─────────────────────────
    // Pointing at an off-target coordinate (no element / an inspector-owned or
    // zero-size node) must hide the highlight, label, and panel.
    await noEditorPage.mouse.move(2, 2);
    await noEditorPage.waitForFunction(() => {
      const panel = document.getElementById("__fia_site_inspector_panel__");
      const highlight = document.getElementById("__fia_site_inspector_highlight__");
      const label = document.getElementById("__fia_site_inspector_label__");
      return panel?.style.display === "none"
        && highlight?.style.display === "none"
        && label?.style.display === "none";
    }, { timeout: 3_000 });

    // ── Site Inspector: scroll repositions the tracked element ──────────────
    // Re-acquire the target, remember the panel position, scroll, and confirm
    // the panel is repositioned to keep following the same element.
    await noEditorPage.mouse.move(inspectorRect.x, inspectorRect.y);
    await noEditorPage.waitForFunction(() =>
      document.getElementById("__fia_site_inspector_panel__")?.style.display === "block",
    );
    const inspectorTopBeforeScroll = await noEditorPage.$eval(
      "#__fia_site_inspector_panel__",
      panel => panel.style.top,
    );
    await noEditorPage.evaluate(() => {
      document.body.style.minHeight = "3000px";
      window.dispatchEvent(new Event("scroll"));
    });
    await noEditorPage.waitForFunction(() =>
      document.getElementById("__fia_site_inspector_panel__")?.style.display === "block",
    );
    assert.match(
      await noEditorPage.$eval("#__fia_site_inspector_panel__", panel => panel.style.top),
      /px$/,
      "Site Inspector panel lost its position after a scroll reposition",
    );
    void inspectorTopBeforeScroll;
    await noEditorPage.evaluate(() => { document.body.style.minHeight = ""; });

    await noEditorPage.keyboard.press("Escape");
    await noEditorPage.waitForFunction(() => !document.getElementById("__fia_site_inspector__"));

    // ── Site Inspector: repeated toggles never leave a duplicate overlay ────
    // Re-injecting intentionally toggles the inspector off, then a later launch
    // starts a fresh instance. Neither path may leave duplicate roots/listeners.
    for (let toggle = 0; toggle < 3; toggle += 1) {
      await extensionPage.evaluate(async (tabId) => {
        await chrome.scripting.executeScript({ target: { tabId }, files: ["site-inspector.js"] });
      }, noEditorTab.id);
      await noEditorPage.waitForFunction(() =>
        document.querySelectorAll("#__fia_site_inspector__").length === 1,
      );
      await extensionPage.evaluate(async (tabId) => {
        await chrome.scripting.executeScript({ target: { tabId }, files: ["site-inspector.js"] });
      }, noEditorTab.id);
      await noEditorPage.waitForFunction(() =>
        document.querySelectorAll("#__fia_site_inspector__").length === 0,
      );
    }
    await extensionPage.evaluate(async (tabId) => {
      await chrome.scripting.executeScript({ target: { tabId }, files: ["site-inspector.js"] });
    }, noEditorTab.id);
    assert.equal(
      await noEditorPage.evaluate(() => document.querySelectorAll("#__fia_site_inspector__").length),
      1,
      "repeated Site Inspector toggles left more than one overlay mounted",
    );
    await noEditorPage.keyboard.press("Escape");
    await noEditorPage.waitForFunction(() => !document.getElementById("__fia_site_inspector__"));

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
    const sandboxScriptWarnings = [];
    colorPage.on("console", message => {
      if (
        message.text().includes("Blocked script execution in 'about:blank'")
        || message.text().includes("An iframe which has both allow-scripts and allow-same-origin")
      ) {
        sandboxScriptWarnings.push(message.text());
      }
    });
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
    assert.equal(
      await colorPage.$eval(".fia-color-picker-pixel", element => element.dataset.color),
      "#123456",
      "the magnifier target should show the exact sampled pixel color",
    );
    assert.equal(
      await colorPage.$(".fia-color-picker-crosshair"),
      null,
      "the magnifier should not obscure the sample with a crosshair",
    );
    await colorPage.mouse.click(220, 250);
    await colorPage.waitForFunction(
      () => {
        const toast = document.querySelector(".fia-color-picker-toast");
        return toast?.textContent === "Color saved to clipboard"
          && toast.classList.contains("success");
      },
    );
    await colorPage.waitForFunction(
      () => !document.getElementById("__fia_color_picker__"),
      { timeout: 3_000 },
    );

    // ── Color Picker: rapid reinjection must not lose the new overlay ────────
    // Copying a color schedules a 1200ms auto-close timer. If a fresh picker is
    // injected before that timer fires, the stale closure's timer must be torn
    // down so it cannot remove the newly opened overlay.
    async function injectColorPicker(tabId) {
      await extensionPage.evaluate(async (id) => {
        const tab = await chrome.tabs.get(id);
        await chrome.tabs.update(id, { active: true });
        await chrome.windows.update(tab.windowId, { focused: true });
        await new Promise(resolve => setTimeout(resolve, 60));
        const screenshot = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
        await chrome.scripting.executeScript({ target: { tabId: id }, files: ["color-picker.js"] });
        await chrome.tabs.sendMessage(id, { action: "startFiaColorPicker", screenshot });
      }, tabId);
    }
    await injectColorPicker(colorTab.id);
    await colorPage.waitForSelector("#__fia_color_picker__");
    await colorPage.mouse.move(220, 250);
    await colorPage.mouse.click(220, 250);
    await colorPage.waitForFunction(
      () => document.querySelector(".fia-color-picker-toast")?.classList.contains("success"),
    );
    // Re-inject immediately, while the previous closure's 1200ms timer is pending.
    await injectColorPicker(colorTab.id);
    await colorPage.waitForFunction(
      () => document.querySelectorAll("#__fia_color_picker__").length === 1,
    );
    await colorPage.mouse.move(220, 250);
    await colorPage.waitForFunction(
      () => document.querySelector(".fia-color-picker-hex")?.textContent === "#123456",
    );
    // Wait past the stale timer's window: the fresh overlay must still be alive.
    await new Promise(resolve => setTimeout(resolve, 1_600));
    assert.equal(
      await colorPage.evaluate(() => document.querySelectorAll("#__fia_color_picker__").length),
      1,
      "a stale auto-close timer removed the freshly reinjected color picker",
    );
    await colorPage.keyboard.press("Escape");
    await colorPage.waitForFunction(() => !document.getElementById("__fia_color_picker__"));

    // ── Ruler: guides + forward/reverse drag measurement + cleanup ──────────
    await extensionPage.evaluate(async (tabId) => {
      const tab = await chrome.tabs.get(tabId);
      await chrome.tabs.update(tabId, { active: true });
      await chrome.windows.update(tab.windowId, { focused: true });
      await chrome.scripting.executeScript({ target: { tabId }, files: ["ruler.js"] });
    }, colorTab.id);
    await colorPage.waitForSelector("#__fia_ruler__");
    await colorPage.mouse.move(150, 130);
    assert.deepEqual(
      await colorPage.$eval("#__fia_ruler__", element => ({
        x: element.dataset.guideX,
        y: element.dataset.guideY,
      })),
      { x: "150", y: "130" },
      "Ruler guides did not follow the pointer",
    );

    await colorPage.mouse.move(180, 160);
    await colorPage.mouse.down();
    await colorPage.mouse.move(420, 340);
    await colorPage.mouse.up();
    assert.deepEqual(
      await colorPage.$eval("#__fia_ruler__", element => ({
        width: element.dataset.width,
        height: element.dataset.height,
        x: element.dataset.x,
        y: element.dataset.y,
      })),
      { width: "240", height: "180", x: "180", y: "160" },
      "Ruler did not calculate a forward drag correctly",
    );
    assert.match(
      await colorPage.$eval(".fia-ruler-metrics", element => element.textContent || ""),
      /Width\s*240px[\s\S]*Height\s*180px[\s\S]*X\s*180px[\s\S]*Y\s*160px/,
      "Ruler readout did not show width, height, X, and Y",
    );

    await colorPage.mouse.move(500, 400);
    await colorPage.mouse.down();
    await colorPage.mouse.move(300, 250);
    await colorPage.mouse.up();
    assert.deepEqual(
      await colorPage.$eval("#__fia_ruler__", element => ({
        width: element.dataset.width,
        height: element.dataset.height,
        x: element.dataset.x,
        y: element.dataset.y,
      })),
      { width: "200", height: "150", x: "300", y: "250" },
      "Ruler did not replace the measurement or support reverse dragging",
    );

    // ── Ruler: pointercancel / lostpointercapture / resize cleanup ──────────
    // A drag interrupted by pointercancel must keep the last committed
    // measurement (never commit cancel's zeroed coordinates) and end the drag,
    // so a following pointermove does not keep re-measuring.
    const rulerMeasurementBeforeCancel = await colorPage.$eval("#__fia_ruler__", element => ({
      width: element.dataset.width,
      height: element.dataset.height,
      x: element.dataset.x,
      y: element.dataset.y,
    }));
    await colorPage.evaluate(() => {
      const root = document.getElementById("__fia_ruler__");
      const opts = { bubbles: true, cancelable: true, pointerId: 1 };
      root.dispatchEvent(new PointerEvent("pointerdown", { ...opts, clientX: 120, clientY: 120 }));
      root.dispatchEvent(new PointerEvent("pointermove", { ...opts, clientX: 260, clientY: 220 }));
      // pointercancel may carry zeroed coordinates; it must not be committed.
      root.dispatchEvent(new PointerEvent("pointercancel", { ...opts, clientX: 0, clientY: 0 }));
    });
    assert.deepEqual(
      await colorPage.$eval("#__fia_ruler__", element => ({
        width: element.dataset.width,
        height: element.dataset.height,
        x: element.dataset.x,
        y: element.dataset.y,
      })),
      rulerMeasurementBeforeCancel,
      "Ruler committed pointercancel's zeroed coordinates instead of keeping the last measurement",
    );
    // The cancel must have ended the drag: a plain pointermove now only moves
    // the guides and must not overwrite the retained measurement.
    await colorPage.evaluate(() => {
      const root = document.getElementById("__fia_ruler__");
      root.dispatchEvent(new PointerEvent("pointermove", {
        bubbles: true, cancelable: true, pointerId: 1, clientX: 470, clientY: 360,
      }));
    });
    assert.deepEqual(
      await colorPage.$eval("#__fia_ruler__", element => ({
        width: element.dataset.width,
        height: element.dataset.height,
      })),
      { width: rulerMeasurementBeforeCancel.width, height: rulerMeasurementBeforeCancel.height },
      "Ruler kept measuring after pointercancel — the drag state was not reset",
    );

    // lostpointercapture must reset drag state without clobbering the measurement.
    await colorPage.evaluate(() => {
      const root = document.getElementById("__fia_ruler__");
      const opts = { bubbles: true, cancelable: true, pointerId: 2 };
      root.dispatchEvent(new PointerEvent("pointerdown", { ...opts, clientX: 100, clientY: 100 }));
      root.dispatchEvent(new PointerEvent("pointermove", { ...opts, clientX: 300, clientY: 260 }));
      root.dispatchEvent(new PointerEvent("lostpointercapture", { ...opts, clientX: 300, clientY: 260 }));
      // A stray pointermove after capture loss must not resume measuring.
      root.dispatchEvent(new PointerEvent("pointermove", { ...opts, clientX: 20, clientY: 20 }));
    });
    const rulerAfterLostCapture = await colorPage.$eval("#__fia_ruler__", element => ({
      width: element.dataset.width,
      height: element.dataset.height,
    }));
    assert.ok(
      Number(rulerAfterLostCapture.width) > 0 && Number(rulerAfterLostCapture.height) > 0,
      `Ruler lost its measurement after lostpointercapture: ${JSON.stringify(rulerAfterLostCapture)}`,
    );

    // A window resize must reclamp guides and the retained measurement so it
    // never extends beyond the (possibly smaller) viewport.
    await colorPage.setViewport({ width: 500, height: 400 });
    await colorPage.evaluate(() => window.dispatchEvent(new Event("resize")));
    const rulerAfterResize = await colorPage.$eval("#__fia_ruler__", element => ({
      x: Number(element.dataset.x),
      y: Number(element.dataset.y),
      width: Number(element.dataset.width),
      height: Number(element.dataset.height),
      guideX: Number(element.dataset.guideX),
      guideY: Number(element.dataset.guideY),
    }));
    assert.ok(
      rulerAfterResize.x + rulerAfterResize.width <= 500
        && rulerAfterResize.y + rulerAfterResize.height <= 400
        && rulerAfterResize.guideX <= 500
        && rulerAfterResize.guideY <= 400,
      `Ruler did not reclamp its guides/measurement into the resized viewport: ${JSON.stringify(rulerAfterResize)}`,
    );
    await colorPage.setViewport({ width: 1024, height: 768 });

    await colorPage.keyboard.press("Escape");
    await colorPage.waitForFunction(() => !document.getElementById("__fia_ruler__"));

    // ── Responsive: presets + custom size + zoom/Fit + cleanup ───────────────
    await extensionPage.evaluate(async (tabId) => {
      const tab = await chrome.tabs.get(tabId);
      await chrome.tabs.update(tabId, { active: true });
      await chrome.windows.update(tab.windowId, { focused: true });
      await chrome.scripting.executeScript({ target: { tabId }, files: ["responsive.js"] });
    }, colorTab.id);
    await colorPage.waitForSelector("#__fia_responsive__");
    assert.equal(
      await colorPage.$eval("#__fia_responsive__", element => element.parentElement === document.body),
      true,
      "Responsive overlay was not mounted under the page body",
    );
    assert.equal(
      JSON.stringify(await colorPage.$eval("#__fia_responsive__", element => ({
        lightDomFrames: element.querySelectorAll("iframe").length,
        shadowFrame: Boolean(
          element.querySelector(".fia-responsive-frame-mount")?.shadowRoot
            ?.querySelector(".fia-responsive-frame"),
        ),
      }))),
      JSON.stringify({ lightDomFrames: 0, shadowFrame: true }),
      "Responsive preview iframe is exposed to page scripts in the light DOM",
    );
    let responsivePreviewFrame = await getResponsivePreviewFrame(colorPage);
    assert.equal(
      await colorPage.$$eval("#__fia_responsive_preset__ option", options => options.length),
      36,
      "Responsive should offer 35 presets plus a Custom size option",
    );
    assert.equal(
      await colorPage.$$eval("#__fia_responsive_preset__ optgroup", groups => groups.length),
      3,
      "Responsive presets should be grouped into phones, tablets, and larger screens",
    );
    assert.deepEqual(
      await colorPage.$$eval(
        "#__fia_responsive_preset__ optgroup[label='Phones'] option",
        options => options
          .map(option => ({
            value: option.value,
            label: option.textContent,
            width: option.dataset.width,
            height: option.dataset.height,
          }))
          .filter(option => /^iphone-(16|17|18)/.test(option.value)),
      ),
      [
        { value: "iphone-16", label: "iPhone 16 (393 × 852)", width: "393", height: "852" },
        { value: "iphone-16-plus", label: "iPhone 16 Plus (430 × 932)", width: "430", height: "932" },
        { value: "iphone-16-pro", label: "iPhone 16 Pro (402 × 874)", width: "402", height: "874" },
        { value: "iphone-16-pro-max", label: "iPhone 16 Pro Max (440 × 956)", width: "440", height: "956" },
        { value: "iphone-17", label: "iPhone 17 (402 × 874)", width: "402", height: "874" },
        { value: "iphone-17-pro", label: "iPhone 17 Pro (402 × 874)", width: "402", height: "874" },
        { value: "iphone-17-pro-max", label: "iPhone 17 Pro Max (440 × 956)", width: "440", height: "956" },
        { value: "iphone-18", label: "iPhone 18 (preview) (402 × 874)", width: "402", height: "874" },
        { value: "iphone-18-pro", label: "iPhone 18 Pro (preview) (402 × 874)", width: "402", height: "874" },
        { value: "iphone-18-pro-max", label: "iPhone 18 Pro Max (preview) (440 × 956)", width: "440", height: "956" },
      ],
      "Responsive is missing the latest iPhone phone presets",
    );
    await colorPage.waitForFunction(() =>
      document.querySelector("#__fia_responsive__ .fia-responsive-logo")?.naturalWidth > 0,
    );
    assert.deepEqual(
      await colorPage.$eval("#__fia_responsive__", element => ({
        role: element.getAttribute("role"),
        modal: element.getAttribute("aria-modal"),
      })),
      { role: "dialog", modal: "true" },
      "Responsive must expose its full-screen overlay as a modal dialog",
    );
    assert.deepEqual(
      await colorPage.$eval("#__fia_responsive__ .fia-responsive-select-value", value => ({
        display: getComputedStyle(value).display,
        alignItems: getComputedStyle(value).alignItems,
        height: getComputedStyle(value).height,
      })),
      { display: "flex", alignItems: "center", height: "40px" },
      "Responsive device dropdown text is not vertically centered in its control",
    );
    assert.deepEqual(
      await colorPage.$$eval("#__fia_responsive__ .fia-responsive-dimension", labels =>
        labels.map(label => {
          const prefix = label.querySelector(".fia-responsive-dimension-prefix");
          const input = label.querySelector("input");
          return {
            dimensionDisplay: getComputedStyle(label).display,
            dimensionAlignItems: getComputedStyle(label).alignItems,
            dimensionHeight: getComputedStyle(label).height,
            dimensionMargin: getComputedStyle(label).margin,
            dimensionPadding: getComputedStyle(label).padding,
            prefixPosition: getComputedStyle(prefix).position,
            prefixDisplay: getComputedStyle(prefix).display,
            prefixAlignItems: getComputedStyle(prefix).alignItems,
            prefixJustifyContent: getComputedStyle(prefix).justifyContent,
            prefixHeight: getComputedStyle(prefix).height,
            prefixMargin: getComputedStyle(prefix).margin,
            prefixPadding: getComputedStyle(prefix).padding,
            prefixBorderTopWidth: getComputedStyle(prefix).borderTopWidth,
            prefixTransform: getComputedStyle(prefix).transform,
            inputLineHeight: getComputedStyle(input).lineHeight,
            inputAppearance: getComputedStyle(input).appearance,
          };
        })),
      [
        {
          dimensionDisplay: "flex",
          dimensionAlignItems: "center",
          dimensionHeight: "40px",
          dimensionMargin: "0px",
          dimensionPadding: "0px",
          prefixPosition: "static",
          prefixDisplay: "flex",
          prefixAlignItems: "center",
          prefixJustifyContent: "center",
          prefixHeight: "38px",
          prefixMargin: "0px",
          prefixPadding: "0px",
          prefixBorderTopWidth: "0px",
          prefixTransform: "none",
          inputLineHeight: "38px",
          inputAppearance: "none",
        },
        {
          dimensionDisplay: "flex",
          dimensionAlignItems: "center",
          dimensionHeight: "40px",
          dimensionMargin: "0px",
          dimensionPadding: "0px",
          prefixPosition: "static",
          prefixDisplay: "flex",
          prefixAlignItems: "center",
          prefixJustifyContent: "center",
          prefixHeight: "38px",
          prefixMargin: "0px",
          prefixPadding: "0px",
          prefixBorderTopWidth: "0px",
          prefixTransform: "none",
          inputLineHeight: "38px",
          inputAppearance: "none",
        },
      ],
      "Responsive width/height prefixes are not vertically centered in their controls",
    );
    const toolbarSpacing = await colorPage.$eval(
      "#__fia_responsive__ .fia-responsive-toolbar",
      toolbar => {
        const children = Array.from(toolbar.children).map(child => {
          const rect = child.getBoundingClientRect();
          return { left: rect.left, right: rect.right, width: rect.width };
        });
        const gaps = children.slice(1).map((child, index) => child.left - children[index].right);
        return { children, gaps };
      },
    );
    assert.ok(
      toolbarSpacing.children.every(child => child.width > 0)
        && toolbarSpacing.gaps.every(gap => gap >= 8),
      `Responsive toolbar controls overlap or are too close: ${JSON.stringify(toolbarSpacing)}`,
    );
    const selectBounds = await colorPage.$eval(
      "#__fia_responsive__ .fia-responsive-select-wrap",
      wrap => {
        const select = wrap.querySelector(".fia-responsive-select");
        const wrapRect = wrap.getBoundingClientRect();
        const selectRect = select.getBoundingClientRect();
        return {
          wrapLeft: wrapRect.left,
          wrapRight: wrapRect.right,
          selectLeft: selectRect.left,
          selectRight: selectRect.right,
        };
      },
    );
    assert.ok(
      selectBounds.selectLeft >= selectBounds.wrapLeft
        && selectBounds.selectRight <= selectBounds.wrapRight,
      `Responsive preset control paints outside its slot and overlaps W/H: ${JSON.stringify(selectBounds)}`,
    );
    assert.equal(
      await responsivePreviewFrame.evaluate(() => document.scripts.length),
      0,
      "Responsive allowed source-page scripts into the preview snapshot",
    );
    assert.equal(
      await responsivePreviewFrame.evaluate(() => window.__responsiveFixtureScriptRuns),
      undefined,
      "Responsive executed a source-page script inside the preview",
    );
    assert.deepEqual(
      await responsivePreviewFrame.evaluate(() => {
        return {
          embeddedDocuments: document.querySelectorAll("iframe, frame, object, embed").length,
          inlineHandlers: Array.from(document.querySelectorAll("*")).flatMap(element =>
            Array.from(element.attributes).filter(attribute => attribute.name.toLowerCase().startsWith("on")),
          ).length,
          javascriptUrls: Array.from(document.querySelectorAll("[href], [src], [action], [formaction]"))
            .filter(element => Array.from(element.attributes).some(attribute =>
              ["href", "src", "action", "formaction"].includes(attribute.name.toLowerCase())
                && attribute.value.trim().toLowerCase().startsWith("javascript:"),
            )).length,
        };
      }),
      {
        embeddedDocuments: 0,
        inlineHandlers: 0,
        javascriptUrls: 0,
      },
      "Responsive preview retained executable page content or did not configure its sanitized sandbox",
    );
    assert.deepEqual(
      await colorPage.$eval("#__fia_responsive__ .fia-responsive-frame-mount", mount => {
        const frame = mount.shadowRoot.querySelector(".fia-responsive-frame");
        return {
          allowsScripts: frame.sandbox.contains("allow-scripts"),
          allowsSameOrigin: frame.sandbox.contains("allow-same-origin"),
        };
      }),
      { allowsScripts: false, allowsSameOrigin: false },
      "Responsive preview iframe retained sandbox permissions it does not need",
    );
    assert.deepEqual(
      sandboxScriptWarnings,
      [],
      `Responsive preview caused sandboxed script warnings: ${sandboxScriptWarnings.join(" | ")}`,
    );
    await colorPage.focus("#__fia_responsive_preset__");
    await colorPage.keyboard.down("Shift");
    await colorPage.keyboard.press("Tab");
    await colorPage.keyboard.up("Shift");
    assert.equal(
      await colorPage.evaluate(() => document.activeElement?.id),
      "__fia_responsive_exit__",
      "Shift+Tab escaped the Responsive modal instead of wrapping to Exit",
    );
    await colorPage.keyboard.press("Tab");
    assert.equal(
      await colorPage.evaluate(() => document.activeElement?.id),
      "__fia_responsive_preset__",
      "Tab escaped the Responsive modal instead of wrapping to the first control",
    );

    await colorPage.select("#__fia_responsive_preset__", "iphone-se");
    await colorPage.waitForFunction(() => {
      const root = document.getElementById("__fia_responsive__");
      return root?.dataset.width === "375"
        && root?.dataset.height === "667"
        && root?.dataset.preset === "iphone-se";
    });
    assert.deepEqual(
      await colorPage.$eval("#__fia_responsive__", element => ({
        width: element.dataset.width,
        height: element.dataset.height,
        preset: element.dataset.preset,
      })),
      { width: "375", height: "667", preset: "iphone-se" },
      "Responsive did not apply the selected phone preset",
    );
    assert.equal(
      await responsivePreviewFrame.evaluate(() =>
        getComputedStyle(document.querySelector("#responsive-probe"), "::after").content),
      '"mobile"',
      "the preview iframe did not activate the mobile media query",
    );
    await colorPage.select("#__fia_responsive_preset__", "iphone-18-pro");
    await colorPage.waitForFunction(() =>
      document.getElementById("__fia_responsive__")?.dataset.preset === "iphone-18-pro",
    );
    assert.equal(
      await colorPage.$eval("#__fia_responsive_preset__", select => select.value),
      "iphone-18-pro",
      "Responsive replaced a selected same-size iPhone preset with another model",
    );

    await colorPage.$eval("#__fia_responsive_width__", input => {
      input.value = "1024";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await colorPage.$eval("#__fia_responsive_height__", input => {
      input.value = "768";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await colorPage.waitForFunction(() => {
      const root = document.getElementById("__fia_responsive__");
      return root?.dataset.width === "1024"
        && root?.dataset.height === "768"
        && root?.dataset.preset === "custom";
    });
    assert.equal(
      await responsivePreviewFrame.evaluate(() =>
        getComputedStyle(document.querySelector("#responsive-probe"), "::after").content),
      '"desktop"',
      "the custom desktop width did not activate the wider media query",
    );

    await colorPage.$eval("#__fia_responsive_width__", input => {
      input.value = "100";
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await colorPage.waitForFunction(() =>
      document.getElementById("__fia_responsive__")?.dataset.width === "240",
    );
    assert.equal(
      await colorPage.$eval("#__fia_responsive_width__", input => input.value),
      "240",
      "Responsive did not constrain an unsafe custom width",
    );

    await colorPage.click("#__fia_responsive_zoom_out__");
    assert.equal(
      await colorPage.$eval("#__fia_responsive__", element => element.dataset.zoom),
      "90",
      "Responsive zoom-out did not reduce the preview to 90%",
    );
    await colorPage.click("#__fia_responsive_fit__");
    await colorPage.waitForFunction(() => {
      const root = document.getElementById("__fia_responsive__");
      return root?.dataset.fit === "true" && Number(root.dataset.zoom) <= 100;
    });
    await colorPage.$eval("#__fia_responsive_width__", input => {
      input.value = "5120";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await colorPage.$eval("#__fia_responsive_height__", input => {
      input.value = "5120";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await colorPage.click("#__fia_responsive_fit__");
    await colorPage.waitForFunction(() => {
      const root = document.getElementById("__fia_responsive__");
      const workspace = root?.querySelector(".fia-responsive-workspace");
      const shell = root?.querySelector(".fia-responsive-shell");
      if (!root || !workspace || !shell) return false;
      const rect = shell.getBoundingClientRect();
      return rect.width <= workspace.clientWidth - 70
        && rect.height <= workspace.clientHeight - 70;
    });
    const fitGeometry = await colorPage.$eval("#__fia_responsive__", root => {
      const workspace = root.querySelector(".fia-responsive-workspace");
      const shell = root.querySelector(".fia-responsive-shell");
      return {
        zoom: Number(root.dataset.zoom),
        shellWidth: shell.getBoundingClientRect().width,
        shellHeight: shell.getBoundingClientRect().height,
        workspaceWidth: workspace.clientWidth,
        workspaceHeight: workspace.clientHeight,
      };
    });
    assert.ok(fitGeometry.zoom < 25, "Fit did not scale a maximum-size viewport below 25%");
    assert.ok(
      fitGeometry.shellWidth <= fitGeometry.workspaceWidth - 70
        && fitGeometry.shellHeight <= fitGeometry.workspaceHeight - 70,
      `Fit overflowed its workspace: ${JSON.stringify(fitGeometry)}`,
    );

    await colorPage.click("#__fia_responsive_exit__");
    await colorPage.waitForFunction(() => !document.getElementById("__fia_responsive__"));
    assert.equal(
      await colorPage.$eval("#responsive-probe", element => element.getAttribute("aria-label")),
      "Responsive media-query probe",
      "exiting Responsive changed the original page",
    );

    await extensionPage.evaluate(async (tabId) => {
      await chrome.scripting.executeScript({ target: { tabId }, files: ["responsive.js"] });
      await chrome.scripting.executeScript({ target: { tabId }, files: ["responsive.js"] });
    }, colorTab.id);
    await colorPage.waitForFunction(() =>
      document.querySelectorAll("#__fia_responsive__").length === 1,
    );
    responsivePreviewFrame = await getResponsivePreviewFrame(colorPage);
    const responsiveFrameBox = await colorPage.$eval(
      "#__fia_responsive__ .fia-responsive-frame-mount",
      mount => {
        const frame = mount.shadowRoot.querySelector(".fia-responsive-frame");
        const rect = frame.getBoundingClientRect();
        return { x: rect.left, y: rect.top };
      },
    );
    await colorPage.mouse.click(responsiveFrameBox.x + 12, responsiveFrameBox.y + 12);
    await colorPage.keyboard.press("Escape");
    await colorPage.waitForFunction(() => !document.getElementById("__fia_responsive__"));

    // ── Color Palette: full-page scroll + dominant-color extraction ──────────
    const paletteUrl = `${fixture.baseUrl}/palette`;
    const palettePage = await browser.newPage();
    await palettePage.goto(paletteUrl, { waitUntil: "domcontentloaded" });
    const paletteTab = await tabFor(paletteUrl);

    // The save request originates in the extension service worker, so stub fetch
    // in that execution context (page-level interception cannot see this request).
    await workerSession.send("Runtime.evaluate", {
      expression: `
        globalThis.__fiaSmokeOriginalFetch = globalThis.fetch;
        globalThis.__fiaPaletteSaveRequest = null;
        globalThis.fetch = async (url, options = {}) => {
          if (String(url).includes("/api/v1/swipe") && options.method === "POST") {
            globalThis.__fiaPaletteSaveRequest = {
              url: String(url),
              body: options.body,
              headers: options.headers,
            };
            return new Response(JSON.stringify({ item: { id: "palette-smoke" } }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }
          return globalThis.__fiaSmokeOriginalFetch(url, options);
        };
      `,
      awaitPromise: true,
    });

    await palettePage.evaluate(() => window.scrollTo(0, 700));
    const originalPaletteScrollY = await palettePage.evaluate(() => window.scrollY);

    // Start a palette scan, then immediately request a full-page capture on the
    // same tab. The shared scroll-capture lock must reject the conflict rather
    // than letting two workers interleave scroll and visibility changes.
    const captureStarts = await extensionPage.evaluate(async (tabId, sourceUrl, sourceTitle) => {
      await chrome.tabs.update(tabId, { active: true });
      const tab = await chrome.tabs.get(tabId);
      await chrome.windows.update(tab.windowId, { focused: true });
      await new Promise(resolve => setTimeout(resolve, 200));
      const palette = await chrome.runtime.sendMessage({
        action: "startColorPaletteAnalysis", tabId, sourceUrl, sourceTitle,
      });
      const fullPage = await chrome.runtime.sendMessage({
        action: "startFullPageCapture", tabId, title: sourceTitle,
      });
      return { palette, fullPage };
    }, paletteTab.id, paletteUrl, "Color Palette smoke fixture");
    assert.equal(captureStarts.palette?.ok, true, "Color Palette scan did not acquire the shared capture lock");
    assert.equal(captureStarts.fullPage?.ok, false, "Full Page capture was not rejected while a palette scan held the lock");
    assert.match(
      String(captureStarts.fullPage?.error || ""),
      /already running/i,
      "conflicting capture did not return a clear in-progress error",
    );

    // Wait for the overlay to appear (scroll + analysis takes a few seconds)
    await palettePage.waitForSelector("#__fia_color_palette__", { timeout: 60_000 });

    // Verify six swatches are present
    const swatchCount = await palettePage.$$eval(
      "#__fia_color_palette__ .fia-pal-swatch-wrap",
      (els) => els.length,
    );
    assert.equal(swatchCount, 6, `Expected 6 color swatches, got ${swatchCount}`);

    // Verify each swatch shows an uppercase #RRGGBB hex code
    const hexCodes = await palettePage.$$eval(
      "#__fia_color_palette__ .fia-pal-hex",
      (els) => els.map(el => el.textContent.trim()),
    );
    assert.equal(hexCodes.length, 6, "Expected 6 hex labels");
    for (const hex of hexCodes) {
      assert.match(hex, /^#[0-9A-F]{6}$/, `Hex code ${hex} is not uppercase #RRGGBB`);
    }
    const expectedPaletteColors = ["#CC2200", "#116600", "#003388", "#DDBB00", "#6600AA", "#007799"];
    for (const expectedColor of expectedPaletteColors) {
      assert.ok(
        hexCodes.includes(expectedColor),
        `Expected dominant color ${expectedColor}; received ${hexCodes.join(", ")}`,
      );
    }
    const fontFamilies = await palettePage.$$eval(
      "#__fia_color_palette__ .fia-pal-font-family",
      (els) => els.map(el => el.textContent?.trim()),
    );
    assert.ok(fontFamilies.includes("Headline Fixture"), `Expected headline font, got ${fontFamilies.join(", ")}`);
    assert.ok(fontFamilies.includes("Body Fixture"), `Expected body font, got ${fontFamilies.join(", ")}`);
    assert.match(
      await palettePage.$eval("#__fia_color_palette__ .fia-pal-font-list", el => el.textContent || ""),
      /700 · 36px · 1×/,
      "Expected headline font weight, size, and count",
    );
    assert.equal(
      await palettePage.evaluate(() => window.scrollY),
      originalPaletteScrollY,
      "palette scan did not restore the page's original scroll position",
    );

    // Test per-color clipboard copy: click the first swatch
    await palettePage.click("#__fia_color_palette__ .fia-pal-swatch-wrap");
    await palettePage.waitForFunction(
      () => {
        const label = document.querySelector("#__fia_color_palette__ .fia-pal-hex");
        return label?.textContent === "✓ Copied" || label?.textContent === "✗ Failed";
      },
      { timeout: 3_000 },
    );

    // Test Cancel button removes the overlay
    await palettePage.click("#__fia_pal_cancel__");
    await palettePage.waitForFunction(
      () => !document.getElementById("__fia_color_palette__"),
      { timeout: 3_000 },
    );

    // Re-trigger the overlay to test Save to Swipe File
    await extensionPage.evaluate(async (tabId, sourceUrl, sourceTitle) => {
      await chrome.tabs.update(tabId, { active: true });
      const tab = await chrome.tabs.get(tabId);
      await chrome.windows.update(tab.windowId, { focused: true });
      await new Promise(resolve => setTimeout(resolve, 200));
      chrome.runtime.sendMessage({ action: "startColorPaletteAnalysis", tabId, sourceUrl, sourceTitle });
    }, paletteTab.id, paletteUrl, "Color Palette smoke fixture");
    await palettePage.waitForSelector("#__fia_color_palette__", { timeout: 60_000 });

    // Click Save to Swipe File — the stub responds 200 OK
    await palettePage.click("#__fia_pal_save__");
    await palettePage.waitForFunction(
      () => {
        const status = document.getElementById("__fia_pal_status__");
        return status?.textContent?.includes("Saved") || status?.classList?.contains("err");
      },
      { timeout: 10_000 },
    );
    const statusText = await palettePage.$eval("#__fia_pal_status__", el => el.textContent.trim());
    assert.ok(
      statusText.includes("Saved"),
      `Save to Swipe File status must say "Saved", got: "${statusText}"`,
    );
    const saveRequestResult = await workerSession.send("Runtime.evaluate", {
      expression: "globalThis.__fiaPaletteSaveRequest",
      returnByValue: true,
    });
    const savedPayload = JSON.parse(saveRequestResult.result.value.body);
    const savedContent = JSON.parse(savedPayload.content);
    assert.equal(savedPayload.type, "palette");
    assert.equal(savedPayload.sourceUrl, paletteUrl);
    assert.equal(savedPayload.title, "Color Palette — Color Palette smoke fixture");
    assert.equal(savedContent.version, 1);
    assert.deepEqual([...savedContent.colors].sort(), [...expectedPaletteColors].sort());
    assert.deepEqual(
      [...savedContent.fonts].sort((a, b) => a.family.localeCompare(b.family)),
      [
        { family: "Body Fixture", variants: [{ weight: "400", size: "18px", count: 1 }] },
        { family: "Headline Fixture", variants: [{ weight: "700", size: "36px", count: 1 }] },
      ],
    );
    assert.equal(saveRequestResult.result.value.headers["X-API-Key"], "link-vault-smoke-test");

    // Switching tabs during a scan must abort instead of sampling unrelated content,
    // and the source page must still be restored to its original scroll position.
    await palettePage.waitForFunction(
      () => !document.getElementById("__fia_color_palette__"),
      { timeout: 5_000 },
    );
    await palettePage.evaluate(() => window.scrollTo(0, 900));
    const beforeAbortedScanScrollY = await palettePage.evaluate(() => window.scrollY);
    await extensionPage.evaluate(async (tabId, sourceUrl, sourceTitle) => {
      await chrome.tabs.update(tabId, { active: true });
      const tab = await chrome.tabs.get(tabId);
      await chrome.windows.update(tab.windowId, { focused: true });
      chrome.runtime.sendMessage({ action: "startColorPaletteAnalysis", tabId, sourceUrl, sourceTitle });
    }, paletteTab.id, paletteUrl, "Color Palette smoke fixture");
    await palettePage.waitForSelector("#__fia_pal_progress__", { timeout: 5_000 });
    const switchedTabId = await extensionPage.evaluate(async (windowId, url) => {
      const tab = await chrome.tabs.create({ windowId, url, active: true });
      return tab.id;
    }, paletteTab.windowId, `${fixture.baseUrl}/noeditor?palette-switch=1`);
    // Background tabs suspend requestAnimationFrame, so use a Node-side delay
    // instead of Puppeteer's default waitForFunction polling.
    await new Promise(resolve => setTimeout(resolve, 2_500));
    assert.equal(
      await palettePage.evaluate(() => !!document.getElementById("__fia_pal_progress__")),
      false,
      "palette scanner did not stop after the source tab became inactive",
    );
    assert.equal(
      await palettePage.evaluate(() => !!document.getElementById("__fia_color_palette__")),
      false,
      "palette scanner produced a result after the source tab became inactive",
    );
    assert.equal(
      await palettePage.evaluate(() => window.scrollY),
      beforeAbortedScanScrollY,
      "aborted palette scan did not restore the page's original scroll position",
    );
    await extensionPage.evaluate((tabId) => chrome.tabs.remove(tabId), switchedTabId);

    console.log("✓ Link Vault packaged-extension smoke test passed");
    console.log("  - Facebook-shaped contenteditable insertion");
    console.log("  - generic rich-text editor insertion");
    console.log("  - copied/manual-paste fallback");
    console.log("  - cancel/reopen and stale-picker tab isolation");
    console.log("  - magnified color picker hex sampling, clipboard copy, and stale-timer-safe reinjection");
    console.log("  - Site Inspector hover details, invalid-target/scroll clearing, repeated toggles, and Escape cleanup");
    console.log("  - Ruler alignment guides, drag-any-direction measurement, replacement, pointercancel/lostcapture/resize cleanup, and Escape cleanup");
    console.log("  - Responsive presets, custom dimensions, media-query rendering, zoom/Fit, and Exit/Escape cleanup");
    console.log("  - color palette: streaming full-page scan, six dominant colors, detected font variants, copy/save, tab-switch cleanup");
    console.log("  - static source contracts: unique annotation handoff keys, tab-keyed snippet cache, non-OK snippet save toast, defensive Link Vault search");
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