import type { Node } from "@xyflow/react";
import type { FunnelNodeData, FunnelNodeType } from "./node-types";

// ─── Per-node guidance content ───────────────────────────────────────────────

const GUIDANCE: Record<string, { tip: string; tasks: string[] }> = {
  trafficSource: {
    tip: "Your traffic source is where potential leads first encounter you. Know exactly who you're targeting — consistency and specificity win.",
    tasks: [
      "Define your ideal customer avatar (age, pain points, goals)",
      "Create 3–5 ad creatives or content pieces to test",
      "Write 2–3 variations of ad copy for A/B testing",
      "Set your daily budget and choose the right campaign objective",
      "Install your tracking pixel on all funnel pages",
      "Set up a retargeting audience based on page visits",
      "Add UTM tracking parameters to all funnel URLs",
    ],
  },
  capturePage: {
    tip: "Your capture page has ONE job: get the email. Remove every distraction. The headline is everything — it must promise a clear, specific benefit your reader already wants.",
    tasks: [
      "Write a compelling headline focused on a specific transformation or benefit",
      "Add a supporting sub-headline that reinforces the main promise",
      "Include a mockup or visual of your lead magnet",
      "Set up your opt-in form (name and/or email field)",
      "Connect your email autoresponder to the form",
      "Add a 'What You'll Get' bullet list (3–5 bullets max)",
      "Remove all navigation links — distraction-free only",
      "Add your privacy policy link (legally required)",
      "Set the redirect URL to your Thank-You page",
      "Test the opt-in flow on mobile and desktop",
    ],
  },
  thankYouPage: {
    tip: "The Thank-You page is the most underused page in a funnel. Use it to welcome your new lead, deliver what you promised, and guide them to their next step.",
    tasks: [
      "Write a 'Check your inbox' confirmation message",
      "Deliver or link directly to your lead magnet",
      "Add a short welcome video introducing yourself (60–90 seconds)",
      "Tell them what to expect from your email series",
      "Add a soft One-Time Offer (OTO) or upsell if applicable",
      "Link to your Facebook group or community",
      "Add a follow button for your primary social media platform",
    ],
  },
  salesPage: {
    tip: "Your sales page must do the heavy lifting — convince the reader your offer is the right solution to their problem. Address objections before they raise them.",
    tasks: [
      "Write a powerful headline focused on the biggest transformation",
      "Open with a story that connects with the reader's pain or desire",
      "Clearly list what they get (lead with benefits, then features)",
      "Add social proof: testimonials, case studies, or results screenshots",
      "Include a prominent Call-To-Action button with your price",
      "Add a FAQ section handling the top 5 objections",
      "Set up your payment processor and checkout page",
      "Add a money-back guarantee if applicable",
      "Test the complete checkout flow end-to-end",
      "Install conversion tracking (Facebook Pixel / Google Tag)",
    ],
  },
  videoPage: {
    tip: "A Video Sales Letter leads with video. Hook viewers in the first 10 seconds, build desire, then reveal your offer. Disable controls until the offer appears.",
    tasks: [
      "Script and record your VSL (5–15 min for lower-ticket; 20–45 min for high-ticket)",
      "Upload to Vimeo or Wistia for full playback control",
      "Disable video controls until the offer is revealed",
      "Add a 'Buy Now' button that appears at the right moment in the video",
      "Write a supporting headline above the video",
      "Add a brief text summary below the video for scanners",
      "Install conversion tracking on the page",
    ],
  },
  webinar: {
    tip: "Webinar pages convert well because they build a relationship before asking for the sale. Your registration page must promise a specific, valuable outcome.",
    tasks: [
      "Write your webinar title focused on a clear transformation",
      "List 3–5 specific outcomes attendees will leave with",
      "Set up your webinar platform (Zoom, EasyWebinar, or WebinarJam)",
      "Create your slide deck for the presentation",
      "Set up registration form and confirmation emails",
      "Build a 'show up' reminder sequence (24h and 1h before start)",
      "Prepare your offer presentation for the end of the webinar",
    ],
  },
  zoom: {
    tip: "Application / strategy call pages filter for qualified buyers. Be clear about who this call is for — and who it is NOT for. Qualify before booking.",
    tasks: [
      "Write a clear headline that states who the call is for",
      "Add 3–5 qualification questions to your application form",
      "Set up your calendar booking tool (Calendly or Acuity)",
      "Write a confirmation page with call preparation instructions",
      "Create a pre-call questionnaire for serious applicants",
      "Set up reminder emails 24 hours and 1 hour before the call",
    ],
  },
  orderForm: {
    tip: "Your order form should be as frictionless as possible. Friction at checkout costs you sales. Offer payment plans if your price is above $200.",
    tasks: [
      "Connect your payment processor (Stripe, PayPal, or similar)",
      "Write a brief order summary — clearly state what they're buying",
      "Add a security badge and SSL indicator",
      "Offer a payment plan option if the price warrants it",
      "Add an order bump (a small complementary add-on offer)",
      "Test the complete purchase flow from start to finish",
      "Set up your post-purchase confirmation and delivery email",
    ],
  },
  upsell: {
    tip: "Upsells work because the buyer is in 'yes mode.' Your upsell should be the natural next step — something that makes their original purchase more valuable.",
    tasks: [
      "Create an offer that directly complements the front-end purchase",
      "Write a headline referencing the purchase they just completed",
      "Keep the page short — one offer, one decision",
      "Include a clear 'Yes, upgrade me!' and 'No thanks' link",
      "Set up one-click order processing (no re-entering card details)",
      "Test the upsell flow through from the order form",
    ],
  },
  downsell: {
    tip: "The downsell catches people who declined the upsell. Reduce the price, strip out components, or offer a payment plan version of the same offer.",
    tasks: [
      "Create a lower-commitment version of the upsell offer",
      "Write new copy emphasizing the reduced price and core value",
      "Set up the trigger after the upsell 'No thanks' click",
      "Include a clear 'Yes, I want this!' and 'No thanks' link",
      "Test the complete OTO (One-Time Offer) sequence end-to-end",
    ],
  },
  externalLink: {
    tip: "External links in a funnel should be intentional. Verify the destination is live and matches what the visitor expects when they click.",
    tasks: [
      "Confirm the destination URL is correct and the page is live",
      "Add UTM parameters to track traffic from your funnel",
      "Ensure the linked page matches the visitor's expectations",
    ],
  },
};

