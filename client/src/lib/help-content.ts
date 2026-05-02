export type HelpStep = {
  number: number;
  title: string;
  body: string[];
  bullets?: string[];
  tip?: string;
  note?: string;
  warning?: string;
  illustrationKey: string;
};

export type HelpArticle = {
  slug: string;
  title: string;
  subtitle: string;
  category: string;
  categorySlug: string;
  readMinutes: number;
  overview: string;
  steps: HelpStep[];
};

export type HelpCategory = {
  slug: string;
  title: string;
  description: string;
  icon: string;
  articles: HelpArticle[];
};

// ─── Video Scoring Article ────────────────────────────────────────────────────

const videoScoringArticle: HelpArticle = {
  slug: "video-scoring",
  title: "How to Use Video Score",
  subtitle: "Upload a practice video, get it transcribed automatically, and receive AI-powered scoring and feedback based on the 5-part marketing video formula.",
  category: "Video Tools",
  categorySlug: "video-tools",
  readMinutes: 3,
  overview:
    "Video Score is your private practice space. Upload any marketing video you have recorded, and within 1–2 minutes the AI reads your transcript and scores it against a proven 5-part formula — giving you a total score, part-by-part feedback, and specific suggestions for what to fix next. Everything stays completely private.",
  steps: [
    {
      number: 1,
      title: "Go to Video Tools and open Video Score",
      body: [
        'Click "Video Tools" in the left sidebar. You\'ll land on the Video Tools hub, which shows all the available tools. Click "Open tool" under the Video Score card.',
        "This takes you to your Video Score library — a list of all your recorded practice sessions.",
      ],
      illustrationKey: "video-tools-hub",
    },
    {
      number: 2,
      title: 'Click "Score New Video"',
      body: [
        'On the Video Score page, click the blue "Score New Video" button in the top-right corner.',
        "Your past sessions are listed here so you can come back and review any of them at any time. They are saved indefinitely.",
      ],
      illustrationKey: "sessions-list",
    },
    {
      number: 3,
      title: "Upload your video file",
      body: [
        'You\'ll land on the "Add Video" page. Drag your video file onto the dashed drop zone, or click anywhere on it to open a file browser.',
        "Supported formats: MP4, MOV, WebM, MKV, AVI, WMV, and more. Maximum file size is 2 GB.",
      ],
      tip: "Record your video on your phone or computer first, then upload it here. Aim for 60–90 seconds so you can practice all five formula parts in one recording.",
      illustrationKey: "upload-page",
    },
    {
      number: 4,
      title: "Wait while the AI scores your video",
      body: [
        "After the upload completes, the AI automatically extracts your audio and converts it to a transcript. It then reads that transcript and scores it against the 5-part formula. This usually takes 1–2 minutes.",
        "When scoring is complete, your results appear on the session page. You'll see your Total Score at the top right, and the Score Summary below.",
      ],
      note: "You can safely navigate away after uploading. The AI will keep processing in the background and your results will be ready when you come back.",
      illustrationKey: "score-summary",
    },
    {
      number: 5,
      title: "Read your Score Summary",
      body: [
        "The Score Summary shows your Total Score out of 100, plus individual scores for each of the 5 formula parts. Below that is the AI Coach Summary — a plain-English overview of your performance and a short action checklist.",
        "The 5 parts and their maximum scores are:",
      ],
      bullets: [
        "Hook — 20 points: Did you grab attention in the first few seconds?",
        "Set the Hook — 20 points: Did you give viewers a reason to keep watching?",
        "First Call to Action — 20 points: Did you include an early CTA before your main content?",
        "Content — 20 points: Did you deliver clear, valuable information?",
        "Final Call to Action — 20 points: Did you close with a specific next step?",
      ],
      illustrationKey: "formula-breakdown",
    },
    {
      number: 6,
      title: "Click into any section for detailed feedback",
      body: [
        'Scroll down to "Detailed Feedback by Part." Click any of the five section rows to expand it.',
        "Each section shows you four things:",
      ],
      bullets: [
        "What Worked — the specific things you did well in that section",
        "What's Missing — exactly what was absent or weak",
        "Suggestions — concrete ways to improve that section next time",
        "Example Lines — word-for-word examples you can adapt for your own video",
      ],
      tip: "Start with the section that scored lowest — that is where you will get the most improvement from your next practice video.",
      illustrationKey: "hook-expanded",
    },
    {
      number: 7,
      title: "Download your transcript or a PDF report",
      body: [
        "Below the score sections, you'll find your full transcript. You can download it as a text file or copy it to your clipboard.",
        "To download a branded PDF report with your full scores and all AI feedback, click the \"Download PDF\" button on the session page. Collect these over time to track your improvement.",
      ],
      note: "If the transcription missed something (background noise, cropped audio), you can click \"Retranscribe\" to re-run it. You get up to 3 retranscribes per session.",
      illustrationKey: "transcript-download",
    },
  ],
};

