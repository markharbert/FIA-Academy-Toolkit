import dns from "dns";
import OpenAI from "openai";
import type { SpamFlag, CopyFeedback, SubjectAnalysis, TechnicalHealth, SenderTrust, ContentQuality } from "@shared/schema";

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
  // DMARC passes if DKIM passes AND the DKIM signing domain aligns with the From domain
  if (dkimResult === "pass" && fromAddress && headersRaw) {
    const fromDomain = fromAddress.match(/@([\w.-]+)/)?.[1]?.toLowerCase() || "";
    // Find the DKIM-Signature d= tag (can span multiple lines due to header folding)
    const dkimSigMatch = headersRaw.match(/^DKIM-Signature:[^\n]*(?:\n[ \t][^\n]*)*/im);
    if (dkimSigMatch) {
      const dkimBlock = dkimSigMatch[0].replace(/\r?\n[ \t]/g, " ");
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

// ── Spam signal analysis ────────────────────────────────────────────────────

const HIGH_RISK_WORDS = [
  "free money", "guaranteed", "no risk", "winner", "you won", "claim now",
  "act now", "limited time", "make money fast", "earn $", "click here",
  "buy now", "order now", "cheap", "discount", "cash bonus", "credit card required",
  "consolidate debt", "lowest price", "no fees", "free offer", "once in a lifetime",
  "work from home", "weight loss", "lose weight", "miracle", "100% free",
];

const MEDIUM_RISK_WORDS = [
  "free", "urgent", "important", "exclusive", "special offer", "limited",
  "amazing", "incredible", "unbelievable", "hurry", "expire", "deal",
  "offer", "promotion", "save", "discount", "bonus", "gift", "prize",
];

export function analyzeSpamSignals(
  subject: string,
  bodyText: string,
  bodyHtml: string
): { score: number; flags: SpamFlag[] } {
  const flags: SpamFlag[] = [];
  const subjectLower = subject.toLowerCase();
  const bodyLower = (bodyText || "").toLowerCase();
  const combined = subjectLower + " " + bodyLower;

  for (const word of HIGH_RISK_WORDS) {
    if (combined.includes(word)) {
      flags.push({ label: `Spam phrase detected: "${word}"`, severity: "high" });
    }
  }

  let mediumHits = 0;
  for (const word of MEDIUM_RISK_WORDS) {
    if (combined.includes(word)) mediumHits++;
  }
  if (mediumHits >= 3) {
    flags.push({ label: `${mediumHits} promotional trigger words found`, severity: "medium" });
  } else if (mediumHits >= 1) {
    flags.push({ label: `${mediumHits} promotional trigger word(s) found`, severity: "low" });
  }

  const capsRatio = (subject.match(/[A-Z]/g) || []).length / Math.max(subject.length, 1);
  if (capsRatio > 0.5 && subject.length > 5) {
    flags.push({ label: "Subject line uses excessive ALL CAPS", severity: "high" });
  } else if (capsRatio > 0.3 && subject.length > 5) {
    flags.push({ label: "Subject line has significant capitalization", severity: "medium" });
  }

  if (/[!?]{2,}/.test(subject)) {
    flags.push({ label: "Subject line has excessive punctuation (!!! or ???)", severity: "medium" });
  }

  if (subject.length > 70) {
    flags.push({ label: `Subject line is too long (${subject.length} chars, ideal <50)`, severity: "low" });
  }

  // Check HTML body too — many emails are HTML-only with no plain text version
  const htmlTextLower = (bodyHtml || "").toLowerCase();
  const hasUnsub =
    bodyLower.includes("unsubscribe") ||
    bodyLower.includes("opt out") ||
    bodyLower.includes("opt-out") ||
    bodyLower.includes("manage preferences") ||
    htmlTextLower.includes("unsubscribe") ||
    htmlTextLower.includes("opt out") ||
    htmlTextLower.includes("opt-out") ||
    htmlTextLower.includes("manage preferences");
  if (!hasUnsub) {
    flags.push({ label: "No unsubscribe link detected (CAN-SPAM requirement)", severity: "high" });
  }

  if (bodyHtml) {
    const linkMatches = (bodyHtml.match(/<a\s/gi) || []).length;
    const wordCount = (bodyText || bodyHtml.replace(/<[^>]+>/g, " ")).split(/\s+/).length;
    if (linkMatches > 10) {
      flags.push({ label: `High link count (${linkMatches} links) may trigger filters`, severity: "medium" });
    }
    if (linkMatches > 0 && wordCount > 0 && linkMatches / wordCount > 0.05) {
      flags.push({ label: "Link-to-text ratio is high", severity: "medium" });
    }
    const imgMatches = (bodyHtml.match(/<img\s/gi) || []).length;
    if (imgMatches > 0 && wordCount < 50) {
      flags.push({ label: "Email appears image-heavy with little text", severity: "medium" });
    }
  }

  let deductions = 0;
  for (const f of flags) {
    if (f.severity === "high") deductions += 20;
    else if (f.severity === "medium") deductions += 10;
    else deductions += 5;
  }
  const score = Math.max(0, 100 - deductions);

  return { score, flags };
}

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
  const wordCount = (bodyText || "").trim().split(/\s+/).filter(Boolean).length;

  // Strip HTML tags to get plain text from HTML body for address/content checks
  const htmlAsText = (bodyHtml || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const textToSearch = bodyText || htmlAsText;

  const hasPhysicalAddress =
    /\d+\s+[\w\s]{2,30}(?:street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|way|place|pl|suite|ste)\b/i.test(textToSearch) ||
    /p\.?o\.?\s*box\s+\d+/i.test(textToSearch) ||
    /\b[A-Z]{2}\s+\d{5}(-\d{4})?\b/.test(textToSearch);

  const hasPs = /\b(p\.s\.|p\.?s\.?\s+[A-Z])/i.test(bodyText);

  const hasPersonalization =
    /\{[a-z_]+\}|%[a-z_]+%|\[\[[\w\s]+\]\]/i.test(bodyText + bodyHtml) ||
    /\b(?:Hi|Hey|Dear|Hello)\s+[A-Z][a-z]+[,!]/i.test(bodyText);

  return {
    wordCount,
    hasPhysicalAddress,
    hasPs,
    hasPersonalization,
  };
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
// Breakdown: Auth 30 + SenderTrust 15 + Spam 15 + Technical 10 + Content 10 + Copy 20 = 100

export function computeOverallScore(params: {
  spfResult: string;
  dkimResult: string;
  dmarcResult: string;
  spfRecordExists: boolean;
  dkimRecordExists: boolean;
  dmarcRecordExists: boolean;
  spamScore: number;
  copyScore: number;
  senderTrust?: SenderTrust | null;
  technicalHealth?: TechnicalHealth | null;
  contentQuality?: ContentQuality | null;
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

  // Spam signals: 15 pts
  const spamPoints = Math.round((params.spamScore / 100) * 15);

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

  // Content quality: 10 pts
  let contentPoints = 5; // default
  if (params.contentQuality) {
    const cq = params.contentQuality;
    contentPoints = 0;
    if (cq.hasPhysicalAddress) contentPoints += 4;
    if (cq.hasPersonalization) contentPoints += 3;
    if (cq.wordCount >= 50 && cq.wordCount <= 600) contentPoints += 3;
  }
  // max 10

  // Copy: 20 pts
  const copyPoints = Math.round((params.copyScore / 100) * 20);

  return Math.min(100, authPoints + trustPoints + spamPoints + techPoints + contentPoints + copyPoints);
}
