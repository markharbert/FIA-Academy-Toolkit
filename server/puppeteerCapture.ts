import puppeteer from "puppeteer-core";
import { execSync } from "child_process";

let cachedChromiumPath: string | null = null;

function getChromiumPath(): string {
  if (cachedChromiumPath) return cachedChromiumPath;
  if (process.env.CHROMIUM_PATH) {
    cachedChromiumPath = process.env.CHROMIUM_PATH;
    return cachedChromiumPath;
  }
  try {
    const found = execSync("which chromium 2>/dev/null || which chromium-browser 2>/dev/null")
      .toString()
      .trim();
    if (found) { cachedChromiumPath = found; return found; }
  } catch (_) {}
  throw new Error(
    "Chromium not found. Install it via Nix packages or set CHROMIUM_PATH environment variable."
  );
}

const LAUNCH_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--no-first-run",
  "--no-zygote",
  "--single-process",
  "--disable-extensions",
  "--disable-background-networking",
  "--disable-default-apps",
  "--mute-audio",
];

/**
 * Captures a full-page screenshot of the given URL and returns it as a PNG buffer.
 * Throws if the URL is unreachable or the timeout is exceeded.
 */
export async function captureFullPage(url: string, timeoutMs = 30_000): Promise<Buffer> {
  const executablePath = getChromiumPath();
  console.log(`[Puppeteer] launching Chromium at ${executablePath}`);

  const browser = await puppeteer.launch({
    executablePath,
    args: LAUNCH_ARGS,
    headless: true,
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });

    // Block heavy resources that slow down capture without adding visual value
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const rt = req.resourceType();
      if (["media", "font", "websocket"].includes(rt)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    await page.goto(url, { waitUntil: "networkidle2", timeout: timeoutMs });

    // Short settle delay for JS-rendered content
    await new Promise((r) => setTimeout(r, 1500));

    const screenshot = await page.screenshot({ fullPage: true, type: "png" });
    return Buffer.from(screenshot);
  } finally {
    await browser.close();
  }
}