// ─── Google Postmaster Setup Article ──────────────────────────────────────────

const googlePostmasterSetupArticle: HelpArticle = {
  slug: "google-postmaster-setup",
  title: "Setting Up Google Postmaster Tools",
  subtitle: "A step-by-step guide to adding and verifying your sending domain in Google Postmaster Tools so Academy Toolkit can pull your real sender data.",
  category: "Email Tools",
  categorySlug: "email-tools",
  readMinutes: 5,
  overview:
    "Google Postmaster Tools is a free Google product that shows you how Gmail sees your sending domain — your spam rate, whether your SPF, DKIM, and DMARC records are passing, and your overall domain health. Before Academy Toolkit can show you Sender Reputation data, you need to add and verify your domain inside Postmaster Tools. This guide walks you through every step.",
  steps: [
    {
      number: 1,
      title: "What you get when setup is done",
      body: [
        "Once your domain is set up and verified, Google Postmaster Tools gives you a Compliance Status dashboard showing exactly how your domain is doing across all of Gmail's sending requirements. You will see whether your SPF and DKIM authentication, DMARC record, encryption, spam rate, DNS records, and unsubscribe setup are all passing.",
        "The goal of this setup is to get every row in that dashboard showing Compliant. That is the screenshot below — a fully healthy sending domain.",
      ],
      note: "You need a Google Account to use Postmaster Tools. If your business uses Google Workspace (Gmail for your custom domain), use that account. A personal Gmail account also works fine.",
      illustrationKey: "postmaster-compliance",
    },
    {
      number: 2,
      title: "Sign in to Google Postmaster Tools",
      body: [
        "Open a new browser tab and go to postmaster.google.com. Google will ask you to sign in.",
        "Once signed in, you will land on the Postmaster Tools home screen. If this is your first time, the list will be empty. You will also see a Welcome dialog pop up with a Get Started button — and a red + button in the bottom right corner of the screen. Either one starts the process of adding your domain.",
      ],
      tip: "Use the Google account that controls your sending domain. This is usually the account your email service provider (like Mailchimp, ActiveCampaign, or your host) is connected to.",
      illustrationKey: "postmaster-welcome",
    },
    {
      number: 3,
      title: "Enter your domain and copy the TXT record",
      body: [
        "Click Get Started or the + button. Google will walk you through a short 3-step wizard.",
        "In step 1 you enter your sending domain — this is the part of your email address after the @ symbol. For example, if you send from hello@yourcompany.com, enter yourcompany.com.",
        "In step 2 Google gives you a TXT record that looks like this: google-site-verification=AbCdEfGhIjKlMnOpQrStUvWxYz1234567890",
        "Copy that entire value carefully. You will need to paste it into your DNS settings in the next step. Keep this browser tab open.",
      ],
      warning: "Enter the root domain only — yourcompany.com, not mail.yourcompany.com or send.yourcompany.com. Most email senders use the root domain.",
      illustrationKey: "postmaster-txt-record",
    },
    {
      number: 4,
      title: "Add the TXT record to your DNS settings",
      body: [
        "Log in to wherever your domain is registered or managed — GoDaddy, Cloudflare, Namecheap, Squarespace, or another provider. Look for a section called DNS, DNS Management, or DNS Records.",
        "Add a new TXT record with these values:",
        "Name / Host: @ (this means the root of your domain)",
        "Type: TXT",
        "Value: paste the full google-site-verification=... code you copied from Postmaster",
        "TTL: leave at default (usually 1 hour or auto)",
        "Save the record and you are done on the DNS side.",
      ],
      tip: "Not sure where your DNS is managed? Go to mxtoolbox.com, enter your domain, and run an MX Lookup. The results will show you which provider controls your DNS.",
      illustrationKey: "postmaster-dns-guide",
    },
    {
      number: 5,
      title: "Come back to Postmaster and click Verify",
      body: [
        "Go back to the Postmaster Tools browser tab. In step 3 of the wizard, click the Verify button.",
        "If Google finds the TXT record in your DNS, it will verify your domain immediately and mark it as Verified. If verification fails, wait 15–30 minutes and try again — DNS changes can take time to spread across the internet.",
        "Once verified, your domain appears in the list with a green Verified status. That is all Google needs from you — the domain is now being monitored.",
      ],
      note: "DNS changes can take up to 48 hours in rare cases. If it keeps failing, double-check that you entered the TXT value exactly as Google provided it, with no extra spaces.",
      illustrationKey: "postmaster-verified",
    },
    {
      number: 6,
      title: "Wait for data — the Spam dashboard",
      body: [
        "After your domain is verified, Google starts collecting data on your outgoing mail. It usually takes 24–48 hours for the first charts to appear. The more email you send to Gmail addresses, the faster data shows up.",
        "The Spam tab shows your user-reported spam rate over time. The yellow line is the recommended threshold (0.1%) and the red line is the policy violation threshold (0.3%). Staying well below the yellow line is your goal.",
      ],
      tip: "If you send fewer than a few hundred emails a day to Gmail addresses, some dashboards may stay empty or show No Data. That is normal — Google only displays data when enough volume is present.",
      illustrationKey: "postmaster-spam-chart",
    },
    {
      number: 7,
      title: "Check Authentication and connect to Academy Toolkit",
      body: [
        "The Authentication tab shows how much of your outgoing mail is passing DKIM, SPF, and DMARC checks. Ideally all three lines are at or near 100%.",
        "Once your domain is verified and you are starting to see data, you are ready to connect to Academy Toolkit. Go to Email Tools, open Sender Reputation, and click Connect Google Account. Your dashboard will pull in your Postmaster data automatically.",
      ],
      note: "Ready to connect? See Part 2 — How to Use Sender Reputation — for the full walkthrough of connecting your account and reading your dashboard.",
      illustrationKey: "postmaster-auth-chart",
    },
  ],
};