const EMAIL_POSITION_TIPS: Record<number, string> = {
  1: "Day 1 — Welcome: Deliver exactly what you promised, introduce yourself warmly, and preview what's coming. This email gets the highest open rate of any in your sequence — make it count.",
  2: "Day 2 — Your story: Share your personal journey and why you do this work. People buy from people they know, like, and trust. Build that connection here before asking for anything.",
  3: "Day 3 — Teach something: Give a quick win or valuable insight. Position yourself as the authority by demonstrating your knowledge without selling yet.",
  4: "Day 4 — Social proof: Share a testimonial, case study, or transformation story from a past client or student. Let someone else's results do the persuading.",
  5: "Day 5+ — Move toward your offer: Introduce your paid offer as the natural next step. Frame it as the shortcut to results, not just another product.",
};

function getEmailTip(day: number): string {
  if (day <= 1) return EMAIL_POSITION_TIPS[1];
  if (day === 2) return EMAIL_POSITION_TIPS[2];
  if (day === 3) return EMAIL_POSITION_TIPS[3];
  if (day === 4) return EMAIL_POSITION_TIPS[4];
  return EMAIL_POSITION_TIPS[5];
}

// ─── HTML helpers ─────────────────────────────────────────────────────────────

function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function checkbox(done: boolean, label: string): string {
  return `<div class="task${done ? " task-done" : ""}">
    <div class="task-check">${done ? "✓" : ""}</div>
    <div class="task-label">${esc(label)}</div>
  </div>`;
}

function statusBadge(done: boolean): string {
  return done
    ? `<span class="badge badge-done">✓ Complete</span>`
    : `<span class="badge badge-todo">To Do</span>`;
}

function sectionHeader(emoji: string, title: string, color: string, bg: string): string {
  return `<div class="section-header" style="background:${bg};color:${color}">${emoji}&nbsp;&nbsp;${esc(title)}</div>`;
}

// ─── Node card builders ───────────────────────────────────────────────────────

function buildTrafficCard(nd: FunnelNodeData): string {
  const platforms = [
    ...((nd.trafficPlatforms as string[] | undefined) ?? []),
    ...((nd.trafficPlatform as string | undefined) ? [nd.trafficPlatform as string] : []),
  ];
  const unique = [...new Set(platforms)].filter(Boolean);
  const g = GUIDANCE.trafficSource;
  return `<div class="node-card">
    <div class="node-card-header">
      <span class="node-card-title">${esc(nd.label ?? "Traffic Source")}</span>
      ${statusBadge(unique.length > 0)}
    </div>
    ${unique.length > 0 ? `<div class="meta-row">📣 Platforms: ${unique.map(p => esc(p)).join(", ")}</div>` : ""}
    <div class="tip-row">${esc(g.tip)}</div>
    <div class="tasks">${g.tasks.map(t => checkbox(false, t)).join("")}</div>
  </div>`;
}

