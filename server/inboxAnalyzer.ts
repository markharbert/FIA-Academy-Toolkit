import dns from "dns";
import OpenAI from "openai";
import type { SpamFlag, CopyFeedback, SubjectAnalysis, TechnicalHealth, SenderTrust, ContentQuality, CanSpamCompliance } from "@shared/schema";

const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
});

const INBOX_DOMAIN = "email.fearlessmarketinglab.com";

export function getInboxAddress(token: string): string {
  return `${token}@${INBOX_DOMAIN}`;
}

export function generateToken(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
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
    { name: "Spamhaus", host: `${reversed}.zen.spamhaus.org` },
    { name: "Barracuda", host: `${reversed}.b.barracudacentral.org` },
    { name: "SpamCop", host: `${reversed}.bl.spamcop.net` },
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

    const inSubject = subjectLower.includes(phrase);
    const inBody = bodyLower.includes(phrase);

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
  sendingDomain: string
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

  const blacklistHits = await checkBlacklists(sendingIp);

  return {
    displayNameDomainMatch,
    replyToMatchesFrom,
    blacklisted: blacklistHits.length > 0,
    blacklistHits,
  };
}

// ── Content quality analysis ────────────────────────────────────────────────

export function analyzeContentQuality(bodyText: string, bodyHtml: string): ContentQuality {
  // Strip HTML tags to get plain text from HTML body for all checks
  const htmlAsText = (bodyHtml || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const textToSearch = (bodyText || "").trim() || htmlAsText;

  const wordCount = textToSearch.split(/\s+/).filter(Boolean).length;

  const hasPs = /\bp\.?\s*s\.?\b/i.test(textToSearch);

  const hasPersonalization =
    /\{[a-z_]+\}|%[a-z_]+%|\[\[[\w\s]+\]\]/i.test(textToSearch + bodyHtml) ||
    /\b(?:Hi|Hey|Dear|Hello)\s+[A-Z][a-z]+[,!]/i.test(textToSearch);

  return {
    wordCount,
    hasPs,
    hasPersonalization,
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

  // Sender Trust: 15 pts
  let trustPoints = 10; // default when not yet analyzed
  if (params.senderTrust) {
    const st = params.senderTrust;
    trustPoints = 0;
    if (!st.blacklisted) trustPoints += 8;
    if (st.displayNameDomainMatch === true) trustPoints += 4;
    if (st.replyToMatchesFrom === true || st.replyToMatchesFrom === null) trustPoints += 3;
  }
  // max 15

  // Spam language: 28 pts
  const spamPoints = Math.round((params.spamScore / 100) * 28);
  // max 28

  // Technical health: 10 pts
  let techPoints = 6; // default
  if (params.technicalHealth) {
    const th = params.technicalHealth;
    techPoints = 0;
    if (th.hasPlainTextVersion) techPoints += 3;
    if (th.hasPreheader) techPoints += 2;
    if (th.trackingPixelCount === 0) techPoints += 2;
    if (th.estimatedSizeKb < 100) techPoints += 2;
    if (th.missingAltCount === 0) techPoints += 1;
  }
  // max 10

  // Content quality: 10 pts (word count 8 + personalization 1 + P.S. 1)
  let contentPoints = 5; // default
  if (params.contentQuality) {
    const cq = params.contentQuality;
    contentPoints = 0;
    const wc = cq.wordCount;
    if (wc >= 100 && wc <= 400) contentPoints += 8;
    else if (wc >= 401 && wc <= 500) contentPoints += 6;
    else if (wc >= 501 && wc <= 600) contentPoints += 4;
    else if (wc >= 601 && wc <= 700) contentPoints += 2;
    else if (wc >= 701 && wc <= 800) contentPoints += 1;
    if (cq.hasPersonalization) contentPoints += 1;
    if (cq.hasPs) contentPoints += 1;
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