// ─── Sender Reputation Dashboard Article ──────────────────────────────────────

const senderReputationDashboardArticle: HelpArticle = {
  slug: "sender-reputation-dashboard",
  title: "How to Use Sender Reputation",
  subtitle: "A complete walkthrough of every section of your Sender Reputation dashboard — what each number means and how to act on it.",
  category: "Email Tools",
  categorySlug: "email-tools",
  readMinutes: 7,
  overview:
    "Once your Google account is connected, the Sender Reputation dashboard gives you a live window into how Gmail sees your sending domain. This guide walks through every section — the reputation badge, the six stat cards, the four tabs (Overview, Compliance, Action Plan, and Infrastructure) — and explains what each piece of data means so you can make confident decisions about your email program.",
  steps: [
    {
      number: 1,
      title: "Connect your Google account",
      body: [
        "Go to Email Tools in the sidebar and click Open tool under Sender Reputation. If you have not connected yet, you will see a setup card with two steps: first verify your sending domain in Google Postmaster Tools (covered in Part 1 of this guide), then click the Connect Google Postmaster button.",
        "After clicking the button you will be taken to Google to sign in and grant read-only access. Once approved, you are redirected back and the dashboard loads your domain data automatically. The green Connected badge in the header confirms the link is live, and it shows the Google account you connected.",
      ],
      tip: "You only need to connect once. After that, the dashboard stays connected and pulls fresh data whenever you click Refresh.",
      illustrationKey: "sr-p2-connect-top",
    },
    {
      number: 2,
      title: "Your Reputation Badge and Stat Cards",
      body: [
        "At the top of the dashboard you will see your overall Reputation Badge. This is Google's summary of how your domain is performing — it can be High, Medium, Low, or Bad. High means Gmail considers you a trusted sender and your emails consistently land in the inbox. Medium means your reputation is acceptable but worth watching. Low or Bad means Gmail is suspicious of your mail and deliverability is at risk.",
        "Below the badge are six stat cards showing your most recent metrics at a glance: Spam Rate (the percentage of Gmail recipients who marked your mail as spam), SPF pass rate, DKIM pass rate, DMARC pass rate, Outbound TLS encryption, and Inbound TLS encryption. Green numbers are healthy. Amber or red numbers need your attention.",
        "Use the time range selector on the right to choose how many days of data to view — options run from 7 days up to 180 days. Click Refresh any time to pull the latest data from Google.",
      ],
      note: "Google Postmaster data is always 24–48 hours delayed. The numbers you see now reflect what happened up to two days ago, not today.",
      illustrationKey: "sr-p2-dashboard-top",
    },
    {
      number: 3,
      title: "Overview tab — Spam Rate and Reputation History charts",
      body: [
        "The Overview tab is the first thing you see when the dashboard loads. It contains four charts arranged in two rows.",
        "The Spam Complaint Rate chart on the top-left plots your user-reported spam rate over time. Two reference lines mark the key thresholds: a yellow dashed line at 0.1% (Google's recommended limit) and a red dashed line at 0.3% (the policy violation level where Gmail starts blocking your emails automatically). Your goal is to stay well below the yellow line at all times. The number shown above the chart is your most recent data point.",
        "The Domain Reputation History chart on the top-right tracks how your reputation score has changed day by day. It uses a stepped line so you can clearly see when your reputation changed from one level to another. If the line is sitting at High for the whole period, your domain is in good standing.",
      ],
      tip: "If your spam rate chart shows a spike on a specific date, look back at what you sent that day. A spike almost always points to a specific email blast or subject line that people did not expect or want.",
      illustrationKey: "sr-p2-overview-charts",
    },
    {
      number: 4,
      title: "Overview tab — Authentication and Encryption charts",
      body: [
        "The second row of the Overview tab holds the Authentication Pass Rates card and the TLS Encryption card.",
        "Authentication Pass Rates shows three colored progress bars at the top — one each for SPF, DKIM, and DMARC — giving you an at-a-glance health check. Below the bars is a line chart tracking all three rates over time. The dashed green reference line at 95% is your target. All three lines should sit at or very close to 100%. If any line dips significantly, something has changed in your DNS setup or your email platform's configuration.",
        "The TLS Encryption card works the same way but for connection security. Outbound TLS shows what percentage of your emails left your server over an encrypted connection. Inbound TLS shows the same for mail arriving at Gmail. Both should be close to 100% — most modern email infrastructure is already encrypted by default.",
      ],
      note: "A drop in authentication rates does not always mean something is broken today — it can also reflect emails that were sent before a DNS record was fully propagated. Check whether the dip lines up with a recent DNS change.",
      illustrationKey: "sr-p2-auth-tls-charts",
    },
    {
      number: 5,
      title: "Compliance tab — Gmail's bulk sender requirements",
      body: [
        "Click the Compliance tab to see how your domain is doing against Google's February 2024 bulk sender requirements. This is a checklist of nine requirements organized into two groups.",
        "The first group — Verified from your data — covers the requirements the dashboard can check automatically using your Postmaster data: SPF Authentication, DKIM Signing, DMARC Policy, Spam Complaint Rate, TLS Encryption, and Valid Reverse DNS (PTR). Each row shows a Passing, Warning, Failing, or No Data badge. A passing count in the top-right corner of the card tells you at a glance how many requirements you are meeting.",
        "The second group — Requires manual verification — covers requirements that cannot be checked from Postmaster data alone: One-Click Unsubscribe, Valid Message Headers, and Separate Email Streams. These are things your email platform handles, and you need to verify them yourself in your platform settings.",
        "Click any row to expand it. The expanded view shows you what the requirement means, your current status with a specific pass rate or note, and a link to Google's own guidance on that requirement.",
      ],
      tip: "If you are a low-volume sender (under 5,000 emails per day to Gmail), the one-click unsubscribe and DMARC enforcement requirements are technically optional — but following them anyway is a best practice that improves your deliverability regardless of volume.",
      illustrationKey: "sr-p2-compliance-checklist",
    },
    {
      number: 6,
      title: "Compliance tab — expanding a requirement for details",
      body: [
        "Click any row in the compliance checklist to expand it and see more information. The expanded panel shows three things: a plain-English explanation of what the requirement actually means, your current status in green (passing) or amber/red (warning or failing) with the specific number or note, and a link to Google's official guidance page for that requirement.",
        "For example, expanding SPF Authentication shows your exact pass rate, confirms whether it meets the 95% target, and links directly to Google's page on sender authentication. Use the links to go deeper on any requirement you are not sure about.",
      ],
      illustrationKey: "sr-p2-compliance-detail",
    },
    {
      number: 7,
      title: "Action Plan tab — what to fix and how",
      body: [
        "The Action Plan tab reads all of your live data and generates a prioritized list of things to do. Issues are sorted by severity — red Action Required items come first, followed by amber Needs Attention items, and finally green Healthy items.",
        "When everything is in good shape, you will see a single green Healthy card titled 'Everything looks great — your email health is in good shape' with maintenance tips for keeping it that way.",
        "When there are problems, each card gives you a plain-English explanation of what is happening and why it matters — written so that someone who has never heard of SPF or DMARC can still understand it. Click the card to expand it and see a numbered step-by-step fix written in the same plain language. The steps tell you exactly what to do, where to go, and what to say to your email provider if you need their help.",
      ],
      note: "The Action Plan is generated fresh every time you load the page. As you fix issues and your data improves, resolved items disappear from the list automatically.",
      illustrationKey: "sr-p2-action-plan-view",
    },
    {
      number: 8,
      title: "Infrastructure tab — sending IPs and delivery errors",
      body: [
        "The Infrastructure tab shows the technical layer underneath your sending — the actual IP addresses your emails go out from and any delivery errors Gmail has reported.",
        "The Sending IP Reputation card groups your sending IPs by reputation level: High, Medium, Low, or Bad. Each row shows how many IPs fall into that category and gives a few example IP addresses. Ideally all of your IPs sit in the High bucket. If you see IPs in the Low or Bad category, your email platform is sending from shared IP pools that have been damaged by other senders — contact your platform's support team and ask to be moved to a cleaner IP pool.",
        "The Delivery Errors card aggregates any SMTP errors Gmail reported when receiving your mail — things like rate limit exceeded, spam detected, bad DMARC policy, or IP on a blocklist. In a healthy setup this card shows 'No significant delivery errors in this period.' If you do see errors, the Action Plan tab will already contain specific steps for fixing them.",
      ],
      tip: "If you do not see any data on the Infrastructure tab, it is because Google only reports IP reputation and delivery errors for domains sending 200 or more emails per day to Gmail users. Low-volume senders will see this section as empty — that is normal.",
      illustrationKey: "sr-p2-infrastructure-view",
    },
  ],
};

