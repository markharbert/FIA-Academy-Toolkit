import { ImapFlow } from "imapflow";
import type { PlacementResult, PlacementStatus } from "./gmailOAuth";
import { decryptApiKey } from "./storage";

const MIN_AGE_FOR_BROAD_SEARCH_MS = 25 * 60 * 1000;

function sanitizeForImap(s: string): string {
  const MAX = 70;
  let out = s
    .replace(/["\\[\]{}()|<>^~*?]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (out.length > MAX) {
    out = out.substring(0, MAX);
    const lastSpace = out.lastIndexOf(" ");
    if (lastSpace > MAX / 2) out = out.substring(0, lastSpace);
  }
  return out.trim();
}

type ImapCriteria = {
  from?: string;
  subject?: string;
  since?: Date;
  before?: Date;
  header?: [string, string];
};

// Search a mailbox and return matching UIDs (empty array = not found or mailbox missing)
async function searchMailbox(
  client: ImapFlow,
  mailbox: string,
  criteria: ImapCriteria
): Promise<number[]> {
  try {
    const lock = await client.getMailboxLock(mailbox);
    try {
      const result = await client.search(criteria as any, { uid: true });
      return result || [];
    } finally {
      lock.release();
    }
  } catch {
    return [];
  }
}

// Derive PlacementStatus from a set of Gmail X-GM-LABELS strings.
function categoryFromLabels(labels: Set<string> | undefined): PlacementStatus {
  if (!labels || labels.size === 0) return "primary";
  const lbls = [...labels].map((l: string) => l.toLowerCase());
  if (lbls.some(l => l.includes("category_promotions"))) return "promotions";
  if (lbls.some(l => l.includes("category_social")))     return "social";
  if (lbls.some(l => l.includes("category_updates")))    return "updates";
  if (lbls.some(l => l.includes("category_forums")))     return "forums";
  return "primary";
}

// Open INBOX, search for matching emails, return category derived from Gmail labels.
// Returns null if nothing found.
async function getInboxCategory(
  client: ImapFlow,
  criteria: ImapCriteria,
  tag: string
): Promise<PlacementStatus | null> {
  const lock = await client.getMailboxLock("INBOX");
  try {
    const uids = (await client.search(criteria as any, { uid: true })) || [];
    if (uids.length === 0) return null;

    const uid = uids[uids.length - 1];

    // Primary attempt: fetchOne with labels
    let labelsSet: Set<string> | undefined;
    const msg = await client.fetchOne(uid.toString(), { labels: true }, { uid: true });
    if (msg) labelsSet = msg.labels;

    // Fallback: if fetchOne didn't populate labels, try the fetch iterator
    if (!labelsSet || labelsSet.size === 0) {
      for await (const m of client.fetch(uid.toString(), { labels: true }, { uid: true })) {
        labelsSet = m.labels;
        break;
      }
    }

    console.log(`${tag} UID ${uid} labels:`, labelsSet ? [...labelsSet] : "undefined/empty");
    return categoryFromLabels(labelsSet);
  } finally {
    lock.release();
  }
}

// Discover which Gmail category mailboxes this account exposes via IMAP.
// Gmail only shows these when tabs are enabled in Gmail → Settings → Labels → Show in IMAP.
// Returns a map of PlacementStatus → actual mailbox path.
async function discoverCategoryMailboxes(
  client: ImapFlow,
  tag: string
): Promise<Map<PlacementStatus, string>> {
  const result = new Map<PlacementStatus, string>();
  try {
    const list = await client.list();
    const paths = list.map(m => m.path);
    console.log(`${tag} IMAP mailboxes:`, paths.join(" | "));
    for (const mbx of list) {
      const p = mbx.path.toLowerCase();
      if (p.includes("promot") && !result.has("promotions")) result.set("promotions", mbx.path);
      else if (p.includes("social") && !result.has("social"))     result.set("social",      mbx.path);
      else if (p.includes("update") && !result.has("updates"))    result.set("updates",     mbx.path);
      else if (p.includes("forum")  && !result.has("forums"))     result.set("forums",      mbx.path);
    }
    if (result.size > 0) {
      console.log(`${tag} category mailboxes found:`, [...result.entries()].map(([k, v]) => `${k}="${v}"`).join(", "));
    } else {
      console.log(`${tag} no Gmail category mailboxes visible in IMAP (tabs may not be exposed)`);
    }
  } catch (err: any) {
    console.warn(`${tag} mailbox list error:`, err?.message);
  }
  return result;
}

// ─── Main placement checker ───────────────────────────────────────────────────
export async function checkGmailPlacementImap(
  inbox: {
    id: string;
    label: string;
    email: string;
    provider: string;
    imapPassword: string | null;
  },
  senderAddress: string,
  context?: {
    receivedAt?: Date | null;
    subject?: string | null;
    messageId?: string | null;
  }
): Promise<PlacementResult> {
  const base: Omit<PlacementResult, "status"> = {
    inboxId:   inbox.id,
    label:     inbox.label,
    email:     inbox.email,
    provider:  inbox.provider,
    checkedAt: new Date().toISOString(),
  };

  if (!inbox.imapPassword) return { ...base, status: "not_connected" };

  let password: string;
  try {
    password = decryptApiKey(inbox.imapPassword);
  } catch {
    console.error(`[IMAP] Failed to decrypt password for ${inbox.email}`);
    return { ...base, status: "error" };
  }

  const client = new ImapFlow({
    host:   "imap.gmail.com",
    port:   993,
    secure: true,
    auth:   { user: inbox.email, pass: password },
    logger: false,
  });

  try {
    await client.connect();

    const safeSender  = senderAddress.replace(/["\\]/g, "");
    const safeSubject = context?.subject ? sanitizeForImap(context.subject) : null;
    const emailAgeMs  = context?.receivedAt
      ? Date.now() - new Date(context.receivedAt).getTime()
      : Infinity;
    const tag = `[IMAP] ${inbox.email} |`;

    // Discover category mailboxes once per connection — used as a cross-check
    // when X-GM-LABELS returns empty (which happens on some Gmail accounts).
    const categoryMailboxes = await discoverCategoryMailboxes(client, tag);

    // Build the cascade of criteria sets
    const criteriaList: ImapCriteria[] = [];

    // S1: Message-ID exact header match
    if (context?.messageId) {
      const safeId = context.messageId.replace(/['"\\<> ]/g, "");
      criteriaList.push({ header: ["Message-ID", safeId] });
    }

    // S2: subject + sender + tight date window (day-of → day+2)
    if (context?.receivedAt && safeSubject) {
      const received     = new Date(context.receivedAt);
      const dayOf        = new Date(Date.UTC(received.getUTCFullYear(), received.getUTCMonth(), received.getUTCDate()));
      const twoDaysLater = new Date(dayOf.getTime() + 2 * 24 * 60 * 60 * 1000);
      criteriaList.push({ from: safeSender, subject: safeSubject, since: dayOf, before: twoDaysLater });
    }

    // S2B: subject + sender + wider window (day-1 → day+3)
    if (context?.receivedAt && safeSubject) {
      const received       = new Date(context.receivedAt);
      const dayBefore      = new Date(received.getTime() - 24 * 60 * 60 * 1000);
      const threeDaysAfter = new Date(received.getTime() + 3 * 24 * 60 * 60 * 1000);
      criteriaList.push({ from: safeSender, subject: safeSubject, since: dayBefore, before: threeDaysAfter });
    }

    // S3: last resort — no date filter, gated at 25 min for Gmail indexing
    if (emailAgeMs >= MIN_AGE_FOR_BROAD_SEARCH_MS) {
      if (safeSubject) {
        criteriaList.push({ from: safeSender, subject: safeSubject });
      } else if (context?.receivedAt) {
        const received       = new Date(context.receivedAt);
        const dayBefore      = new Date(received.getTime() - 24 * 60 * 60 * 1000);
        const threeDaysAfter = new Date(received.getTime() + 3 * 24 * 60 * 60 * 1000);
        console.log(`${tag} no subject — date-anchored sender fallback`);
        criteriaList.push({ from: safeSender, since: dayBefore, before: threeDaysAfter });
      }
    }

    if (criteriaList.length === 0) {
      console.log(`${tag} email too recent for broad search — not_found (will retry)`);
      return { ...base, status: "not_found" };
    }

    for (let i = 0; i < criteriaList.length; i++) {
      const criteria = criteriaList[i];

      // Always check spam first — if found in spam, stop immediately
      const spamUids = await searchMailbox(client, "[Gmail]/Spam", criteria);
      if (spamUids.length > 0) {
        console.log(`${tag} S${i + 1} → found in SPAM`);
        return { ...base, status: "spam" };
      }

      // Check INBOX and get category from Gmail X-GM-LABELS
      let category: PlacementStatus | null = null;
      try {
        category = await getInboxCategory(client, criteria, `${tag} S${i + 1}`);
      } catch (err: any) {
        console.warn(`${tag} S${i + 1} inbox label fetch error:`, err?.message);
      }

      if (category) {
        // X-GM-LABELS returned "primary" — but on some accounts those labels come
        // back empty even for Promotions emails.  Cross-check by searching the
        // actual category mailboxes (only exist when tabs are exposed in IMAP).
        if (category === "primary" && categoryMailboxes.size > 0) {
          for (const [status, mailboxPath] of categoryMailboxes) {
            const catUids = await searchMailbox(client, mailboxPath, criteria);
            if (catUids.length > 0) {
              console.log(`${tag} S${i + 1} → X-GM-LABELS said primary but found in "${mailboxPath}" → overriding to ${status}`);
              category = status;
              break;
            }
          }
        }

        console.log(`${tag} S${i + 1} → found in INBOX as ${category}`);
        return { ...base, status: category };
      }

      console.log(`${tag} S${i + 1} → not found — ${i < criteriaList.length - 1 ? "trying next strategy" : "giving up"}`);
    }

    return { ...base, status: "not_found" };

  } catch (err: any) {
    const msg = err?.message ?? String(err);
    console.error(`[IMAP] Error checking ${inbox.email}:`, msg);
    if (msg.includes("AUTHENTICATIONFAILED") || msg.includes("Invalid credentials")) {
      console.warn(`[IMAP] Auth failed for ${inbox.email} — verify App Password and that IMAP is enabled`);
    }
    return { ...base, status: "error" };
  } finally {
    try { await client.logout(); } catch { /* ignore */ }
  }
}

// ─── Verify an App Password without saving it ─────────────────────────────────
export async function verifyImapConnection(
  email: string,
  plainPassword: string
): Promise<{ success: boolean; error?: string }> {
  const client = new ImapFlow({
    host:   "imap.gmail.com",
    port:   993,
    secure: true,
    auth:   { user: email, pass: plainPassword },
    logger: false,
  });

  try {
    await client.connect();
    await client.logout();
    return { success: true };
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    if (msg.includes("AUTHENTICATIONFAILED") || msg.includes("Invalid credentials")) {
      return {
        success: false,
        error: "Authentication failed. Make sure IMAP is enabled in Gmail settings and the App Password is correct.",
      };
    }
    return { success: false, error: msg };
  }
}
