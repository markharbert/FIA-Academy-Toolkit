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

// ─── Categories ───────────────────────────────────────────────────────────────

export const helpCategories: HelpCategory[] = [
  {
    slug: "video-tools",
    title: "Video Tools",
    description: "Record, transcribe, and score your practice videos. Research trending topics and generate scripts.",
    icon: "Video",
    articles: [videoScoringArticle],
  },
  {
    slug: "email-tools",
    title: "Email Tools",
    description: "Analyze your emails for spam triggers, authentication, and inbox placement.",
    icon: "Mail",
    articles: [googlePostmasterSetupArticle],
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

export function allArticles(): HelpArticle[] {
  return helpCategories.flatMap(c => c.articles);
}