// ─── Video Trends Article ─────────────────────────────────────────────────────

const videoTrendsArticle: HelpArticle = {
  slug: "video-trends",
  title: "How to Use Video Trends",
  subtitle: "Find in-demand YouTube topics with real search-volume data, then turn the best ones into a complete script using Mark's 5-part formula.",
  category: "Video Tools",
  categorySlug: "video-tools",
  readMinutes: 5,
  overview:
    "Video Trends does two jobs in one place. First, it pulls real keyword data from Google, YouTube, Pinterest, and TikTok to show you what people are actually searching for around any niche or keyword. Second, once you find a topic worth recording, it generates a complete video script — Hook, Set the Hook, First CTA, Content, and Final CTA — that follows the same proven formula you score your videos against. This guide walks through every screen.",
  steps: [
    {
      number: 1,
      title: "Open Video Trends and run a search",
      body: [
        'In the sidebar, click "Video Tools" and then open Video Trends. You will land on the hub page.',
        "In the search bar at the top, type a niche or keyword you want to research — for example a product, a problem your audience faces, or a topic you have been thinking about covering. Then click Find Topics. A run typically returns 24 topic ideas with full keyword data in under a minute.",
        "If you want to bias the results toward a specific style of video, click one of the Quick filter presets — Review, Comparison, How-To, or Problem Fix — before you search. Your monthly credits are shown above the search bar so you always know how many runs you have left this month.",
      ],
      tip: "Searches that are too broad (\"marketing\") return generic topics. Searches that are too narrow (\"left-handed gardening shears for tomatoes\") may return too little data. Aim for the middle — \"affiliate marketing\" or \"claude ai tutorial\" works well.",
      illustrationKey: "vt-hub",
    },
    {
      number: 2,
      title: "Browse your results",
      body: [
        "When the run finishes you are taken to the results page. Every topic appears as its own card with four signals on the right side, so you can scan the list quickly:",
      ],
      bullets: [
        "Monthly search volume — how many people search for this exact phrase on Google each month",
        "Intent badges — How-To, Beginner Guide, Review, Comparison, and so on, so you know what kind of video the searcher is looking for",
        "Trend arrow — green up means search demand is rising, red down means it is falling, gray dash means steady",
        "Opportunity score — a 0–100 composite of volume, competition, CPC, and trend; the higher the better",
      ],
      note: "Use the Filter and Sort controls at the top of the page to narrow the list. Set a Min Score to hide weak topics, sort by Volume to find the biggest opportunities, or sort by Competition to find the easiest wins.",
      illustrationKey: "vt-explore-list",
    },
    {
      number: 3,
      title: "Click a topic to see the full data",
      body: [
        "Click any topic card to open its detail panel on the right. The panel shows you everything the keyword data revealed — your Opportunity Score with a plain-English label (Great opportunity, Good potential, or Challenging), the Google volume, CPC and competition, the trend percentage, and platform-specific data for YouTube, Pinterest, and TikTok if available.",
        "From this panel you have three actions: Generate Script turns this topic into a full 5-part video script (covered in the next step), Save adds it to your Saved Topics list to come back to later, and Research Deeper runs a brand-new search using this topic as the seed so you can branch out into related ideas.",
      ],
      tip: "Scroll down inside the side panel to see the AI-generated extras for this topic — suggested video angles, hook ideas, title ideas, and the most common questions people ask about it. These are great raw material for your script.",
      illustrationKey: "vt-topic-detail",
    },
    {
      number: 4,
      title: "Save topics for later",
      body: [
        'When you find a topic you like but are not ready to record yet, click "Save" in the side panel. Saved topics live in your Saved Topics page, which you can open from the Video Trends sidebar at any time.',
        "Saved topics are split into Active (still on your list) and Completed (you have already recorded a video for them). Mark a topic complete when you finish a video so the list stays focused on what is next.",
      ],
      illustrationKey: "vt-saved",
    },
    {
      number: 5,
      title: "Generate a script in Mark's 5-part formula",
      body: [
        'When you are ready to record, click "Generate Script" on the topic. The AI writes a complete video script in the same 5-part formula you score your videos against — Hook, Set the Hook, First CTA, Content, and Final CTA — using the keyword data, audience intent, and angles it surfaced for that topic.',
        "The script page opens with the topic stats pinned at the top so you keep the data in mind, and the script body laid out section-by-section with target durations on each part. Switch between Long Form and Shorts at the top to get a script tuned for the format you are recording.",
        "When you are happy with the script, use Copy Full Script to paste it into your teleprompter or notes app, or Download PDF to save a branded copy. The Description, Pinned Comment, and Call To Action tabs give you matching copy you can paste straight into YouTube when you upload.",
      ],
      note: "Generated scripts are saved automatically — you can come back to them from the Generated Scripts page in the Video Trends sidebar at any time.",
      illustrationKey: "vt-script-detail",
    },
  ],
};

