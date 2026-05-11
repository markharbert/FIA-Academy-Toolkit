import dns from "dns";
import OpenAI from "openai";
import type { SpamFlag, CopyFeedback, SubjectAnalysis, TechnicalHealth, SenderTrust, ContentQuality, CanSpamCompliance } from "@shared/schema";

const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
});

const INBOX_DOMAIN = "score.fearlesspromo.com";

export function getInboxAddress(token: string): string {
  return `${token}@${INBOX_DOMAIN}`;
}

export function generateToken(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export function generateNamedToken(firstName?: string | null, lastName?: string | null): string {
  const namePart = `${firstName || ""}${lastName || ""}`
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 20);
  const suffix = String(Math.floor(1000 + Math.random() * 9000));
  return namePart.length >= 2 ? `${namePart}${suffix}` : generateToken();
}

export function stripTrackingPixels(html: string): string {
  if (!html) return html;
  return html.replace(/<img\b[^>]*>/gi, (tag) => {
    // Strip 1x1 / 0x0 images (both dimensions must be ≤ 1)
    const wMatch = tag.match(/\bwidth\s*=\s*["']?(\d+)["']?/i);
    const hMatch = tag.match(/\bheight\s*=\s*["']?(\d+)["']?/i);
    if (wMatch && hMatch && parseInt(wMatch[1]) <= 1 && parseInt(hMatch[1]) <= 1) return "";
    // Strip images hidden via CSS
    if (/style\s*=\s*["'][^"']*(?:display\s*:\s*none|visibility\s*:\s*hidden|(?:width|height)\s*:\s*0)/i.test(tag)) return "";
    // Strip known tracking pixel URL patterns
    if (/src\s*=\s*["'][^"']*(?:\/(?:track|pixel|open|beacon|wf|trk)(?:[/?.])|open\.(?:gif|png|php)|\.pixel\.)/.test(tag)) return "";
    return tag;
  });
}

// ── Parse SendGrid webhook fields ──────────────────────────────────────────

export function parseSpfResult(spfField: string | undefined): string {
  if (!spfField) return "unknown";
  const lower = spfField.toLowerCase();
  // Check softfail before fail since "softfail" contains "fail"
  if (lower.includes("softfail")) return "softfail";
  if (lower.includes("pass")) return "pass";
  if (lower.includes("fail")) return "fail";
  if (lower.includes("neutral")) return "neutral";
  if (lower.includes("none")) return "none";
  return "unknown";
}

export function parseDkimResult(dkimField: string | undefined): string {
  if (!dkimField) return "unknown";
  try {
    const parsed = typeof dkimField === "string" ? JSON.parse(dkimField) : dkimField;
    const values = Object.values(parsed as Record<string, string>);
    if (values.some((v) => String(v).toLowerCase() === "pass")) return "pass";
    if (values.some((v) => String(v).toLowerCase().includes("fail"))) return "fail";
  } catch {
    if (dkimField.toLowerCase().includes("pass")) return "pass";
    if (dkimField.toLowerCase().includes("fail")) return "fail";
  }
  return "unknown";
}

export function parseDmarcResult(
  headersRaw: string | undefined,
  fromAddress?: string,
  dkimResult?: string,
  spfResult?: string,
): string {
  // First: try to find an explicit dmarc= result in Authentication-Results headers
  if (headersRaw) {
    const match = headersRaw.match(/dmarc=(\w+)/i);
    if (match) return match[1].toLowerCase();
  }

  // Second: derive from DKIM identifier alignment (DMARC aligned pass)
  // DMARC passes if DKIM passes AND the DKIM signing domain aligns with the From domain.
  // Emails sent via ESPs often have multiple DKIM-Signature headers (one for the platform,
  // one for the sender domain). We must check ALL of them — not just the first.
  if (dkimResult === "pass" && fromAddress && headersRaw) {
    const fromDomain = fromAddress.match(/@([\w.-]+)/)?.[1]?.toLowerCase() || "";
    const dkimSigMatches = [...headersRaw.matchAll(/^DKIM-Signature:[^\n]*(?:\n[ \t][^\n]*)*/gim)];
    for (const m of dkimSigMatches) {
      const dkimBlock = m[0].replace(/\r?\n[ \t]/g, " ");
      const dDomain = dkimBlock.match(/\bd=([\w.-]+)/i)?.[1]?.toLowerCase() || "";
      if (dDomain && fromDomain) {
        // Allow exact match or organizational domain match (e.g. mail.example.com vs example.com)
        const aligned =
          dDomain === fromDomain ||
          fromDomain.endsWith("." + dDomain) ||
          dDomain.endsWith("." + fromDomain);
        if (aligned) return "pass";
      }
    }
  }

  // Third: derive from SPF alignment (envelope-from domain aligns with From domain)
  if (spfResult === "pass" && fromAddress && headersRaw) {
    const fromDomain = fromAddress.match(/@([\w.-]+)/)?.[1]?.toLowerCase() || "";
    // Look for Received-SPF or envelope-from clues in headers
    const envMatch =
      headersRaw.match(/Received-SPF:[^\n]*envelope-from=\S*@([\w.-]+)/i) ||
      headersRaw.match(/smtp\.(?:mailfrom|envfrom)=([\w.-]+)/i);
    if (envMatch) {
      const envDomain = envMatch[1].toLowerCase();
      const aligned =
        envDomain === fromDomain ||
        fromDomain.endsWith("." + envDomain) ||
        envDomain.endsWith("." + fromDomain);
      if (aligned) return "pass";
    }
  }

  return "unknown";
}

export function extractSendingDomain(fromAddress: string): string {
  const match = fromAddress.match(/@([\w.-]+)/);
  return match ? match[1] : "";
}

export function extractSendingIp(headersRaw: string | undefined): string {
  if (!headersRaw) return "";
  const match = headersRaw.match(/\[(\d{1,3}(?:\.\d{1,3}){3})\]/);
  return match ? match[1] : "";
}

export function extractReplyTo(headersRaw: string | undefined): string {
  if (!headersRaw) return "";
  const match = headersRaw.match(/^Reply-To:\s*(.+)$/im);
  return match ? match[1].trim() : "";
}

// ── DNS checks ─────────────────────────────────────────────────────────────

export async function checkSpfRecord(domain: string): Promise<boolean> {
  if (!domain) return false;
  try {
    const records = await dns.promises.resolveTxt(domain);
    return records.some((r) => r.join("").startsWith("v=spf1"));
  } catch {
    return false;
  }
}

export async function checkDkimRecord(domain: string): Promise<boolean> {
  if (!domain) return false;
  const selectors = ["default", "google", "mail", "k1", "s1", "s2", "sendgrid", "smtp"];
  for (const sel of selectors) {
    try {
      const records = await dns.promises.resolveTxt(`${sel}._domainkey.${domain}`);
      if (records.length > 0) return true;
    } catch {
      // Try next selector
    }
  }
  return false;
}

export async function checkDmarcRecord(domain: string): Promise<boolean> {
  if (!domain) return false;
  try {
    const records = await dns.promises.resolveTxt(`_dmarc.${domain}`);
    return records.some((r) => r.join("").startsWith("v=DMARC1"));
  } catch {
    return false;
  }
}

// ── IP Blacklist checks ─────────────────────────────────────────────────────

async function checkBlacklists(ip: string): Promise<string[]> {
  if (!ip) return [];
  const reversed = ip.split(".").reverse().join(".");
  const lists = [
    { name: "Spamhaus ZEN", host: `${reversed}.zen.spamhaus.org` },
  ];
  const hits: string[] = [];
  await Promise.all(
    lists.map(async ({ name, host }) => {
      try {
        await dns.promises.resolve4(host);
        hits.push(name);
      } catch {
        // ENOTFOUND = not listed, that's fine
      }
    })
  );
  return hits;
}

// ── Domain Blacklist checks (Spamhaus DBL) ────────────────────────────────────

async function checkDomainBlacklists(domain: string): Promise<string[]> {
  if (!domain) return [];
  const d = domain.toLowerCase().replace(/^www\./i, "");
  const lists = [
    { name: "Spamhaus DBL", host: `${d}.dbl.spamhaus.org` },
  ];
  const hits: string[] = [];
  await Promise.all(
    lists.map(async ({ name, host }) => {
      try {
        await dns.promises.resolve4(host);
        hits.push(name);
      } catch {
        // ENOTFOUND = not listed, that's fine
      }
    })
  );
  return hits;
}

// ── Extract click tracking domains from email HTML ───────────────────────────

const TRACKING_SUBDOMAIN_RE = /^(?:click|track|links?|em|go|lt|lp|link|open|trk|cta|t|e|r|f|url|email)\./i;

function getRootDomain(host: string): string {
  const parts = host.toLowerCase().replace(/^www\./, "").split(".");
  return parts.slice(-2).join(".");
}

function extractTrackingDomains(bodyHtml: string, sendingDomain: string): string[] {
  if (!bodyHtml) return [];
  const rootDomain = sendingDomain.toLowerCase().replace(/^www\./i, "");
  const linkMatches = bodyHtml.match(/href\s*=\s*["']https?:\/\/([^/"'?#\s]+)/gi) || [];
  const seen = new Set<string>();
  const tracking: string[] = [];
  for (const m of linkMatches) {
    const match = m.match(/href\s*=\s*["']https?:\/\/([^/"'?#\s]+)/i);
    if (!match) continue;
    const host = match[1].toLowerCase().replace(/^www\./i, "");
    if (seen.has(host)) continue;
    seen.add(host);
    // Skip the sending domain and its subdomains
    if (host === rootDomain || host.endsWith(`.${rootDomain}`)) continue;
    // Include only domains that look like click/tracking subdomains
    if (TRACKING_SUBDOMAIN_RE.test(host)) {
      tracking.push(host);
      if (tracking.length >= 5) break;
    }
  }
  return tracking;
}

// ── Spam language analysis ──────────────────────────────────────────────────

type TriggerEntry = { phrase: string; severity: "high" | "medium" | "low"; category: string };

const SPAM_TRIGGERS: TriggerEntry[] = [
  // ── HIGH RISK ──────────────────────────────────────────────────────────────
  // Deceptive / too-good-to-be-true
  { phrase: "you've been selected", severity: "high", category: "Deceptive" },
  { phrase: "you have been selected", severity: "high", category: "Deceptive" },
  { phrase: "you are a winner", severity: "high", category: "Deceptive" },
  { phrase: "you won", severity: "high", category: "Deceptive" },
  { phrase: "congratulations", severity: "high", category: "Deceptive" },
  { phrase: "as seen on", severity: "high", category: "Deceptive" },
  { phrase: "once in a lifetime", severity: "high", category: "Deceptive" },
  { phrase: "this is not spam", severity: "high", category: "Deceptive" },
  { phrase: "not junk", severity: "high", category: "Deceptive" },
  // Financial
  { phrase: "free money", severity: "high", category: "Financial" },
  { phrase: "make money fast", severity: "high", category: "Financial" },
  { phrase: "earn extra cash", severity: "high", category: "Financial" },
  { phrase: "extra income", severity: "high", category: "Financial" },
  { phrase: "financial freedom", severity: "high", category: "Financial" },
  { phrase: "double your income", severity: "high", category: "Financial" },
  { phrase: "cash bonus", severity: "high", category: "Financial" },
  { phrase: "credit card required", severity: "high", category: "Financial" },
  { phrase: "no credit check", severity: "high", category: "Financial" },
  { phrase: "consolidate debt", severity: "high", category: "Financial" },
  { phrase: "debt relief", severity: "high", category: "Financial" },
  { phrase: "refinance", severity: "high", category: "Financial" },
  { phrase: "100% free", severity: "high", category: "Financial" },
  { phrase: "zero cost", severity: "high", category: "Financial" },
  { phrase: "no fees", severity: "high", category: "Financial" },
  // Health / weight loss
  { phrase: "lose weight fast", severity: "high", category: "Health" },
  { phrase: "weight loss", severity: "high", category: "Health" },
  { phrase: "miracle cure", severity: "high", category: "Health" },
  { phrase: "miracle pill", severity: "high", category: "Health" },
  { phrase: "anti-aging", severity: "high", category: "Health" },
  { phrase: "clinically proven", severity: "high", category: "Health" },
  // Pressure / urgency classics
  { phrase: "act now", severity: "high", category: "Urgency" },
  { phrase: "apply now", severity: "high", category: "Urgency" },
  { phrase: "call now", severity: "high", category: "Urgency" },
  { phrase: "call free", severity: "high", category: "Urgency" },
  { phrase: "don't delete", severity: "high", category: "Urgency" },
  { phrase: "instant approval", severity: "high", category: "Urgency" },
  { phrase: "instant access", severity: "high", category: "Urgency" },
  { phrase: "order now", severity: "high", category: "Urgency" },
  { phrase: "buy now", severity: "high", category: "Urgency" },
  { phrase: "claim now", severity: "high", category: "Urgency" },
  { phrase: "claim your", severity: "high", category: "Urgency" },
  // Classic spam phrases
  { phrase: "click here", severity: "high", category: "Classic Spam" },
  { phrase: "click below", severity: "high", category: "Classic Spam" },
  { phrase: "free offer", severity: "high", category: "Classic Spam" },
  { phrase: "free membership", severity: "high", category: "Classic Spam" },
  { phrase: "free preview", severity: "high", category: "Classic Spam" },
  { phrase: "free quote", severity: "high", category: "Classic Spam" },
  { phrase: "free trial", severity: "high", category: "Classic Spam" },
  { phrase: "free gift", severity: "high", category: "Classic Spam" },
  { phrase: "no risk", severity: "high", category: "Classic Spam" },
  { phrase: "risk free", severity: "high", category: "Classic Spam" },
  { phrase: "risk-free", severity: "high", category: "Classic Spam" },
  { phrase: "no obligation", severity: "high", category: "Classic Spam" },
  { phrase: "guaranteed", severity: "high", category: "Classic Spam" },
  { phrase: "work from home", severity: "high", category: "Classic Spam" },

  // ── MEDIUM RISK ────────────────────────────────────────────────────────────
  { phrase: "limited time offer", severity: "medium", category: "Urgency" },
  { phrase: "limited time", severity: "medium", category: "Urgency" },
  { phrase: "limited offer", severity: "medium", category: "Urgency" },
  { phrase: "expires soon", severity: "medium", category: "Urgency" },
  { phrase: "last chance", severity: "medium", category: "Urgency" },
  { phrase: "don't miss", severity: "medium", category: "Urgency" },
  { phrase: "don't wait", severity: "medium", category: "Urgency" },
  { phrase: "hurry", severity: "medium", category: "Urgency" },
  { phrase: "urgent", severity: "medium", category: "Urgency" },
  { phrase: "while supplies last", severity: "medium", category: "Urgency" },
  { phrase: "special offer", severity: "medium", category: "Promotional" },
  { phrase: "special promotion", severity: "medium", category: "Promotional" },
  { phrase: "exclusive deal", severity: "medium", category: "Promotional" },
  { phrase: "exclusive offer", severity: "medium", category: "Promotional" },
  { phrase: "amazing deal", severity: "medium", category: "Promotional" },
  { phrase: "incredible deal", severity: "medium", category: "Promotional" },
  { phrase: "unbelievable", severity: "medium", category: "Promotional" },
  { phrase: "lowest price", severity: "medium", category: "Promotional" },
  { phrase: "best price", severity: "medium", category: "Promotional" },
  { phrase: "cheap", severity: "medium", category: "Promotional" },
  { phrase: "earn extra", severity: "medium", category: "Financial" },
  { phrase: "make money", severity: "medium", category: "Financial" },
  { phrase: "earn cash", severity: "medium", category: "Financial" },
  { phrase: "invest now", severity: "medium", category: "Financial" },
  { phrase: "profit", severity: "medium", category: "Financial" },
  { phrase: "lose weight", severity: "medium", category: "Health" },
  { phrase: "burn fat", severity: "medium", category: "Health" },
  { phrase: "get rich", severity: "medium", category: "Financial" },
  { phrase: "fast cash", severity: "medium", category: "Financial" },
  { phrase: "winner", severity: "medium", category: "Deceptive" },

  // ── LOW RISK ───────────────────────────────────────────────────────────────
  { phrase: "free", severity: "low", category: "Common Marketing" },
  { phrase: "bonus", severity: "low", category: "Common Marketing" },
  { phrase: "prize", severity: "low", category: "Common Marketing" },
  { phrase: "gift", severity: "low", category: "Common Marketing" },
  { phrase: "discount", severity: "low", category: "Common Marketing" },
  { phrase: "save", severity: "low", category: "Common Marketing" },
  { phrase: "deal", severity: "low", category: "Common Marketing" },
  { phrase: "promotion", severity: "low", category: "Common Marketing" },
  { phrase: "offer", severity: "low", category: "Common Marketing" },
  { phrase: "sale", severity: "low", category: "Common Marketing" },
  { phrase: "exclusive", severity: "low", category: "Common Marketing" },
  { phrase: "amazing", severity: "low", category: "Common Marketing" },
  { phrase: "incredible", severity: "low", category: "Common Marketing" },
];

// Whole-word match: won't fire on substrings (e.g. "deal" won't match inside "ideal").
// Escapes regex metacharacters in the phrase, then wraps in word-boundary assertions.
// The `i` flag handles case since bodyLower/subjectLower may not be fully lowercased.
function phraseMatchesText(text: string, phrase: string): boolean {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(text);
}

export function analyzeSpamLanguage(
  subject: string,
  bodyText: string,
  bodyHtml: string
): { score: number; flags: SpamFlag[] } {
  const flags: SpamFlag[] = [];

  const htmlAsText = (bodyHtml || "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();
  const bodyLower = ((bodyText || "").trim() || htmlAsText);
  const subjectLower = (subject || "").toLowerCase();
  const combined = subjectLower + " " + bodyLower;

  // ── Trigger word scan ────────────────────────────────────────────────────
  const subjectMatches: string[] = [];
  const bodyMatches: string[] = [];
  const seenPhrases = new Set<string>();

  for (const trigger of SPAM_TRIGGERS) {
    const phrase = trigger.phrase;
    if (seenPhrases.has(phrase)) continue;

    const inSubject = phraseMatchesText(subjectLower, phrase);
    const inBody = phraseMatchesText(bodyLower, phrase);

    if (inSubject) {
      seenPhrases.add(phrase);
      subjectMatches.push(phrase);
      flags.push({
        label: `"${phrase}" in subject line`,
        severity: trigger.severity === "low" ? "low" : trigger.severity === "medium" ? "medium" : "high",
        category: "subject_trigger",
        matches: [phrase],
      });
    } else if (inBody) {
      seenPhrases.add(phrase);
      bodyMatches.push(phrase);
    }
  }

  // Group body trigger words into a single flag per severity
  const highBody = bodyMatches.filter(p => SPAM_TRIGGERS.find(t => t.phrase === p)?.severity === "high");
  const medBody  = bodyMatches.filter(p => SPAM_TRIGGERS.find(t => t.phrase === p)?.severity === "medium");
  const lowBody  = bodyMatches.filter(p => SPAM_TRIGGERS.find(t => t.phrase === p)?.severity === "low");

  if (highBody.length > 0) {
    flags.push({
      label: `${highBody.length} high-risk spam phrase${highBody.length > 1 ? "s" : ""} in body`,
      severity: "high",
      category: "trigger_word",
      matches: highBody,
    });
  }
  if (medBody.length > 0) {
    flags.push({
      label: `${medBody.length} medium-risk trigger word${medBody.length > 1 ? "s" : ""} in body`,
      severity: "medium",
      category: "trigger_word",
      matches: medBody,
    });
  }
  if (lowBody.length > 0) {
    flags.push({
      label: `${lowBody.length} common marketing word${lowBody.length > 1 ? "s" : ""} in body`,
      severity: "low",
      category: "trigger_word",
      matches: lowBody,
    });
  }

  // ── Structural / pattern checks ──────────────────────────────────────────
  // Excessive caps in subject
  const capsRatio = (subject.match(/[A-Z]/g) || []).length / Math.max(subject.replace(/\s/g, "").length, 1);
  if (capsRatio > 0.5 && subject.length > 5) {
    flags.push({ label: "Subject line uses excessive ALL CAPS", severity: "high", category: "structural" });
  } else if (capsRatio > 0.3 && subject.length > 5) {
    flags.push({ label: "Subject uses significant capitalization", severity: "medium", category: "structural" });
  }

  // Excessive punctuation in subject
  if (/[!?]{2,}/.test(subject)) {
    flags.push({ label: 'Subject line has excessive punctuation ("!!" or "??")', severity: "medium", category: "structural" });
  }

  // Multiple exclamation marks in body
  const bodyExclamations = (bodyLower.match(/!/g) || []).length;
  if (bodyExclamations >= 5) {
    flags.push({ label: `${bodyExclamations} exclamation marks in body`, severity: "medium", category: "pattern" });
  }

  // ALL CAPS words in body (3+ letters)
  const capsWordMatches = bodyText.match(/\b[A-Z]{3,}\b/g) || [];
  const filteredCapsWords = [...new Set(capsWordMatches)].filter(w =>
    !["SPF", "DKIM", "DMARC", "HTML", "URL", "CTA", "P.S", "PS"].includes(w)
  );
  if (filteredCapsWords.length >= 4) {
    flags.push({
      label: `${filteredCapsWords.length} ALL CAPS words in body`,
      severity: "medium",
      category: "pattern",
      matches: filteredCapsWords.slice(0, 8),
    });
  }

  // Link density
  if (bodyHtml) {
    const linkCount = (bodyHtml.match(/<a\s/gi) || []).length;
    const wordCount = bodyLower.split(/\s+/).filter(Boolean).length;
    if (linkCount > 10) {
      flags.push({ label: `High link count (${linkCount} links) may trigger filters`, severity: "medium", category: "pattern" });
    } else if (wordCount > 0 && linkCount / wordCount > 0.05) {
      flags.push({ label: "High link-to-text ratio", severity: "medium", category: "pattern" });
    }
  }

  // ── Score calculation (0–100) ────────────────────────────────────────────
  let deductions = 0;
  for (const f of flags) {
    if (f.severity === "high") deductions += 18;
    else if (f.severity === "medium") deductions += 8;
    else deductions += 3;
  }
  const score = Math.max(0, 100 - deductions);

  return { score, flags };
}

// Keep old export name as alias so existing callers don't immediately break
export const analyzeSpamSignals = analyzeSpamLanguage;

// ── Subject line analysis ──────────────────────────────────────────────────

export function analyzeSubjectLine(subject: string): SubjectAnalysis {
  const emojiRegex = /\p{Emoji_Presentation}|\p{Extended_Pictographic}/gu;
  return {
    charCount: subject.length,
    wordCount: subject.trim().split(/\s+/).filter(Boolean).length,
    hasEmoji: emojiRegex.test(subject),
    hasNumber: /\d/.test(subject),
    hasQuestion: subject.includes("?"),
    hasPersonalizationToken: /\{[a-z_]+\}|%[a-z_]+%|\[\[[\w\s]+\]\]/i.test(subject),
    isIdealLength: subject.length >= 30 && subject.length <= 60,
  };
}

// ── Technical health analysis ───────────────────────────────────────────────

export function analyzeTechnicalHealth(bodyHtml: string, bodyText: string): TechnicalHealth {
  const hasHtmlVersion = (bodyHtml || "").trim().length > 0;
  const hasPlainTextVersion = (bodyText || "").trim().length > 0;
  const estimatedSizeKb = parseFloat(((bodyHtml.length + bodyText.length) / 1024).toFixed(1));

  const imgTags = (bodyHtml.match(/<img[^>]*>/gi) || []);
  const missingAltCount = imgTags.filter((tag) => !/alt\s*=/i.test(tag)).length;

  const trackingPixelCount = imgTags.filter((tag) => {
    const isOneByOne =
      /width\s*=\s*["']?1["']?/i.test(tag) && /height\s*=\s*["']?1["']?/i.test(tag);
    const isTrackerDomain = /track\.|pixel\.|beacon\.|open\.|trk\./i.test(tag);
    return isOneByOne || isTrackerDomain;
  }).length;

  const linkMatches = bodyHtml.match(/href\s*=\s*["']https?:\/\/([^/"'?#\s]+)/gi) || [];
  const domains = new Set(
    linkMatches
      .map((m) => {
        const match = m.match(/href\s*=\s*["']https?:\/\/([^/"'?#\s]+)/i);
        return match ? match[1].replace(/^www\./i, "").toLowerCase() : "";
      })
      .filter(Boolean)
  );

  const hasPreheader =
    /class\s*=\s*["'][^"']*preheader[^"']*["']/i.test(bodyHtml) ||
    (bodyHtml.length > 100 && /display\s*:\s*none/i.test(bodyHtml.slice(0, 3000)));

  return {
    hasHtmlVersion,
    hasPlainTextVersion,
    estimatedSizeKb,
    missingAltCount,
    trackingPixelCount,
    uniqueExternalDomains: domains.size,
    hasPreheader,
  };
}

// ── Sender trust analysis ───────────────────────────────────────────────────

export async function analyzeSenderTrust(
  fromRaw: string,
  replyTo: string | undefined,
  sendingIp: string,
  sendingDomain: string,
  bodyHtml: string = ""
): Promise<SenderTrust> {
  const displayNameMatch = fromRaw.match(/^"?([^"<\n]+)"?\s*</);
  const displayName = displayNameMatch ? displayNameMatch[1].trim().toLowerCase() : null;

  let displayNameDomainMatch: boolean | null = null;
  if (displayName && sendingDomain) {
    const domainRoot = sendingDomain.split(".").slice(-2, -1)[0]?.toLowerCase() || "";
    const firstWord = displayName.split(/\s+/)[0] || "";
    displayNameDomainMatch =
      displayName.includes(domainRoot) ||
      domainRoot.includes(firstWord) ||
      firstWord.includes(domainRoot);
  }

  let replyToMatchesFrom: boolean | null = null;
  if (replyTo && replyTo.trim().length > 0) {
    const replyDomainMatch = replyTo.match(/@([\w.-]+)/);
    const replyDomain = replyDomainMatch ? replyDomainMatch[1].toLowerCase() : "";
    replyToMatchesFrom = replyDomain === sendingDomain.toLowerCase();
  }

  const trackingDomains = extractTrackingDomains(bodyHtml, sendingDomain);

  const [blacklistHits, domainBlacklistHits, ...trackingHitsArrays] = await Promise.all([
    checkBlacklists(sendingIp),
    checkDomainBlacklists(sendingDomain),
    ...trackingDomains.map(d => checkDomainBlacklists(d)),
  ]);

  const trackingDomainsBlacklisted: string[] = [];
  trackingDomains.forEach((domain, i) => {
    if (trackingHitsArrays[i] && trackingHitsArrays[i].length > 0) {
      trackingDomainsBlacklisted.push(domain);
    }
  });

  // Check whether click-tracking link roots differ from the sending domain root
  const sendingRoot = getRootDomain(sendingDomain);
  const trackingDomainRoots = [...new Set(trackingDomains.map(d => getRootDomain(d)))];
  const trackingDomainMismatch =
    trackingDomainRoots.length > 0 &&
    trackingDomainRoots.some(r => r !== sendingRoot);

  return {
    displayNameDomainMatch,
    replyToMatchesFrom,
    blacklisted: blacklistHits.length > 0,
    blacklistHits,
    domainBlacklisted: domainBlacklistHits.length > 0,
    domainBlacklistHits,
    trackingDomainsChecked: trackingDomains,
    trackingDomainsBlacklisted,
    trackingDomainMismatch,
    trackingDomainRoots,
  };
}

// ── Content quality analysis ────────────────────────────────────────────────

export function analyzeContentQuality(bodyText: string, bodyHtml: string, subject: string = ""): ContentQuality {
  // Strip style/script/comment blocks first so their content isn't counted as words
  const htmlCleaned = (bodyHtml || "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  // Strip remaining HTML tags to get visible text
  const htmlAsText = htmlCleaned.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

  // Some ESPs send a stub plain-text body like "PLAIN TEXT VERSION" or
  // "This email is best viewed in HTML" rather than real content.
  // Detect these placeholders (≤ 8 words, or matching known stub phrases) and
  // fall back to the HTML-derived text so word/link counts are accurate.
  const PLACEHOLDER_RE = /^(plain\s+text\s+(version|email|copy)|this\s+email\s+(is\s+)?(best\s+viewed|requires|was\s+sent)|view\s+this\s+email|html\s+version)/i;
  const rawBodyText = (bodyText || "").trim();
  const rawBodyWords = rawBodyText.split(/\s+/).filter(Boolean).length;
  const isPlaceholderText = rawBodyWords <= 8 || PLACEHOLDER_RE.test(rawBodyText);
  const textToSearch = (!isPlaceholderText && rawBodyText) ? rawBodyText : htmlAsText;

  const wordCount = textToSearch.split(/\s+/).filter(Boolean).length;

  const hasPs = /\bp\.?\s*s\.?\b/i.test(textToSearch);

  const hasPersonalization =
    /\{[a-z_]+\}|%[a-z_]+%|\[\[[\w\s]+\]\]/i.test(textToSearch + bodyHtml) ||
    /\b(?:Hi|Hey|Dear|Hello)\s+[A-Z][a-z]+[,!]/i.test(textToSearch);

  // HTML-to-text ratio: estimate visible text vs total content
  const imgTagCount = ((bodyHtml || "").match(/<img\b/gi) || []).length;
  // Each image treated as ~100 word-equivalents of content space
  const totalContentUnits = wordCount + imgTagCount * 100;
  const htmlToTextRatio = totalContentUnits > 0 ? wordCount / totalContentUnits : 1;

  // Image-heavy: very few words but multiple images, or negligible text
  const isImageHeavy = (wordCount < 50 && imgTagCount >= 2) || (imgTagCount > 0 && htmlToTextRatio < 0.2);

  // URL shortener detection
  const URL_SHORTENER_RE = /https?:\/\/(bit\.ly|tinyurl\.com|t\.co|ow\.ly|goo\.gl|buff\.ly|is\.gd|rebrand\.ly|cutt\.ly|rb\.gy|short\.io|clk\.sh|lnkd\.in)\//i;
  const hasUrlShortener = URL_SHORTENER_RE.test((bodyHtml || "") + (bodyText || ""));

  // ── Hidden text detection (two-stage: detect → classify) ──────────────────
  const html = bodyHtml || "";

  // Strip Outlook conditional comments — these are legitimate rendering helpers
  const htmlStripped = html.replace(/<!--\[if\b[^\]]*\]>[\s\S]*?<!\[endif\]-->/gi, "");

  // Find body start offset so we can measure position relative to body
  const bodyTagMatch = htmlStripped.match(/<body\b[^>]*>/i);
  const bodyStart = bodyTagMatch
    ? htmlStripped.indexOf(bodyTagMatch[0]) + bodyTagMatch[0].length
    : 0;

  // Detect which CSS methods are hiding a given attribute string
  // Note: color:white and font-size:1px are intentionally excluded — they produce
  // too many false positives (white text on dark backgrounds, footer spacer wrappers).
  const detectMethods = (attrs: string): string[] => {
    const m: string[] = [];
    if (/display\s*:\s*none/i.test(attrs))       m.push("display:none");
    if (/visibility\s*:\s*hidden/i.test(attrs))  m.push("visibility:hidden");
    if (/max-height\s*:\s*0/i.test(attrs))       m.push("max-height:0");
    if (/font-size\s*:\s*0(?:px)?\b/i.test(attrs)) m.push("font-size:0");
    if (/opacity\s*:\s*0\b/i.test(attrs))        m.push("opacity:0");
    if (/mso-hide\s*:\s*all/i.test(attrs))       m.push("mso-hide:all");
    if (/\bhidden(?:="hidden")?\b/i.test(attrs)) m.push("hidden-attr");
    return m;
  };

  // Broad pattern: any element opening tag that has a hiding property
  const HIDE_TAG_RE = /<([a-z][a-z0-9]*)\b([^>]*(?:display\s*:\s*none|visibility\s*:\s*hidden|max-height\s*:\s*0|font-size\s*:\s*0(?:px)?\b|opacity\s*:\s*0\b|mso-hide\s*:\s*all|\bhidden(?:="hidden")?)[^>]*)>/gi;

  type RawBlock = {
    startPos: number;
    attrs: string;
    methods: string[];
    text: string;
    hasLinks: boolean;
    hasImages: boolean;
  };

  const rawBlocks: RawBlock[] = [];
  let hm: RegExpExecArray | null;
  HIDE_TAG_RE.lastIndex = 0;
  while ((hm = HIDE_TAG_RE.exec(htmlStripped)) !== null) {
    const startPos = hm.index;
    const attrs = hm[2];
    const methods = detectMethods(attrs);
    if (methods.length === 0) continue;
    // Grab up to 500 chars of content after the opening tag for text/link/image extraction
    const snippet = htmlStripped.slice(startPos, startPos + 500);
    const text = snippet.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 250);
    rawBlocks.push({
      startPos,
      attrs,
      methods,
      text,
      hasLinks: /<a\b/i.test(snippet),
      hasImages: /<img\b/i.test(snippet),
    });
  }

  // Sort by position, then deduplicate: blocks within 300 chars are the same element
  rawBlocks.sort((a, b) => a.startPos - b.startPos);
  const dedupedBlocks: RawBlock[] = [];
  for (const block of rawBlocks) {
    const last = dedupedBlocks[dedupedBlocks.length - 1];
    if (last && block.startPos - last.startPos < 300) {
      // Merge methods — multiple CSS properties on the same element counts as ONE block
      last.methods = [...new Set([...last.methods, ...block.methods])];
      if (block.hasLinks) last.hasLinks = true;
      if (block.hasImages) last.hasImages = true;
      continue;
    }
    dedupedBlocks.push({ ...block });
  }

  // Strip zero-width spacing characters — these are not real content
  const ZERO_WIDTH_RE = /(&(?:zwnj|zwj|nbsp|#847|#8203|#65279|#200[bcd]|#feff|#ad);|[\u200B-\u200D\uFEFF\u00AD\u034F])/gi;
  const cleanBlockText = (t: string) => t.replace(ZERO_WIDTH_RE, "").replace(/\s+/g, " ").trim();
  const isSpacingOnly = (t: string) => cleanBlockText(t).length === 0;

  // Only consider blocks that have actual content (not just spacing chars)
  const contentBlocks = dedupedBlocks.filter(b => !isSpacingOnly(b.text));

  // Classify each content block
  const classifyBlock = (block: RawBlock, index: number): "PREHEADER" | "AMBIGUOUS" | "SPAM_SIGNAL" => {
    const clean = cleanBlockText(block.text);
    const posRelBody = block.startPos - bodyStart;

    // SPAM SIGNAL — any one of these triggers hard flag
    if (block.hasLinks)                                           return "SPAM_SIGNAL";
    if (block.hasImages)                                          return "SPAM_SIGNAL";
    if (clean.length > 500)                                       return "SPAM_SIGNAL";
    if (posRelBody > 1500)                                        return "SPAM_SIGNAL";
    if (/https?:\/\/\S+/i.test(clean))                           return "SPAM_SIGNAL";
    if (/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(clean))  return "SPAM_SIGNAL";
    if (/\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/.test(clean))          return "SPAM_SIGNAL";
    // Keyword stuffing: 6+ comma-separated terms
    if (clean.split(",").map(s => s.trim()).filter(s => s.length > 2).length >= 6) return "SPAM_SIGNAL";
    // Second content block or beyond is suspicious
    if (index > 0) return "SPAM_SIGNAL";

    // PREHEADER — must meet all criteria
    const inPosition  = posRelBody >= 0 && posRelBody <= 1500;
    const rightLength = clean.length >= 1 && clean.length <= 250;
    if (inPosition && rightLength) return "PREHEADER";

    return "AMBIGUOUS";
  };

  type ClassifiedBlock = RawBlock & { cleanText: string; classification: "PREHEADER" | "AMBIGUOUS" | "SPAM_SIGNAL" };
  const classifiedBlocks: ClassifiedBlock[] = contentBlocks.map((block, i) => ({
    ...block,
    cleanText: cleanBlockText(block.text),
    classification: classifyBlock(block, i),
  }));

  // Overall classification
  type OverallClass = "NONE" | "PREHEADER" | "AMBIGUOUS" | "SPAM_SIGNAL" | "MIXED";
  let hiddenTextClassification: OverallClass = "NONE";
  if (classifiedBlocks.length > 0) {
    const hasSpam     = classifiedBlocks.some(b => b.classification === "SPAM_SIGNAL");
    const hasPreheader = classifiedBlocks.some(b => b.classification === "PREHEADER");
    const hasAmbiguous = classifiedBlocks.some(b => b.classification === "AMBIGUOUS");
    if (hasSpam && hasPreheader)   hiddenTextClassification = "MIXED";
    else if (hasSpam)              hiddenTextClassification = "SPAM_SIGNAL";
    else if (hasAmbiguous)         hiddenTextClassification = "AMBIGUOUS";
    else if (hasPreheader)         hiddenTextClassification = "PREHEADER";
  }

  // hasHiddenText true only for non-safe classifications (drives scoring)
  const hasHiddenText = hiddenTextClassification === "SPAM_SIGNAL" || hiddenTextClassification === "MIXED" || hiddenTextClassification === "AMBIGUOUS";

  // hiddenBlocks for UI display
  const hiddenBlocks = classifiedBlocks.map(b => ({
    text: b.cleanText.slice(0, 120) + (b.cleanText.length > 120 ? "…" : ""),
    methods: b.methods,
    position: b.startPos - bodyStart,
    hasLinks: b.hasLinks,
    hasImages: b.hasImages,
    classification: b.classification,
  }));

  // Legacy samples array for any backward-compat consumers
  const hiddenTextSamples = classifiedBlocks.map(b => {
    const label = b.classification === "PREHEADER" ? "PREHEADER (safe)" : b.classification === "AMBIGUOUS" ? "AMBIGUOUS" : "SPAM SIGNAL";
    return `[${label}] ${b.methods.join(" + ")} — "${b.cleanText.slice(0, 80)}${b.cleanText.length > 80 ? "…" : ""}"`;
  });

  // Link-to-text ratio: more than 1 link per 50 words is flagged.
  // Count only meaningful text links — exclude anchors whose visible content is
  // purely images (logos, social icons, CTA image-buttons). ESP templates commonly
  // wrap images in nested tables inside <a>, so we match the full <a>...</a> block
  // and strip all inner tags to check whether real text remains.
  const anchorBlocks = (bodyHtml || "").match(/<a\b[^>]*>[\s\S]*?<\/a>/gi) || [];
  const textLinkCount = anchorBlocks.filter(block => {
    // Strip all HTML tags and decode common HTML entities to get plain text content
    const text = block
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;|&#160;/g, " ")
      .replace(/&[a-z#0-9]+;/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    return text.length >= 2; // needs at least 2 non-whitespace chars to be a text link
  }).length;
  // Anchors with no closing </a> can't be matched above — count them conservatively
  const totalAnchors = ((bodyHtml || "").match(/<a\b/gi) || []).length;
  const unmatchedAnchors = Math.max(0, totalAnchors - anchorBlocks.length);
  const linkCount = textLinkCount + unmatchedAnchors;
  const linkToTextRatio = wordCount > 0 ? linkCount / wordCount : 0;

  // Subject line character count
  const subjectCharCount = (subject || "").length;

  return {
    wordCount,
    linkCount,
    hasPs,
    hasPersonalization,
    htmlToTextRatio,
    hasUrlShortener,
    hasHiddenText,
    hiddenTextClassification,
    hiddenBlocks,
    hiddenTextSamples,
    linkToTextRatio,
    isImageHeavy,
    subjectCharCount,
  };
}

// ── CAN-SPAM Compliance analysis ─────────────────────────────────────────────

export function analyzeCanSpamCompliance(bodyText: string, bodyHtml: string, subject: string): CanSpamCompliance {
  const htmlAsText = (bodyHtml || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const textToSearch = (bodyText || "").trim() || htmlAsText;
  const combinedRaw = (textToSearch + " " + bodyHtml).toLowerCase();

  // Physical mailing address (street address, PO box, or state+zip)
  const hasPhysicalAddress =
    /\d+\s+[\w\s]{2,30}(?:street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|way|place|pl|suite|ste)\b/i.test(textToSearch) ||
    /p\.?o\.?\s*box\s+\d+/i.test(textToSearch) ||
    /\b[A-Z]{2}\s+\d{5}(-\d{4})?\b/.test(textToSearch);

  // Unsubscribe / opt-out mechanism
  const hasUnsubscribeLink = /unsubscribe|opt.?out|manage preferences|manage subscription/i.test(combinedRaw);

  // Honest subject line — fake Re:/Fwd: is a CAN-SPAM violation
  const hasHonestSubject = !/^(re:|fwd?:|fw:)\s/i.test(subject);

  // Score: physical address 4pts + unsubscribe 4pts + honest subject 2pts = 10pts max → scaled to 0–100
  let pts = 0;
  if (hasPhysicalAddress) pts += 4;
  if (hasUnsubscribeLink) pts += 4;
  if (hasHonestSubject) pts += 2;
  const score = Math.round((pts / 10) * 100);

  return { hasPhysicalAddress, hasUnsubscribeLink, hasHonestSubject, score };
}

// ── AI copy scoring ─────────────────────────────────────────────────────────

export async function scoreCopyWithAI(
  subject: string,
  bodyText: string
): Promise<CopyFeedback> {
  const prompt = `You are an expert email copywriter and marketing coach. Analyze this email and score it against professional email marketing best practices.

SUBJECT LINE: ${subject}

EMAIL BODY:
${(bodyText || "").slice(0, 3000)}

Score the email on these 5 dimensions (each 1–10) and give concise, actionable feedback for each:
1. Subject Line — curiosity, specificity, length, open-worthiness
2. Opening Hook — does the first sentence grab attention immediately?
3. Body Value — clarity, relevance, reader benefit, storytelling
4. Call to Action — is there a single clear CTA? Is it compelling and urgent?
5. Overall Flow — readability, tone, persuasiveness, structure

Also provide exactly 3 top improvement suggestions (brief, specific, actionable).

Respond ONLY with valid JSON in this exact format:
{
  "sections": [
    {"name": "Subject Line", "score": 7, "feedback": "..."},
    {"name": "Opening Hook", "score": 6, "feedback": "..."},
    {"name": "Body Value", "score": 8, "feedback": "..."},
    {"name": "Call to Action", "score": 5, "feedback": "..."},
    {"name": "Overall Flow", "score": 7, "feedback": "..."}
  ],
  "topSuggestions": ["...", "...", "..."]
}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });
    const raw = response.choices[0].message.content || "{}";
    return JSON.parse(raw) as CopyFeedback;
  } catch (err) {
    console.error("[InboxAnalyzer] AI copy scoring failed:", err);
    return {
      sections: [],
      topSuggestions: ["AI analysis unavailable — please try again later."],
    };
  }
}

// ── Overall score ───────────────────────────────────────────────────────────
// Breakdown: Auth 30 + SenderTrust 15 + SpamLanguage 28 + Technical 10 + Content 7 + CAN-SPAM 10 = 100

export function computeOverallScore(params: {
  spfResult: string;
  dkimResult: string;
  dmarcResult: string;
  spfRecordExists: boolean;
  dkimRecordExists: boolean;
  dmarcRecordExists: boolean;
  spamScore: number;
  copyScore?: number;
  senderTrust?: SenderTrust | null;
  technicalHealth?: TechnicalHealth | null;
  contentQuality?: ContentQuality | null;
  canSpamCompliance?: CanSpamCompliance | null;
}): number {
  // Auth: 30 pts
  let authPoints = 0;
  if (params.spfResult === "pass") authPoints += 8;
  else if (params.spfResult === "softfail") authPoints += 4;
  if (params.dkimResult === "pass") authPoints += 8;
  if (params.dmarcResult === "pass") authPoints += 7;
  if (params.spfRecordExists) authPoints += 4;
  if (params.dkimRecordExists) authPoints += 3;
  // max 30

  // Sender Trust: 15 pts (IP 4 + domain 4 + display name 4 + reply-to 3)
  let trustPoints = 10; // default when not yet analyzed
  if (params.senderTrust) {
    const st = params.senderTrust;
    trustPoints = 0;
    if (!st.blacklisted) trustPoints += 4;
    if (!st.domainBlacklisted) trustPoints += 4;
    if (st.displayNameDomainMatch === true) trustPoints += 4;
    if (st.replyToMatchesFrom === true || st.replyToMatchesFrom === null) trustPoints += 3;
  }
  // max 15

  // Spam language: 28 pts
  const spamPoints = Math.round((params.spamScore / 100) * 28);
  // max 28

  // Technical health: 10 pts (preheader 3 + size 3 + tracking pixels 2 + ALT text 1 + plain text 1)
  let techPoints = 6; // default
  if (params.technicalHealth) {
    const th = params.technicalHealth;
    techPoints = 0;
    if (th.hasPreheader) techPoints += 3;
    if (th.estimatedSizeKb < 100) techPoints += 3;
    if (th.trackingPixelCount === 0) techPoints += 2;
    if (th.missingAltCount === 0) techPoints += 1;
    if (th.hasPlainTextVersion) techPoints += 1;
  }
  // max 10

  // Content quality: 10 pts
  // Tier 1 — Spam Risk (6 pts): URL shortener 2 + hidden text 2 + html-to-text ratio 1 + link density 1
  // Tier 2 — Engagement (3 pts): word count 2 + subject length 1
  // Tier 3 — Best Practice (1 pt): personalization or P.S.
  let contentPoints = 5; // default
  if (params.contentQuality) {
    const cq = params.contentQuality;
    contentPoints = 0;
    // Tier 1
    if (!cq.hasUrlShortener) contentPoints += 2;
    // Hidden text: NONE/PREHEADER = 2pts, AMBIGUOUS = 1pt, SPAM_SIGNAL/MIXED = 0pts
    const hidClass = cq.hiddenTextClassification ?? (cq.hasHiddenText ? "SPAM_SIGNAL" : "NONE");
    if (hidClass === "NONE" || hidClass === "PREHEADER") contentPoints += 2;
    else if (hidClass === "AMBIGUOUS") contentPoints += 1;
    if (cq.htmlToTextRatio >= 0.3) contentPoints += 1;
    if (cq.linkToTextRatio <= 0.02) contentPoints += 1; // ≤ 1 link per 50 words
    // Tier 2
    const wc = cq.wordCount;
    if (wc >= 50 && wc <= 500) contentPoints += 2;
    else if (wc > 500 && wc <= 900) contentPoints += 1;
    const sc = cq.subjectCharCount ?? 0;
    if (sc >= 20 && sc <= 60) contentPoints += 1;
    // Tier 3
    if (cq.hasPersonalization || cq.hasPs) contentPoints += 1;
  }
  // max 10

  // CAN-SPAM Compliance: 10 pts (physical address 4 + unsubscribe 4 + honest subject 2)
  let canSpamPoints = 5; // default when not yet analyzed
  if (params.canSpamCompliance) {
    const cs = params.canSpamCompliance;
    canSpamPoints = 0;
    if (cs.hasPhysicalAddress) canSpamPoints += 4;
    if (cs.hasUnsubscribeLink) canSpamPoints += 4;
    if (cs.hasHonestSubject) canSpamPoints += 2;
  }
  // max 10

  return Math.min(100, authPoints + trustPoints + spamPoints + techPoints + contentPoints + canSpamPoints);
}
