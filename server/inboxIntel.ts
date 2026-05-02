import crypto from "crypto";

export const INTEL_DOMAIN = "watch.fearlessmarketinglab.com";
// Legacy prefix — kept so old seed addresses still resolve.
export const SEED_TOKEN_PREFIX = "track-";

// ── Organic seed-address generator ─────────────────────────────────────────
// Real signups don't have random gibberish before the @. To keep our seed
// addresses from looking robotic / spammy to ESPs and list owners, we generate
// addresses that look like ordinary personal emails:
//   sarah.thompson83 / mike.r.davis / jenniferlee47 / dmiller2024 / kate_brooks
//
// The token is the full local-part. We store it verbatim and look up by exact
// match. Uniqueness is enforced by the DB + retry-on-collision in the route.

const FIRST_NAMES = [
  "alex","alice","amanda","amy","andrea","andrew","angela","anna","anthony","ashley",
  "austin","ava","benjamin","beth","brandon","brian","brittany","brooke","caleb","cameron",
  "carlos","carrie","casey","catherine","charles","chloe","chris","christina","claire","cody",
  "colin","connor","courtney","craig","crystal","cynthia","dan","daniel","danielle","david",
  "dawn","dean","derek","diana","dominic","donna","doug","dustin","dylan","edward","elaine",
  "eli","elizabeth","ellen","emily","emma","eric","erica","ethan","evan","evelyn","faith",
  "felix","frank","gabriel","gary","gavin","george","grace","grant","greg","hailey",
  "hannah","harry","heather","helen","henry","holly","ian","isaac","isabella","jack",
  "jackson","jacob","jake","james","jamie","jane","janet","jared","jason","jay","jeff",
  "jen","jenna","jennifer","jeremy","jess","jessica","jill","jim","joanna","joe","joel",
  "john","jon","jonathan","jordan","joseph","josh","julia","julie","justin","kaitlyn",
  "karen","kate","katherine","kathy","katie","keith","kelly","kelsey","ken","kendall",
  "kevin","kim","kimberly","kris","kristen","kyle","laura","lauren","leah","lee",
  "leslie","lily","linda","lisa","logan","lori","louis","lucas","lucy","luke",
  "lydia","madeline","madison","marc","marcus","maria","marie","mark","martha","mary",
  "matt","matthew","megan","melanie","melissa","mia","michael","michelle","mike","molly",
  "morgan","nancy","natalie","nathan","nick","nicole","noah","nora","olivia","owen",
  "paige","pam","patrick","paul","peter","philip","rachel","randy","raymond","rebecca",
  "richard","rick","robert","robin","ross","ryan","sam","samantha","samuel","sara",
  "sarah","scott","sean","seth","shannon","shawn","sierra","simon","sophia","stacy",
  "stephanie","steve","stewart","susan","tara","taylor","teresa","theresa","thomas","tim",
  "tina","todd","tom","tony","tracy","travis","trevor","troy","tyler","valerie",
  "vanessa","vince","walter","wendy","william","zach",
];

const LAST_NAMES = [
  "adams","alexander","allen","anderson","bailey","baker","barnes","bell","bennett","brooks",
  "brown","bryant","butler","campbell","carter","chapman","clark","cole","collins","cook",
  "cooper","cox","crawford","cruz","davis","day","dean","diaz","dixon","dunn",
  "edwards","ellis","evans","fisher","fleming","ford","foster","fox","franklin","freeman",
  "garcia","gardner","gibson","gomez","gonzalez","gordon","graham","gray","green","griffin",
  "hall","hamilton","harper","harris","harrison","hart","hayes","henderson","henry","hernandez",
  "hill","holmes","howard","hughes","hunt","hunter","jackson","james","jenkins","jensen",
  "johnson","jones","jordan","kelly","kennedy","king","knight","lane","lawson","lee",
  "lewis","long","lopez","lynch","martin","martinez","mason","matthews","mccarthy","mcdonald",
  "miller","mitchell","moore","morgan","morris","murphy","murray","nelson","newman","nichols",
  "nguyen","oliver","owens","palmer","parker","patel","patterson","payne","perez","perry",
  "peters","peterson","phillips","pierce","powell","price","ramirez","ramos","reed","reeves",
  "reyes","reynolds","rhodes","rice","richards","richardson","riley","rivera","roberts","robinson",
  "rodriguez","rogers","rose","ross","russell","ryan","sanchez","sanders","scott","shaw",
  "simmons","simpson","smith","snyder","spencer","stevens","stewart","stone","sullivan","taylor",
  "thomas","thompson","torres","turner","wagner","walker","wallace","walsh","ward","warren",
  "washington","watson","webb","weber","wells","west","wheeler","white","wilcox","williams",
  "wilson","wood","woods","wright","yates","young",
];