// ─── Scripts Article ──────────────────────────────────────────────────────────

const scriptsArticle: HelpArticle = {
  slug: "scripts",
  title: "How to Use Generated Scripts",
  subtitle: "Edit, organize, and reuse the video scripts you generate from Video Trends — including matching descriptions, pinned comments, and CTAs.",
  category: "Video Tools",
  categorySlug: "video-tools",
  readMinutes: 4,
  overview:
    "Every time you click Generate Script in Video Trends, the result is saved to your Generated Scripts library so you can come back to it any time. The scripts page is where you edit the copy, switch between Long Form and Shorts versions, grab a matching YouTube description and pinned comment, plug in your offer for the CTAs, and export the final script for your teleprompter.",
  steps: [
    {
      number: 1,
      title: "Open your Generated Scripts library",
      body: [
        "From the sidebar, open Video Tools and click Generated Scripts. This page lists every script you have generated, newest first.",
        "Each card shows the script title, the date it was created, the target video length, and the same topic signals you saw in Video Trends — monthly search volume, trend arrow, and opportunity score — so you can quickly tell which scripts are still worth recording.",
        "Click any card to open the full script editor.",
      ],
      illustrationKey: "scripts-list",
    },
    {
      number: 2,
      title: "The script header — title, stats, and tools",
      body: [
        "At the top of each script you will see the title, the topic stats pinned in a row (so you keep the keyword data in mind while you edit), and two tools on the right.",
        "Teleprompter opens a full-screen scrolling teleprompter view of the long-form script — perfect for recording. Research opens a YouTube research side panel where you can search YouTube for related videos and skim titles, view counts, and top comments to gather ideas while you edit.",
        "Underneath the stats, the format tabs let you switch between Long Form, Shorts, Description, Pinned Comment, and Call To Action — each with its own copy generated from the same topic.",
      ],
      tip: "The action buttons under the tabs let you Save Script (saves your edits), Copy Full Script (copies the entire script to your clipboard), and Download PDF (a branded copy you can print or share).",
      illustrationKey: "scripts-detail",
    },
    {
      number: 3,
      title: "Edit the 5-part script section by section",
      body: [
        "The Long Form tab lays out the script in the 5-part formula — Hook, Set the Hook, First CTA, Content, and Final CTA — with a target duration on each section so you stay on time.",
        "Each of the five sections is a directly editable text area — just click into the prose and rewrite it in your own voice. The Content section is broken down further into smaller content blocks; those individual blocks have edit and delete controls so you can re-order or remove pieces.",
        "Each section also displays an On-Screen Text panel listing the text overlays the AI suggested for that part of the video — these are shown for reference while you record. Use Save Script after a round of edits so your changes are preserved the next time you open the script.",
      ],
      note: "The Shorts tab is a separate, shorter rewrite of the same topic tuned for vertical 30–60 second video — edit it independently from the Long Form version.",
      illustrationKey: "scripts-sections",
    },
    {
      number: 4,
      title: "Plug in your offer with the Call To Action tab",
      body: [
        "The Call To Action tab is where you connect your script to a real product, lead magnet, or course you want to promote.",
        "Add an offer once and Academy Toolkit will reuse it across every future script. Click Add New Offer to save a new one, or pick from the list of offers you already saved.",
        "When you have an offer set as your default, click Refresh Scripts with Default Offer to rewrite the Final CTA, the Shorts script's CTA, and the Pinned Comment to mention that specific offer. The Hook, Set the Hook, First CTA, and Content sections are left untouched so any edits you made there stay intact.",
      ],
      tip: "Saved offers are shared across all of your scripts, so updating the offer once updates it everywhere the next time you refresh.",
      illustrationKey: "scripts-cta",
    },
  ],
};