function buildPageCard(nd: FunnelNodeData): string {
  const type = nd.nodeType as string;
  const g = GUIDANCE[type] ?? GUIDANCE.externalLink;
  const url = ((nd.pageUrl as string | undefined) ?? "").trim();
  const desc = ((nd.description as string | undefined) ?? "").trim();
  const hasUrl = !!url;
  return `<div class="node-card">
    <div class="node-card-header">
      <span class="node-card-title">${esc(nd.label ?? type)}</span>
      ${statusBadge(hasUrl)}
    </div>
    ${hasUrl ? `<div class="meta-row">🔗 <a href="${esc(url)}" target="_blank">${esc(url)}</a></div>` : ""}
    ${desc ? `<div class="meta-row" style="font-style:normal;color:#374151"><strong>Your description:</strong> ${esc(desc)}</div>` : ""}
    <div class="tip-row">${esc(g.tip)}</div>
    <div class="tasks">
      ${checkbox(hasUrl, "Build / confirm your page is live and accessible")}
      ${g.tasks.map(t => checkbox(false, t)).join("")}
    </div>
  </div>`;
}

function buildEmailCard(nd: FunnelNodeData, index: number): string {
  const day = (nd.emailDay as number | undefined) ?? (index + 1);
  const subject = ((nd.emailSubject as string | undefined) ?? "").trim();
  const body = ((nd.emailBody as string | undefined) ?? "").trim();
  const hasSubject = !!subject;
  const hasBody = !!body;
  const wordCount = body ? body.split(/\s+/).filter(Boolean).length : 0;
  const tip = getEmailTip(day);
  return `<div class="node-card">
    <div class="node-card-header">
      <span class="node-card-title">${esc(nd.label ?? `Email ${index + 1}`)} <span class="day-label">Day ${day}</span></span>
      ${statusBadge(hasSubject && hasBody)}
    </div>
    ${hasSubject ? `<div class="meta-row">✉️ <strong>Subject:</strong> ${esc(subject)}</div>` : ""}
    ${hasBody ? `<div class="meta-row">📝 <strong>Body:</strong> ${wordCount} words written</div>` : ""}
    <div class="tip-row">${esc(tip)}</div>
    <div class="tasks">
      ${checkbox(hasSubject, "Write your subject line (aim for curiosity, urgency, or a clear benefit)")}
      ${checkbox(hasSubject, "Write your preview text / preheader (40–90 characters)")}
      ${checkbox(hasBody, "Write your email body")}
      ${checkbox(false, "Include one clear call-to-action link")}
      ${checkbox(false, "Add personalization with a first name merge tag")}
      ${checkbox(false, "Schedule in your autoresponder at the correct delay")}
      ${checkbox(false, "Send a test to yourself and check formatting on mobile")}
    </div>
  </div>`;
}

function buildSmsCard(nd: FunnelNodeData, index: number): string {
  const day = (nd.smsDay as number | undefined) ?? (index + 1);
  const body = ((nd.smsBody as string | undefined) ?? "").trim();
  const hasBody = !!body;
  const charCount = body.length;
  const singleSegment = charCount <= 160;
  return `<div class="node-card">
    <div class="node-card-header">
      <span class="node-card-title">${esc(nd.label ?? `SMS ${index + 1}`)} <span class="day-label">Day ${day}</span></span>
      ${statusBadge(hasBody)}
    </div>
    ${hasBody ? `<div class="meta-row">💬 ${charCount} characters${!singleSegment ? " <strong style='color:#dc2626'>(over 160 — splits into multiple messages)</strong>" : " <span style='color:#16a34a'>(✓ single message)</span>"}</div>` : ""}
    <div class="tip-row">Keep SMS messages short, personal, and direct. Include the subscriber's first name, state one clear goal, and link to one URL. Aim for under 160 characters.</div>
    <div class="tasks">
      ${checkbox(hasBody, "Write your SMS message body")}
      ${checkbox(hasBody && singleSegment, "Keep under 160 characters (single message segment)")}
      ${checkbox(false, "Include subscriber's first name if your platform supports merge tags")}
      ${checkbox(false, "Include one clear, shortened URL")}
      ${checkbox(false, "Schedule in your SMS platform at the correct send delay")}
      ${checkbox(false, "Confirm subscribers have opted in to receive SMS (TCPA / GDPR compliance)")}
    </div>
  </div>`;
}

