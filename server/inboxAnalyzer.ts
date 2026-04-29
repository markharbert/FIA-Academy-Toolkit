import dns from "dns";
import OpenAI from "openai";
import type { SpamFlag, CopyFeedback } from "@shared/schema";

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

// ── Parse SendGrid webhook fields ──────────────────────────────────────────

export function parseSpfResult(spfField: string | undefined): string {
  if (!spfField) return "unknown";
  const lower = spfField.toLowerCase();
  if (lower.includes("pass")) return "pass";
  if (lower.includes("fail")) return "fail";
  if (lower.includes("softfail")) return "softfail";
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

export function parseDmarcResult(headersRaw: string | undefined): string {
  if (!headersRaw) return "unknown";
  const match = headersRaw.match(/dmarc=(\w+)/i);
  if (!match) return "unknown";
  return match[1].toLowerCase();
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

  // High-risk phrase check
  for (const word of HIGH_RISK_WORDS) {
    if (combined.includes(word)) {
      flags.push({ label: `Spam phrase detected: "${word}"`, severity: "high" });
    }
  }

  // Medium-risk phrase check (only flag if multiple hits)
  let mediumHits = 0;
  for (const word of MEDIUM_RISK_WORDS) {
    if (combined.includes(word)) mediumHits++;
  }
  if (mediumHits >= 3) {
    flags.push({ label: `${mediumHits} promotional trigger words found`, severity: "medium" });
  } else if (mediumHits >= 1) {
    flags.push({ label: `${mediumHits} promotional trigger word(s) found`, severity: "low" });
  }

  // ALL CAPS in subject
  const capsRatio = (subject.match(/[A-Z]/g) || []).length / Math.max(subject.length, 1);
  if (capsRatio > 0.5 && subject.length > 5) {
    flags.push({ label: "Subject line uses excessive ALL CAPS", severity: "high" });
  } else if (capsRatio > 0.3 && subject.length > 5) {
    flags.push({ label: "Subject line has significant capitalization", severity: "medium" });
  }

  // Excessive punctuation
  if (/[!?]{2,}/.test(subject)) {
    flags.push({ label: "Subject line has excessive punctuation (!!! or ???)", severity: "medium" });
  }

  // Subject too long
  if (subject.length > 70) {
    flags.push({ label: `Subject line is too long (${subject.length} chars, ideal <50)`, severity: "low" });
  }

  // Missing unsubscribe link
  const hasUnsub =
    bodyLower.includes("unsubscribe") ||
    bodyLower.includes("opt out") ||
    bodyLower.includes("opt-out") ||
    bodyLower.includes("manage preferences");
  if (!hasUnsub) {
    flags.push({ label: "No unsubscribe link detected (CAN-SPAM requirement)", severity: "high" });
  }

  // Link density in HTML
  if (bodyHtml) {
    const linkMatches = (bodyHtml.match(/<a\s/gi) || []).length;
    const wordCount = (bodyText || bodyHtml.replace(/<[^>]+>/g, " ")).split(/\s+/).length;
    if (linkMatches > 10) {
      flags.push({ label: `High link count (${linkMatches} links) may trigger filters`, severity: "medium" });
    }
    if (linkMatches > 0 && wordCount > 0 && linkMatches / wordCount > 0.05) {
      flags.push({ label: "Link-to-text ratio is high", severity: "medium" });
    }
    // Image-heavy check
    const imgMatches = (bodyHtml.match(/<img\s/gi) || []).length;
    if (imgMatches > 0 && wordCount < 50) {
      flags.push({ label: "Email appears image-heavy with little text", severity: "medium" });
    }
  }

  // Compute score: start at 100, deduct per flag
  let deductions = 0;
  for (const f of flags) {
    if (f.severity === "high") deductions += 20;
    else if (f.severity === "medium") deductions += 10;
    else deductions += 5;
  }
  const score = Math.max(0, 100 - deductions);

  return { score, flags };
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

export function computeOverallScore(params: {
  spfResult: string;
  dkimResult: string;
  dmarcResult: string;
  spfRecordExists: boolean;
  dkimRecordExists: boolean;
  dmarcRecordExists: boolean;
  spamScore: number;
  copyScore: number;
}): number {
  // Auth section: 50 points total
  let authPoints = 0;
  if (params.spfResult === "pass") authPoints += 12;
  else if (params.spfResult === "softfail") authPoints += 6;
  if (params.dkimResult === "pass") authPoints += 12;
  if (params.dmarcResult === "pass") authPoints += 10;
  if (params.spfRecordExists) authPoints += 6;
  if (params.dkimRecordExists) authPoints += 6;
  if (params.dmarcRecordExists) authPoints += 4;

  // Content section: 50 points total (spam 25 + copy 25)
  const spamPoints = Math.round((params.spamScore / 100) * 25);
  const copyPoints = Math.round((params.copyScore / 100) * 25);

  return Math.min(100, authPoints + spamPoints + copyPoints);
}