// ─── Inbox Intel Article ──────────────────────────────────────────────────────

const inboxIntelArticle: HelpArticle = {
  slug: "inbox-intel",
  title: "How to Use Inbox Intel",
  subtitle: "Spy on your competitors' email funnels by subscribing with private seed addresses, then watch every campaign get captured, classified, and compared automatically.",
  category: "Email Tools",
  categorySlug: "email-tools",
  readMinutes: 6,
  overview:
    "Inbox Intel turns your competitors' email lists into a permanent, searchable swipe file. You add a competitor, generate up to 5 unique private seed addresses on watch.fearlessmarketinglab.com, use those addresses to opt in to their lists, and from then on every email they send you is captured, parsed, and stored. The platform tells you which messages are part of an automated welcome funnel vs a one-off broadcast, what email-sending platform they use, when they send, and how their cadence is changing — across all of your tracked competitors at once.",
  steps: [
    {
      number: 1,
      title: "Add your first competitor",
      body: [
        "Open Email Tools from the sidebar and click Inbox Intel. The hub is where you manage every competitor you're watching — you can track up to 20 at once.",
        "Click Add competitor in the top-right and give the tracker a name (e.g. 'Brennan Dunn'), an optional website, and any notes you want to remember about why you're watching them.",
        "If you supply a website, Inbox Intel automatically captures a preview screenshot in the background and shows it on the tile — that's why a brand-new tracker shows 'Capturing preview…' for a few seconds.",
      ],
      tip: "The What's changed this week panel surfaces anomalies — sudden send spikes, long silences, ESP changes, and authentication regressions — across all your trackers, and the Top sends leaderboard ranks who's sending the most this week.",
      illustrationKey: "ii-hub",
    },
    {
      number: 2,
      title: "Get your private seed addresses and subscribe",
      body: [
        "Open the tracker and you'll see up to 5 personal-looking seed addresses on watch.fearlessmarketinglab.com (e.g. sarah.thompson83@..., mike.r.davis@...). They're designed to look like real personal mailboxes so opt-in forms accept them.",
        "Copy a seed address and use it to subscribe to the competitor's list — sign up for their lead magnet, newsletter, or free training the way a normal subscriber would.",
        "Click + Generate seed (with an optional label like 'Homepage opt-in' or 'Webinar') to create additional seeds. Using multiple seeds across different opt-in points helps Inbox Intel detect automated welcome series with high confidence by cross-checking what arrives at each one.",
      ],
      note: "All metrics (sender, subject, links, ESP, authentication, etc.) are kept forever. The latest 100 full-HTML email bodies are kept per tracker — older bodies are pruned automatically. Pin up to 25 emails per tracker to keep their bodies indefinitely.",
      illustrationKey: "ii-tracker-emails",
    },
    {
      number: 3,
      title: "Read sending patterns on the Analytics tab",
      body: [
        "Switch to the Analytics tab to see the rule-based fingerprint of how this competitor sends — no AI involved, every number is computed from the captured emails.",
        "The four stat tiles at the top give you the headline numbers: total emails captured, average per week, the busiest send window (day + hour), and the primary email sending platform with a confidence score.",
        "Below that, the Cadence heatmap shows every send plotted on a 7-day × 24-hour grid so you can spot when this sender prefers to send, and the Send volume chart shows daily counts over the last 90 days so you can see ramp-ups and quiet periods at a glance.",
      ],
      tip: "ESP detection combines high-confidence header signals with HTML body fingerprints across ~25 platforms — Mailchimp, Klaviyo, ConvertKit, ActiveCampaign, HubSpot, beehiiv, Substack, ClickFunnels, Keap, Drip, AWeber, and many more. The confidence percentage tells you how sure we are.",
      illustrationKey: "ii-tracker-analytics",
    },
    {
      number: 4,
      title: "Spot the welcome funnel on the Funnel tab",
      body: [
        "The Funnel tab runs a two-stage rule-based classifier on the emails captured for this tracker and tells you whether they're running an automated welcome sequence.",
        "Stage 1 is cross-seed alignment: if the same email arrives at multiple seeds at very close offsets-from-signup, it's automated with high confidence. Stage 2 fills in the rest with single-seed heuristics — first email under 30 minutes, tight cadence runs, and the gap that ends the welcome era.",
        "The verdict card shows the headline (e.g. 'Detected a 5-email welcome series over 7 days') and a confidence badge (HIGH, MEDIUM, or LOW), followed by counts of how many captured emails landed in each bucket — welcome steps, automated, broadcast, unclassified.",
      ],
      note: "Below the verdict you'll see the step-by-step welcome sequence (each step is clickable to open the email) and a per-seed timeline showing dots positioned by time-since-signup — amber for automated, violet for broadcast, gray for unclassified.",
      illustrationKey: "ii-tracker-funnel",
    },
    {
      number: 5,
      title: "Browse everyone in one stream with the Unified Feed",
      body: [
        "From the Inbox Intel hub, click View full feed to see every captured email across every competitor in one chronological stream, grouped by day.",
        "The filter bar lets you search by subject or sender, narrow to a date preset (today / 7d / 30d / 90d / all), select specific competitors, filter by detected ESP, and toggle Pinned only to see just the messages you've starred.",
        "Click the CSV button to export the filtered feed (capped at 5000 rows) for analysis in a spreadsheet, or open any email row to read the full message and pin it for permanent retention.",
      ],
      tip: "Pinning is how you build a swipe file — pinned emails are exempt from the automatic pruning that trims older HTML bodies, so the messages you actually want to study stay readable forever.",
      illustrationKey: "ii-feed",
    },
    {
      number: 6,
      title: "Compare up to 4 competitors side-by-side",
      body: [
        "From the Inbox Intel hub click Compare to open the comparison view, then use the picker to add up to 4 trackers. Selected competitors appear as removable chips at the top.",
        "Each card shows the same metrics in the same place so you can scan across them at a glance: this-week vs last-30-days activity with week-over-week change, average sends per week, total captured, primary email platform with confidence, busiest send window, subject-line style, authentication pass rates, and a one-line welcome funnel summary.",
        "Use the comparison to answer questions like who is ramping up sends, who switched ESPs recently, who has the longest welcome funnel, and whose subjects skew long, ALL CAPS, or emoji-heavy.",
      ],
      illustrationKey: "ii-compare",
    },
  ],
};

