import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import ipaddr from "ipaddr.js";
import { ObjectStorageService } from "./replit_integrations/object_storage/objectStorage";
import { storage } from "./storage";

const MICROLINK_ENDPOINT = "https://api.microlink.io";
const MAX_BYTES = 4_000_000;
const FETCH_TIMEOUT_MS = 25_000;

const inFlight = new Set<string>();

function isPrivateOrReservedIp(ip: string): boolean {
  try {
    const addr = ipaddr.parse(ip);
    const range = addr.range();
    const blocked = new Set([
      "private",
      "loopback",
      "linkLocal",
      "uniqueLocal",
      "unspecified",
      "broadcast",
      "carrierGradeNat",
      "reserved",
      "multicast",
      "ipv4Mapped",
      "ipv4Compatible",
      "rfc6145",
      "rfc6052",
      "6to4",
      "teredo",
    ]);
    return blocked.has(range);
  } catch {
    return true;
  }
}

function isObviouslyBadHost(host: string): boolean {
  const h = host.toLowerCase();
  if (!h) return true;
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h.endsWith(".internal") || h.endsWith(".local")) return true;
  return false;
}

function basicNormalize(raw?: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let url = trimmed;
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    if (parsed.username || parsed.password) return null;
    if (isObviouslyBadHost(parsed.hostname)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export async function safeNormalizeWebsite(raw?: string | null): Promise<string | null> {
  const url = basicNormalize(raw);
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;

    // Already an IP literal
    if (isIP(host)) {
      if (isPrivateOrReservedIp(host)) return null;
      return url;
    }

    // Resolve all A + AAAA records and reject if any is private/reserved
    const records = await lookup(host, { all: true, verbatim: true });
    if (!records.length) return null;
    for (const r of records) {
      if (isPrivateOrReservedIp(r.address)) return null;
    }
    return url;
  } catch {
    return null;
  }
}

export function isCapturing(trackerId: string): boolean {
  return inFlight.has(trackerId);
}

export async function captureWebsiteScreenshot(
  trackerId: string,
  website: string | null | undefined,
): Promise<{ ok: boolean; reason?: string; path?: string }> {
  const normalized = await safeNormalizeWebsite(website);
  if (!normalized) {
    await storage.setCompetitorTrackerScreenshot(trackerId, null, "none");
    return { ok: false, reason: "no-website" };
  }
  if (inFlight.has(trackerId)) return { ok: false, reason: "in-flight" };
  inFlight.add(trackerId);

  try {
    await storage.setCompetitorTrackerScreenshotStatus(trackerId, "capturing");

    const apiUrl =
      `${MICROLINK_ENDPOINT}/?url=${encodeURIComponent(normalized)}` +
      `&screenshot=true&meta=false&embed=screenshot.url` +
      `&viewport.width=1280&viewport.height=720&type=jpeg&waitUntil=networkidle2`;

    const controller = new AbortController();
    // Hard deadline covers headers AND body download
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(apiUrl, {
        signal: controller.signal,
        redirect: "follow",
        headers: { "User-Agent": "AcademyToolkit-InboxIntel/1.0" },
      });

      if (!res.ok) {
        console.warn(`[InboxIntel/screenshot] microlink ${res.status} for tracker ${trackerId}`);
        await storage.setCompetitorTrackerScreenshotStatus(trackerId, "failed");
        return { ok: false, reason: `http-${res.status}` };
      }

      const ctype = res.headers.get("content-type") || "";
      if (!ctype.startsWith("image/")) {
        await storage.setCompetitorTrackerScreenshotStatus(trackerId, "failed");
        return { ok: false, reason: "not-an-image" };
      }

      // Stream the body and enforce size cap incrementally
      if (!res.body) {
        await storage.setCompetitorTrackerScreenshotStatus(trackerId, "failed");
        return { ok: false, reason: "no-body" };
      }
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) {
          total += value.byteLength;
          if (total > MAX_BYTES) {
            controller.abort();
            await storage.setCompetitorTrackerScreenshotStatus(trackerId, "failed");
            return { ok: false, reason: "too-large" };
          }
          chunks.push(value);
        }
      }
      if (total === 0) {
        await storage.setCompetitorTrackerScreenshotStatus(trackerId, "failed");
        return { ok: false, reason: "empty" };
      }

      const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)), total);

      const ext = ctype.includes("png") ? "png" : ctype.includes("webp") ? "webp" : "jpg";
      const objectName = `inbox-intel/screenshots/${trackerId}-${Date.now()}.${ext}`;
      const objectPath = `/objects/${objectName}`;

      const objectStorage = new ObjectStorageService();
      await objectStorage.uploadFile(objectPath, buf, ctype);
      await storage.setCompetitorTrackerScreenshot(trackerId, objectPath, "ready");

      return { ok: true, path: objectPath };
    } finally {
      clearTimeout(timer);
    }
  } catch (err: any) {
    console.warn(`[InboxIntel/screenshot] capture failed for ${trackerId}:`, err?.message || err);
    try {
      await storage.setCompetitorTrackerScreenshotStatus(trackerId, "failed");
    } catch {}
    return { ok: false, reason: err?.message || "error" };
  } finally {
    inFlight.delete(trackerId);
  }
}

export function captureWebsiteScreenshotAsync(
  trackerId: string,
  website: string | null | undefined,
): void {
  captureWebsiteScreenshot(trackerId, website).catch((err) => {
    console.warn(`[InboxIntel/screenshot] async capture error for ${trackerId}:`, err?.message || err);
  });
}