function pick<T>(arr: readonly T[]): T {
  const idx = crypto.randomInt(0, arr.length);
  return arr[idx];
}

function pickInt(maxExclusive: number): number {
  return crypto.randomInt(0, maxExclusive);
}

// Common real-world name "shapes" the local-part can take. We always append a
// short random alphanumeric tail (see TAIL_CHARS below) so the address has
// enough entropy to be unguessable against the public inbound webhook —
// mimicking how Gmail auto-suggests a unique handle when your preferred one
// is taken (e.g. `sarah.thompson.k7n3p9`).
const NAME_SHAPES: Array<{ build: (f: string, l: string) => string; weight: number }> = [
  { build: (f, l) => `${f}.${l}`, weight: 22 },        // sarah.thompson
  { build: (f, l) => `${f}${l}`, weight: 14 },         // sarahthompson
  { build: (f, l) => `${f}_${l}`, weight: 10 },        // sarah_thompson
  { build: (f, l) => `${f[0]}${l}`, weight: 10 },      // sthompson
  { build: (f, l) => `${f[0]}.${l}`, weight: 8 },      // s.thompson
  { build: (f, l) => `${f}.${l[0]}`, weight: 6 },      // sarah.t
  {                                                     // sarah.r.thompson (random middle initial)
    build: (f, l) => {
      const mid = String.fromCharCode(97 + pickInt(26));
      return `${f}.${mid}.${l}`;
    },
    weight: 6,
  },
];

function pickShape(): (f: string, l: string) => string {
  const total = NAME_SHAPES.reduce((s, p) => s + p.weight, 0);
  let r = pickInt(total);
  for (const p of NAME_SHAPES) {
    if (r < p.weight) return p.build;
    r -= p.weight;
  }
  return NAME_SHAPES[0].build;
}

// Lowercase alphanumeric — the unambiguous chars (no l/1, o/0 etc) keep tails
// looking like the unique-handle hashes Gmail/Outlook generate for users.
const TAIL_CHARS = "abcdefghjkmnpqrstuvwxyz23456789";

function randomTail(len: number): string {
  let out = "";
  const bytes = crypto.randomBytes(len);
  for (let i = 0; i < len; i++) out += TAIL_CHARS[bytes[i] % TAIL_CHARS.length];
  return out;
}

// Tail variants — every token gets one. They look like real signup handles:
//   .k7n3p9   .482917   2024kp7   .9k2n7p   etc.
// Minimum 6 chars / ~30 bits of entropy from the tail alone.
function buildTail(): string {
  const r = pickInt(100);
  if (r < 35) {
    // dot + 6 alnum  e.g. ".k7n3p9"
    return "." + randomTail(6);
  } else if (r < 60) {
    // 6 alnum  e.g. "k7n3p9"   (joined directly to name)
    return randomTail(6);
  } else if (r < 75) {
    // dot + 7 alnum  e.g. ".4k7n3p9"
    return "." + randomTail(7);
  } else if (r < 88) {
    // year + 6 alnum  e.g. "2024kp7nm3" — keeps a year-like opener for
    // human plausibility while preserving ≥30 bits of tail entropy so the
    // address remains hard to spray-enumerate against the public webhook.
    return String(2018 + pickInt(8)) + randomTail(6);
  } else {
    // _ + 6 alnum  e.g. "_k7n3p9"
    return "_" + randomTail(6);
  }
}