// ─── Categories ───────────────────────────────────────────────────────────────

export const helpCategories: HelpCategory[] = [
  {
    slug: "video-tools",
    title: "Video Tools",
    description: "Record, transcribe, and score your practice videos. Research trending topics and generate scripts.",
    icon: "Video",
    articles: [videoScoringArticle, videoTrendsArticle, scriptsArticle],
  },
  {
    slug: "email-tools",
    title: "Email Tools",
    description: "Analyze your emails for spam triggers, authentication, and inbox placement.",
    icon: "Mail",
    articles: [googlePostmasterSetupArticle, senderReputationDashboardArticle, inboxIntelArticle],
  },
  {
    slug: "dmo-tracker",
    title: "DMO Tracker",
    description: "Log your daily activities, track streaks, and build consistent habits.",
    icon: "Target",
    articles: [],
  },
  {
    slug: "account",
    title: "Account & Settings",
    description: "Manage your profile, theme preferences, and connected accounts.",
    icon: "Settings",
    articles: [],
  },
];

export function findArticle(slug: string): HelpArticle | undefined {
  for (const cat of helpCategories) {
    const article = cat.articles.find(a => a.slug === slug);
    if (article) return article;
  }
  return undefined;
}

export function findCategory(slug: string): HelpCategory | undefined {
  return helpCategories.find(c => c.slug === slug);
}

export function allArticles(): HelpArticle[] {
  return helpCategories.flatMap(c => c.articles);
}