// ─── CSS ──────────────────────────────────────────────────────────────────────

const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#fff;color:#111827;font-size:13px;line-height:1.55;padding:36px;max-width:820px;margin:0 auto}
.header{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #4f46e5;padding-bottom:16px;margin-bottom:20px}
.header-title{font-size:22px;font-weight:800;color:#111827}
.header-sub{font-size:11px;color:#6b7280;margin-top:3px}
.header-meta{text-align:right;font-size:11px;color:#9ca3af;line-height:1.9}
.summary-bar{display:flex;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;margin-bottom:28px}
.summary-item{flex:1;text-align:center;padding:13px 8px;border-right:1px solid #e5e7eb}
.summary-item:last-child{border-right:none}
.summary-num{font-size:24px;font-weight:800;color:#4f46e5}
.summary-label{font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;margin-top:2px}
.section{margin-bottom:30px}
.section-header{display:flex;align-items:center;padding:8px 13px;border-radius:7px;margin-bottom:12px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em}
.node-card{border:1px solid #e5e7eb;border-radius:9px;margin-bottom:13px;overflow:hidden;break-inside:avoid;page-break-inside:avoid}
.node-card-header{padding:10px 15px;display:flex;justify-content:space-between;align-items:center;background:#f9fafb;border-bottom:1px solid #e5e7eb}
.node-card-title{font-weight:700;font-size:13px;color:#111827}
.day-label{font-weight:400;color:#6b7280;font-size:12px;margin-left:6px}
.badge{font-size:10px;padding:2px 9px;border-radius:9999px;font-weight:600;flex-shrink:0}
.badge-done{background:#d1fae5;color:#065f46}
.badge-todo{background:#fee2e2;color:#991b1b}
.meta-row{padding:5px 15px;font-size:11px;color:#374151;border-bottom:1px solid #f3f4f6;background:#f9fafb}
.meta-row a{color:#4f46e5;text-decoration:none}
.tip-row{padding:9px 15px;font-size:11px;color:#4b5563;font-style:italic;line-height:1.65;border-bottom:1px solid #f3f4f6;background:#fafaff}
.tasks{padding:11px 15px}
.task{display:flex;align-items:flex-start;gap:9px;margin-bottom:7px}
.task-check{width:14px;height:14px;border:1.5px solid #d1d5db;border-radius:3px;flex-shrink:0;margin-top:1px;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:transparent}
.task-done .task-check{border-color:#10b981;background:#10b981;color:#fff}
.task-label{font-size:12px;color:#374151;flex:1;line-height:1.5}
.task-done .task-label{color:#9ca3af;text-decoration:line-through}
.note-card{border:2px solid #fde68a;border-radius:9px;background:#fffbeb;padding:13px 15px;margin-bottom:11px}
.note-title{font-weight:700;font-size:12px;color:#92400e;margin-bottom:5px}
.note-body{font-size:12px;color:#78350f;line-height:1.65}
.footer{text-align:center;color:#d1d5db;font-size:10px;margin-top:32px;padding-top:16px;border-top:1px solid #f3f4f6}
@media print{body{padding:16px;font-size:11px}.node-card,.section{break-inside:avoid;page-break-inside:avoid}}
`;

// ─── Main export function ─────────────────────────────────────────────────────

export function exportChecklist(nodes: Node[], funnelName: string): void {
  const PAGE_TYPES: FunnelNodeType[] = [
    "capturePage", "thankYouPage", "salesPage", "videoPage",
    "webinar", "zoom", "orderForm", "upsell", "downsell", "externalLink",
  ];

  const nd = (n: Node) => n.data as FunnelNodeData;

  const trafficNodes = nodes.filter(n => nd(n).nodeType === "trafficSource");
  const pageNodes    = nodes.filter(n => PAGE_TYPES.includes(nd(n).nodeType as FunnelNodeType));
  const emailNodes   = nodes
    .filter(n => nd(n).nodeType === "emailNode")
    .sort((a, b) => ((nd(a).emailDay as number) ?? 999) - ((nd(b).emailDay as number) ?? 999));
  const smsNodes     = nodes
    .filter(n => nd(n).nodeType === "smsNode")
    .sort((a, b) => ((nd(a).smsDay as number) ?? 999) - ((nd(b).smsDay as number) ?? 999));
  const noteNodes    = nodes.filter(n => nd(n).nodeType === "note");

  const doneItems =
    emailNodes.filter(n => nd(n).emailSubject && nd(n).emailBody).length * 2 +
    pageNodes.filter(n => nd(n).pageUrl).length;
  const totalItems =
    trafficNodes.length * 7 +
    pageNodes.reduce((acc, n) => acc + 1 + (GUIDANCE[nd(n).nodeType as string]?.tasks.length ?? 5), 0) +
    emailNodes.length * 7 +
    smsNodes.length * 6;

  const dateStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  const trafficSection = trafficNodes.length > 0 ? `
    <div class="section">
      ${sectionHeader("📣", "Traffic Sources", "#0369a1", "#e0f2fe")}
      ${trafficNodes.map(n => buildTrafficCard(nd(n))).join("")}
    </div>` : "";

  const pagesSection = pageNodes.length > 0 ? `
    <div class="section">
      ${sectionHeader("📄", "Funnel Pages", "#6d28d9", "#ede9fe")}
      ${pageNodes.map(n => buildPageCard(nd(n))).join("")}
    </div>` : "";

  const emailsSection = emailNodes.length > 0 ? `
    <div class="section">
      ${sectionHeader("✉️", "Email Sequence", "#0e7490", "#cffafe")}
      ${emailNodes.map((n, i) => buildEmailCard(nd(n), i)).join("")}
    </div>` : "";

  const smsSection = smsNodes.length > 0 ? `
    <div class="section">
      ${sectionHeader("💬", "SMS Sequence", "#065f46", "#d1fae5")}
      ${smsNodes.map((n, i) => buildSmsCard(nd(n), i)).join("")}
    </div>` : "";

  const notesSection = noteNodes.length > 0 ? `
    <div class="section">
      ${sectionHeader("📝", "Canvas Notes", "#92400e", "#fef3c7")}
      ${noteNodes.map(n => {
        const title = nd(n).label || "Note";
        const rawHtml = (nd(n).notes as string | undefined) ?? "";
        const content = rawHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || "(empty)";
        return `<div class="note-card">
          <div class="note-title">${esc(title)}</div>
          <div class="note-body">${esc(content)}</div>
        </div>`;
      }).join("")}
    </div>` : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${esc(funnelName)} — Funnel Launch Checklist</title>
  <style>${CSS}</style>
  <script>
    window.onload = function() {
      setTimeout(function() { window.print(); }, 400);
    };
    window.onafterprint = function() {
      window.close();
    };
  </script>
</head>
<body>

  <div class="header">
    <div>
      <div class="header-title">🚀 ${esc(funnelName)}</div>
      <div class="header-sub">Funnel Launch Checklist &nbsp;·&nbsp; Academy Toolkit</div>
    </div>
    <div class="header-meta">
      Generated ${dateStr}<br>
      ${trafficNodes.length} traffic · ${pageNodes.length} pages · ${emailNodes.length} emails${smsNodes.length > 0 ? ` · ${smsNodes.length} SMS` : ""}
    </div>
  </div>

  <div class="summary-bar">
    <div class="summary-item">
      <div class="summary-num">${trafficNodes.length}</div>
      <div class="summary-label">Traffic Sources</div>
    </div>
    <div class="summary-item">
      <div class="summary-num">${pageNodes.length}</div>
      <div class="summary-label">Funnel Pages</div>
    </div>
    <div class="summary-item">
      <div class="summary-num">${emailNodes.length}</div>
      <div class="summary-label">Emails</div>
    </div>
    ${smsNodes.length > 0 ? `<div class="summary-item"><div class="summary-num">${smsNodes.length}</div><div class="summary-label">SMS</div></div>` : ""}
    <div class="summary-item">
      <div class="summary-num" style="color:#10b981">${doneItems}</div>
      <div class="summary-label">Items Done</div>
    </div>
    <div class="summary-item">
      <div class="summary-num" style="color:#ef4444">${Math.max(0, totalItems - doneItems)}</div>
      <div class="summary-label">Items Left</div>
    </div>
  </div>

  ${trafficSection}
  ${pagesSection}
  ${emailsSection}
  ${smsSection}
  ${notesSection}

  <div class="footer">
    Academy Toolkit &nbsp;·&nbsp; ${esc(funnelName)} &nbsp;·&nbsp; ${dateStr}
  </div>

</body>
</html>`;

  const win = window.open("", "_blank");
  if (!win) {
    alert("Please allow pop-ups for this site to open the checklist PDF.");
    return;
  }
  win.document.write(html);
  win.document.close();
}