export function generateSeedToken(): string {
  const first = pick(FIRST_NAMES);
  const last = pick(LAST_NAMES);
  const namePart = pickShape()(first, last).toLowerCase();
  const local = (namePart + buildTail()).toLowerCase();
  // Safety: clamp length and strip anything not RFC-allowed (defensive).
  const cleaned = local.replace(/[^a-z0-9._-]/g, "").slice(0, 40);
  // Avoid leading/trailing dots and consecutive dots (RFC 5321 local-part rules).
  return cleaned
    .replace(/\.{2,}/g, ".")
    .replace(/^\.+|\.+$/g, "") || `${first}.${last}.${randomTail(6)}`;
}

export function buildSeedAddress(token: string): string {
  return `${token}@${INTEL_DOMAIN}`;
}

export function extractToken(toRaw: string): string | null {
  if (!toRaw) return null;
  const inAngle = toRaw.match(/<([^>]+)>/);
  const addr = inAngle ? inAngle[1].trim() : toRaw.trim();
  // Permissive local-part: dots, underscores, hyphens, digits, letters
  // (covers both legacy `track-xxx` and new organic name-style tokens).
  const m = addr.match(/^([a-z0-9._-]+)@([\w.-]+)$/i);
  if (!m) return null;
  const token = m[1].toLowerCase();
  const domain = m[2].toLowerCase();
  if (domain !== INTEL_DOMAIN) return null;
  return token;
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

// ESP detection. Combines header signals (high confidence) with HTML body
// fingerprints (medium confidence — link patterns, tracking domains, footer text).
// Headers always win when present; HTML signals are a fallback for ESPs that
// strip identifying headers.
export function detectEsp(headers: string, html?: string): string | undefined {
  const h = (headers || "").toLowerCase();
  const body = (html || "").toLowerCase();

  // ── Header signals (high confidence) ──
  if (h.includes("x-mailer: mailchimp") || h.includes("mandrillapp.com") || (h.includes("list-id:") && h.includes("mailchimp"))) return "Mailchimp";
  if (h.includes("x-sg-eid") || h.includes("sendgrid.net")) return "SendGrid";
  if (h.includes("x-klaviyo") || h.includes("klaviyomail.com")) return "Klaviyo";
  if (h.includes("x-aws-ses") || h.includes("amazonses.com")) return "Amazon SES";
  if (h.includes("x-mc-user") || h.includes("mailerlite.com")) return "MailerLite";
  if (h.includes("x-cm-")) return "Campaign Monitor";
  if (h.includes("constantcontact.com") || h.includes("ccsend.com")) return "Constant Contact";
  if (h.includes("activehosted.com") || h.includes("x-ac-")) return "ActiveCampaign";
  if (h.includes("convertkit") || h.includes("x-ck-")) return "ConvertKit";
  if (h.includes("hubspotemail.net") || h.includes("hubspot.com")) return "HubSpot";
  if (h.includes("clickfunnels") || h.includes("cf-mail")) return "ClickFunnels";
  if (h.includes("drip.com") || h.includes("x-drip")) return "Drip";
  if (h.includes("ontraport")) return "Ontraport";
  if (h.includes("infusionsoft") || h.includes("keap")) return "Keap";
  if (h.includes("getresponse.com")) return "GetResponse";
  if (h.includes("aweber.com")) return "AWeber";
  if (h.includes("kit.com") || h.includes("ck-tracking")) return "Kit (ConvertKit)";
  if (h.includes("beehiiv.com") || h.includes("x-beehiiv")) return "beehiiv";
  if (h.includes("substack.com")) return "Substack";
  if (h.includes("flodesk.com") || h.includes("x-flodesk")) return "Flodesk";
  if (h.includes("omnisend.com")) return "Omnisend";
  if (h.includes("brevo.com") || h.includes("sendinblue.com")) return "Brevo";
  if (h.includes("postmarkapp.com")) return "Postmark";
  if (h.includes("mailgun.org") || h.includes("mailgun.net")) return "Mailgun";
  if (h.includes("returnpath.net") || h.includes("salesforce.com") || h.includes("exacttarget.com") || h.includes("marketingcloud")) return "Salesforce Marketing Cloud";
  if (h.includes("eloqua.com")) return "Oracle Eloqua";
  if (h.includes("pardot.com")) return "Pardot";

  // ── HTML body fingerprint signals (medium confidence) ──
  // Tracking link / open-pixel host patterns are the most reliable HTML clue.
  if (!body) return undefined;

  if (body.includes("list-manage.com") || body.includes("us1.campaign-archive") || body.includes("eepurl.com")) return "Mailchimp";
  if (body.includes("trk.klclick") || body.includes("manage.kmail-lists.com") || body.includes("a.klaviyomail.com")) return "Klaviyo";
  if (body.includes("hs-analytics") || body.includes("hubspotusercontent") || body.includes("/_hcms/")) return "HubSpot";
  if (body.includes("acemlnb.com") || body.includes("acemlna.com") || body.includes("activehosted.com")) return "ActiveCampaign";
  if (body.includes("convertkit-mail") || body.includes("ck.page") || body.includes("kit.com/email")) return "ConvertKit";
  if (body.includes("links.constantcontact") || body.includes("conta.cc") || body.includes("ccsend.com")) return "Constant Contact";
  if (body.includes("e.cmail19.com") || body.includes("e.cmail20.com") || body.includes("createsend") || body.includes("cmail")) return "Campaign Monitor";
  if (body.includes("clickfunnels.com/email") || body.includes("cfmlinks.com")) return "ClickFunnels";
  if (body.includes("infusionsoft.com/app/linkClick") || body.includes("keapcrm.com")) return "Keap";
  if (body.includes("link.mailerlite.com") || body.includes("mailerlite.com/")) return "MailerLite";
  if (body.includes("drip.com/track") || body.includes("getdrip.com")) return "Drip";
  if (body.includes("aweber.com") || body.includes("send.aweber.com")) return "AWeber";
  if (body.includes("getresponse.com/click") || body.includes("getresponse-mail")) return "GetResponse";
  if (body.includes("beehiiv.com/c/") || body.includes("media.beehiiv.com")) return "beehiiv";
  if (body.includes("substackcdn.com") || body.includes("substack.com/redirect")) return "Substack";
  if (body.includes("flodesk.com/") && body.includes("track")) return "Flodesk";
  if (body.includes("omnisnd.com") || body.includes("e.omnisend.com")) return "Omnisend";
  if (body.includes("r.brevo.com") || body.includes("rsbr.us")) return "Brevo";
  if (body.includes("ontramail.com") || body.includes("ontraport-")) return "Ontraport";
  if (body.includes("exct.net") || body.includes("cl.exct") || body.includes("et.salesforce")) return "Salesforce Marketing Cloud";
  if (body.includes("pardot.com/r/") || body.includes("go.pardot")) return "Pardot";
  if (body.includes("eloqua.com/e/") || body.includes("s.eloqua")) return "Oracle Eloqua";
  if (body.includes("sendgrid.net/wf/")) return "SendGrid";

  return undefined;
}

// ── Phase 2: Analytics aggregation ──────────────────────────────────────────

import type { TrackerAnalytics, CadenceCell, VolumeBucket, TopValue } from "@shared/schema";

const STOPWORDS = new Set([
  "the","a","an","and","or","but","of","to","in","on","for","with","at","by",
  "is","are","was","were","be","been","being","have","has","had","do","does",
  "did","will","would","could","should","may","might","must","can","this",
  "that","these","those","it","its","i","you","your","my","we","our","they",
  "their","what","which","who","when","where","why","how","re","fwd","new",
]);

function emptyAnalytics(): TrackerAnalytics {
  return {
    totalEmails: 0,
    firstReceivedAt: null,
    lastReceivedAt: null,
    averageEmailsPerWeek: 0,
    busiestDayOfWeek: null,
    busiestHour: null,
    cadenceHeatmap: [],
    volumeByDay: [],
    subject: {
      avgLength: 0,
      pctEmoji: 0,
      pctAllCaps: 0,
      avgWords: 0,
      topOpeningWords: [],
      longest: null,
      shortest: null,
    },
    esp: { primary: null, confidencePct: 0, distribution: [], changeCount: 0 },
    authentication: {
      spfPassPct: 0,
      dkimPassPct: 0,
      dmarcPassPct: 0,
      listUnsubscribePct: 0,
      oneClickUnsubscribePct: 0,
      weakAuthCount: 0,
    },
    content: { avgWords: 0, avgLinks: 0, avgImages: 0, pctWithUtm: 0, topLinkDomains: [] },
  };
}

function pct(num: number, denom: number): number {
  if (!denom) return 0;
  return Math.round((num / denom) * 1000) / 10; // 1 decimal
}

function avg(nums: Array<number | null | undefined>): number {
  const valid = nums.filter((n): n is number => typeof n === "number" && !Number.isNaN(n));
  if (!valid.length) return 0;
  return Math.round((valid.reduce((s, n) => s + n, 0) / valid.length) * 10) / 10;
}

interface AnalyticsEmailRow {
  receivedAt: Date | string | null;
  subject: string | null;
  subjectLength: number | null;
  subjectHasEmoji: boolean | null;
  subjectIsAllCaps: boolean | null;
  wordCount: number | null;
  linkCount: number | null;
  imageCount: number | null;
  spfResult: string | null;
  dkimResult: string | null;
  dmarcResult: string | null;
  listUnsubscribePresent: boolean | null;
  listUnsubscribePostPresent: boolean | null;
  detectedEsp: string | null;
}

export function computeTrackerAnalytics(
  emails: AnalyticsEmailRow[],
  topLinkDomains: TopValue[],
  emailsWithUtmCount: number,
): TrackerAnalytics {
  if (!emails.length) return emptyAnalytics();

  const total = emails.length;
  const dates: Date[] = emails
    .map((e) => (e.receivedAt ? (e.receivedAt instanceof Date ? e.receivedAt : new Date(e.receivedAt)) : null))
    .filter((d): d is Date => !!d && !Number.isNaN(d.getTime()));

  const sortedAsc = [...dates].sort((a, b) => a.getTime() - b.getTime());
  const firstReceivedAt = sortedAsc[0] || null;
  const lastReceivedAt = sortedAsc[sortedAsc.length - 1] || null;

  // Cadence heatmap (7 × 24)
  const cadence = new Map<string, number>();
  const dayCounts = new Array(7).fill(0);
  const hourCounts = new Array(24).fill(0);
  for (const d of dates) {
    const dow = d.getDay();
    const hod = d.getHours();
    const key = `${dow}-${hod}`;
    cadence.set(key, (cadence.get(key) || 0) + 1);
    dayCounts[dow]++;
    hourCounts[hod]++;
  }
  const cadenceHeatmap: CadenceCell[] = [];
  for (let dow = 0; dow < 7; dow++) {
    for (let hod = 0; hod < 24; hod++) {
      const c = cadence.get(`${dow}-${hod}`) || 0;
      if (c > 0) cadenceHeatmap.push({ dayOfWeek: dow, hourOfDay: hod, count: c });
    }
  }
  const busiestDayOfWeek = dayCounts.some((c) => c > 0)
    ? dayCounts.indexOf(Math.max(...dayCounts))
    : null;
  const busiestHour = hourCounts.some((c) => c > 0)
    ? hourCounts.indexOf(Math.max(...hourCounts))
    : null;

  // Volume by day — last 90 days
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 89);
  ninetyDaysAgo.setHours(0, 0, 0, 0);
  const volumeMap = new Map<string, number>();
  for (let i = 0; i < 90; i++) {
    const d = new Date(ninetyDaysAgo);
    d.setDate(d.getDate() + i);
    volumeMap.set(d.toISOString().slice(0, 10), 0);
  }
  for (const d of dates) {
    if (d < ninetyDaysAgo) continue;
    const key = d.toISOString().slice(0, 10);
    if (volumeMap.has(key)) volumeMap.set(key, (volumeMap.get(key) || 0) + 1);
  }
  const volumeByDay: VolumeBucket[] = [...volumeMap.entries()].map(([date, count]) => ({ date, count }));

  // Average emails per week (over the active window)
  let averageEmailsPerWeek = 0;
  if (firstReceivedAt && lastReceivedAt) {
    const spanDays = Math.max(1, (lastReceivedAt.getTime() - firstReceivedAt.getTime()) / 86400000);
    const spanWeeks = Math.max(1, spanDays / 7);
    averageEmailsPerWeek = Math.round((total / spanWeeks) * 10) / 10;
  }

  // Subject stats
  const subjectLengths = emails.map((e) => e.subjectLength).filter((n): n is number => typeof n === "number");
  const emojiCount = emails.filter((e) => e.subjectHasEmoji === true).length;
  const allCapsCount = emails.filter((e) => e.subjectIsAllCaps === true).length;
  const subjectWordCounts = emails
    .map((e) => (e.subject ? e.subject.trim().split(/\s+/).filter(Boolean).length : 0))
    .filter((n) => n > 0);
  const openingWordMap = new Map<string, number>();
  for (const e of emails) {
    if (!e.subject) continue;
    const first = e.subject
      .trim()
      .toLowerCase()
      .replace(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}\W_]+/u, "")
      .split(/\s+/)[0];
    if (!first || STOPWORDS.has(first)) continue;
    openingWordMap.set(first, (openingWordMap.get(first) || 0) + 1);
  }
  const topOpeningWords: TopValue[] = [...openingWordMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([value, count]) => ({ value, count }));
  const subjectsForLength = emails
    .map((e) => e.subject)
    .filter((s): s is string => !!s && s.length > 0);
  const longest = subjectsForLength.length
    ? subjectsForLength.reduce((a, b) => (a.length >= b.length ? a : b))
    : null;
  const shortest = subjectsForLength.length
    ? subjectsForLength.reduce((a, b) => (a.length <= b.length ? a : b))
    : null;

  // ESP distribution
  const espMap = new Map<string, number>();
  for (const e of emails) {
    const v = e.detectedEsp || "Unknown";
    espMap.set(v, (espMap.get(v) || 0) + 1);
  }
  const espDistribution: TopValue[] = [...espMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([value, count]) => ({ value, count }));
  const knownEsps = espDistribution.filter((d) => d.value !== "Unknown");
  const primary = knownEsps[0]?.value || null;
  const primaryCount = knownEsps[0]?.count || 0;
  const knownTotal = knownEsps.reduce((s, d) => s + d.count, 0);
  const confidencePct = knownTotal > 0 ? pct(primaryCount, knownTotal) : 0;
  // Count ESP changes across the chronological sequence (Unknown breaks count)
  let changeCount = 0;
  let prev: string | null = null;
  for (const e of [...emails].sort((a, b) => {
    const ad = a.receivedAt ? new Date(a.receivedAt).getTime() : 0;
    const bd = b.receivedAt ? new Date(b.receivedAt).getTime() : 0;
    return ad - bd;
  })) {
    const cur = e.detectedEsp || null;
    if (cur && prev && cur !== prev) changeCount++;
    if (cur) prev = cur;
  }

  // Authentication
  const spfPass = emails.filter((e) => e.spfResult === "pass").length;
  const dkimPass = emails.filter((e) => e.dkimResult === "pass").length;
  const dmarcPass = emails.filter((e) => e.dmarcResult === "pass").length;
  const listUnsub = emails.filter((e) => e.listUnsubscribePresent === true).length;
  const oneClick = emails.filter((e) => e.listUnsubscribePostPresent === true).length;
  const weakAuthCount = emails.filter(
    (e) => e.spfResult !== "pass" || e.dkimResult !== "pass" || e.dmarcResult !== "pass",
  ).length;

  return {
    totalEmails: total,
    firstReceivedAt,
    lastReceivedAt,
    averageEmailsPerWeek,
    busiestDayOfWeek,
    busiestHour,
    cadenceHeatmap,
    volumeByDay,
    subject: {
      avgLength: avg(subjectLengths),
      pctEmoji: pct(emojiCount, total),
      pctAllCaps: pct(allCapsCount, total),
      avgWords: avg(subjectWordCounts),
      topOpeningWords,
      longest,
      shortest,
    },
    esp: { primary, confidencePct, distribution: espDistribution, changeCount },
    authentication: {
      spfPassPct: pct(spfPass, total),
      dkimPassPct: pct(dkimPass, total),
      dmarcPassPct: pct(dmarcPass, total),
      listUnsubscribePct: pct(listUnsub, total),
      oneClickUnsubscribePct: pct(oneClick, total),
      weakAuthCount,
    },
    content: {
      avgWords: avg(emails.map((e) => e.wordCount)),
      avgLinks: avg(emails.map((e) => e.linkCount)),
      avgImages: avg(emails.map((e) => e.imageCount)),
      pctWithUtm: pct(emailsWithUtmCount, total),
      topLinkDomains,
    },
  };
}
