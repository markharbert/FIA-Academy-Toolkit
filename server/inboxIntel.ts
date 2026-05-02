import crypto from "crypto";

export const INTEL_DOMAIN = "watch.fearlessmarketinglab.com";
export const SEED_TOKEN_PREFIX = "track-";

const TOKEN_CHARS = "abcdefghijkmnpqrstuvwxyz23456789";

export function generateSeedToken(): string {
  let body = "";
  const bytes = crypto.randomBytes(12);
  for (let i = 0; i < 12; i++) {
    body += TOKEN_CHARS[bytes[i] % TOKEN_CHARS.length];
  }
  return SEED_TOKEN_PREFIX + body;
}

export function buildSeedAddress(token: string): string {
  return `${token}@${INTEL_DOMAIN}`;
}

export function extractToken(toRaw: string): string | null {
  if (!toRaw) return null;
  const inAngle = toRaw.match(/<([^>]+)>/);
  const addr = inAngle ? inAngle[1].trim() : toRaw.trim();
  const m = addr.match(/^([a-z0-9-]+)@([\w.-]+)$/i);
  if (!m) return null;
  const token = m[1].toLowerCase();
  const domain = m[2].toLowerCase();
  if (domain !== INTEL_DOMAIN) return null;
  return token.startsWith(SEED_TOKEN_PREFIX) ? token : null;
}

export function parseFromField(fromRaw: string): { name?: string; email?: string; domain?: string } {
  if (!fromRaw) return {};
  const nameMatch = fromRaw.match(/^"?([^"<\n]+?)"?\s*</);
  const name = nameMatch ? nameMatch[1].trim() : undefined;
  const emailMatch = fromRaw.match(/<([^>]+)>/) || fromRaw.match(/(\S+@\S+)/);
  const email = emailMatch ? emailMatch[1].toLowerCase() : undefined;
  const domain = email?.match(/@([\w.-]+)/)?.[1]?.toLowerCase();
  return { name, email, domain };
}

export function extractReplyTo(headers: string): string | undefined {
  if (!headers) return undefined;
  const m = headers.match(/^Reply-To:\s*([^\r\n]+)/im);
  if (!m) return undefined;
  const inAngle = m[1].match(/<([^>]+)>/);
  return (inAngle ? inAngle[1] : m[1]).trim().toLowerCase();
}

export function extractMessageId(headers: string): string | undefined {
  if (!headers) return undefined;
  const m = headers.match(/^Message-ID:\s*<?([^>\r\n]+)>?/im);
  return m ? m[1].trim() : undefined;
}

export function extractSentAt(headers: string): Date | undefined {
  if (!headers) return undefined;
  const m = headers.match(/^Date:\s*([^\r\n]+)/im);
  if (!m) return undefined;
  const d = new Date(m[1].trim());
  return isNaN(d.getTime()) ? undefined : d;
}

export function hasListUnsubscribe(headers: string): boolean {
  return !!headers && /^List-Unsubscribe:/im.test(headers);
}

export function hasListUnsubscribePost(headers: string): boolean {
  return !!headers && /^List-Unsubscribe-Post:/im.test(headers);
}

// Reuse the analyzer's auth parsing approach (string-based, no deps)
export function parseSpf(spf: string | undefined): string {
  if (!spf) return "unknown";
  const l = spf.toLowerCase();
  if (l.includes("softfail")) return "softfail";
  if (l.includes("pass")) return "pass";
  if (l.includes("fail")) return "fail";
  if (l.includes("neutral")) return "neutral";
  if (l.includes("none")) return "none";
  return "unknown";
}

export function parseDkim(dkim: string | undefined): string {
  if (!dkim) return "unknown";
  try {
    const parsed = typeof dkim === "string" ? JSON.parse(dkim) : dkim;
    const values = Object.values(parsed as Record<string, string>);
    if (values.some((v) => String(v).toLowerCase() === "pass")) return "pass";
    if (values.some((v) => String(v).toLowerCase().includes("fail"))) return "fail";
  } catch {
    if (dkim.toLowerCase().includes("pass")) return "pass";
    if (dkim.toLowerCase().includes("fail")) return "fail";
  }
  return "unknown";
}

export function parseDmarc(headers: string | undefined): string {
  if (!headers) return "unknown";
  const m = headers.match(/dmarc=(\w+)/i);
  return m ? m[1].toLowerCase() : "unknown";
}

// Extract preheader from <head>/inline preheader span (common ESP pattern)
export function extractPreheader(html: string): string | undefined {
  if (!html) return undefined;
  // Common preheader pattern: hidden div/span at top of body
  const m = html.match(
    /<(?:div|span|p)[^>]*style\s*=\s*["'][^"']*(?:display\s*:\s*none|visibility\s*:\s*hidden|max-height\s*:\s*0)[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|span|p)>/i,
  );
  if (!m) return undefined;
  const text = m[1].replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").trim();
  return text ? text.substring(0, 300) : undefined;
}

export function htmlToPlainText(html: string): string {
  if (!html) return "";
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<head[\s\S]*?<\/head>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function countWords(text: string): number {
  if (!text) return 0;
  const t = text.trim();
  if (!t) return 0;
  return t.split(/\s+/).length;
}

export function countImages(html: string): number {
  if (!html) return 0;
  const matches = html.match(/<img\b/gi);
  return matches ? matches.length : 0;
}

export interface ExtractedLink {
  url: string;
  domain?: string;
  anchorText?: string;
  position: number;
  hasUtm: boolean;
}

export function extractLinks(html: string, fromDomain?: string): ExtractedLink[] {
  if (!html) return [];
  const links: ExtractedLink[] = [];
  const seen = new Set<string>();
  const re = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  let pos = 0;
  while ((m = re.exec(html)) !== null) {
    const url = m[1].trim();
    if (!url || url.startsWith("mailto:") || url.startsWith("tel:") || url.startsWith("#")) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    let domain: string | undefined;
    let hasUtm = false;
    try {
      const u = new URL(url);
      domain = u.hostname.toLowerCase();
      hasUtm = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"].some((k) =>
        u.searchParams.has(k),
      );
    } catch {
      // ignore malformed URLs
    }
    const anchorRaw = m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const anchorText = anchorRaw ? anchorRaw.substring(0, 200) : undefined;
    links.push({ url: url.substring(0, 2000), domain, anchorText, position: pos++, hasUtm });
    if (links.length >= 200) break;
  }
  return links;
}

const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}\u{1F900}-\u{1F9FF}]/u;

export function subjectStats(subject: string): {
  length: number;
  hasEmoji: boolean;
  isAllCaps: boolean;
} {
  const s = subject || "";
  const letters = s.replace(/[^A-Za-z]/g, "");
  const isAllCaps = letters.length >= 6 && letters === letters.toUpperCase();
  return {
    length: s.length,
    hasEmoji: EMOJI_RE.test(s),
    isAllCaps,
  };
}

// Strip tracking pixels from HTML for cleaner viewing
export function stripTrackingPixels(html: string): string {
  if (!html) return html;
  return html.replace(/<img\b[^>]*>/gi, (tag) => {
    const wMatch = tag.match(/\bwidth\s*=\s*["']?(\d+)["']?/i);
    const hMatch = tag.match(/\bheight\s*=\s*["']?(\d+)["']?/i);
    if (wMatch && hMatch && parseInt(wMatch[1]) <= 1 && parseInt(hMatch[1]) <= 1) return "";
    if (
      /style\s*=\s*["'][^"']*(?:display\s*:\s*none|visibility\s*:\s*hidden|(?:width|height)\s*:\s*0)/i.test(tag)
    )
      return "";
    if (
      /src\s*=\s*["'][^"']*(?:\/(?:track|pixel|open|beacon|wf|trk)(?:[/?.])|open\.(?:gif|png|php)|\.pixel\.)/.test(tag)
    )
      return "";
    return tag;
  });
}

// Quick first-pass ESP detection from headers — Phase 2 will expand this
export function detectEsp(headers: string): string | undefined {
  if (!headers) return undefined;
  const h = headers.toLowerCase();
  if (h.includes("x-mailer: mailchimp") || h.includes("mandrillapp.com") || h.includes("list-id:") && h.includes("mailchimp")) return "Mailchimp";
  if (h.includes("x-sg-eid") || h.includes("sendgrid.net")) return "SendGrid";
  if (h.includes("x-klaviyo") || h.includes("klaviyomail.com")) return "Klaviyo";
  if (h.includes("x-aws-ses") || h.includes("amazonses.com")) return "Amazon SES";
  if (h.includes("x-mc-user") || h.includes("mailerlite.com")) return "MailerLite";
  if (h.includes("x-cm-")) return "Campaign Monitor";
  if (h.includes("constantcontact.com")) return "Constant Contact";
  if (h.includes("activehosted.com") || h.includes("x-ac-")) return "ActiveCampaign";
  if (h.includes("convertkit") || h.includes("x-ck-")) return "ConvertKit";
  if (h.includes("hubspotemail.net") || h.includes("hubspot.com")) return "HubSpot";
  if (h.includes("clickfunnels") || h.includes("cf-mail")) return "ClickFunnels";
  if (h.includes("drip.com") || h.includes("x-drip")) return "Drip";
  if (h.includes("ontraport")) return "Ontraport";
  if (h.includes("infusionsoft") || h.includes("keap")) return "Keap";
  if (h.includes("getresponse.com")) return "GetResponse";
  if (h.includes("aweber.com")) return "AWeber";
  return undefined;
}
