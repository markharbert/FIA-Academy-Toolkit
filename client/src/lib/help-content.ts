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
  subtitle: "A step-by-step guide to adding your sending domain to Google Postmaster Tools so the Sender Reputation tool can pull your real data.",
  category: "Email Tools",
  categorySlug: "email-tools",
  readMinutes: 5,
  overview:
    "Google Postmaster Tools is a free Google product that shows you how Gmail sees your sending domain. It tracks your spam rate, authentication pass rates, and domain reputation over time. Before Academy Toolkit can display your Sender Reputation data, you need to add and verify your domain inside Google Postmaster Tools. This guide walks you through every step.",
  steps: [
    {
      number: 1,
      title: "What is Google Postmaster Tools and why do you need it?",
      body: [
        "Google Postmaster Tools is a free dashboard made by Google. It shows you data about the emails you send to Gmail and Google Workspace inboxes — things like your spam rate, whether your SPF, DKIM, and DMARC records are passing, and what Google thinks of your sending domain overall.",
        "Academy Toolkit connects directly to Postmaster Tools and pulls this data into your Sender Reputation dashboard. But first, Google needs you to prove you own your sending domain. That is what the setup process below is for.",
      ],
      note: "You need a Google Account to use Postmaster Tools. If your business uses Google Workspace (Gmail for your custom domain), use that account. Otherwise a personal Gmail account works fine — as long as it is the account you will use to manage Postmaster going forward.",
      illustrationKey: "postmaster-signin",
    },
    {
      number: 2,
      title: "Sign in to Google Postmaster Tools",
      body: [
        "Open a new browser tab and go to postmaster.google.com. Sign in with the Google account you want to use.",
        "You will land on the Postmaster Tools home screen. If this is your first time, it will show an empty list with a prompt to add a domain. That is exactly where you are going next.",
      ],
      tip: "Use the Google account that your IT team or email service provider gave you access to. This does not have to be the same Google account you use for everyday email — it just needs to be the one you will use for domain management.",
      illustrationKey: "postmaster-signin",
    },
    {
      number: 3,
      title: "Add your sending domain",
      body: [
        'On the Postmaster Tools home screen, click the large blue "+" button (or the "Add domain" button if you see that instead).',
        "A small dialog will pop up asking you to enter your domain. Type in your sending domain — this is the domain that appears in your From address when you send email. For example, if you send from hello@yourcompany.com, your domain is yourcompany.com.",
        'Click "Continue." Google will then give you a TXT record — a short piece of code you need to add to your domain\'s DNS settings to prove you own it.',
      ],
      warning: "Make sure you enter the root domain (yourcompany.com), not a subdomain like mail.yourcompany.com, unless your emails are actually sent from that subdomain. Most senders use the root domain.",
      illustrationKey: "postmaster-setup-guide",
    },
    {
      number: 4,
      title: "Copy your TXT verification record",
      body: [
        "After you enter your domain, Google shows you a TXT record. It looks something like this:",
        "google-site-verification=AbCdEfGhIjKlMnOpQrStUvWxYz1234567890",
        "Copy that entire value and keep it on your clipboard or paste it into a notes app. You are going to add it to your DNS settings in the next step.",
      ],
      note: "Do not close the Postmaster Tools tab yet. After you add the TXT record to your DNS, you will come back here to click Verify.",
      illustrationKey: "postmaster-setup-guide",
    },
    {
      number: 5,
      title: "Add the TXT record to your DNS — GoDaddy",
      body: [
        "If your domain is registered with GoDaddy, here is how to add the TXT record:",
        "1. Sign in to your GoDaddy account and go to your Domain Portfolio.",
        "2. Click on your domain name to open its settings page.",
        '3. Click the "DNS" tab, then click "DNS Records."',
        '4. Click "Add New Record." Choose "TXT" as the record type.',
        '5. In the "Name" field, type @ (that means the root of your domain).',
        '6. In the "Value" field, paste the full TXT record you copied from Google.',
        '7. Leave the TTL at its default (usually 1 hour) and click "Save."',
      ],
      tip: "DNS changes can take anywhere from a few minutes to 48 hours to take effect, though GoDaddy usually updates within 10–30 minutes.",
      illustrationKey: "godaddy-dns",
    },
    {
      number: 6,
      title: "Add the TXT record — Cloudflare, Namecheap, and other providers",
      body: [
        "The process is the same regardless of where your domain is hosted. You are always looking for the DNS settings for your domain and adding a new TXT record.",
        "For Cloudflare: Log in, select your domain, go to DNS > Records, click Add Record, choose TXT, set Name to @ and paste the value from Google.",
        "For Namecheap: Log in, go to Domain List, click Manage next to your domain, click Advanced DNS, click Add New Record, choose TXT Record, set Host to @ and paste the value.",
        "For any other provider: Look for a section called DNS Management, DNS Settings, or Name Server Management. Add a new TXT record with the host set to @ (or leave it blank) and paste the Google verification value.",
      ],
      tip: "Not sure who hosts your DNS? Go to mxtoolbox.com, type in your domain, and run an MX lookup. The results will show you your DNS provider.",
      illustrationKey: "cloudflare-dns",
    },
    {
      number: 7,
      title: "Verify your domain and wait for data",
      body: [
        "Once you have added the TXT record to your DNS, go back to the Postmaster Tools tab in your browser. Click the Verify button next to your domain.",
        "If DNS has already updated, Google will confirm the domain is verified and mark it as active. If it fails, wait 15–30 minutes and try again — DNS updates are not instant.",
        "After your domain is verified, Google starts collecting data. It usually takes 24–48 hours for the first charts and scores to appear. The more email you send to Gmail addresses, the faster data will show up.",
      ],
      note: "Once your domain is verified in Postmaster Tools, head back to Academy Toolkit. Go to Email Tools, open Sender Reputation, and connect your Google account. Your dashboard will start showing data as soon as Google has enough to display.",
      tip: "Ready to connect to Academy Toolkit? See Part 2: How to Use Sender Reputation for the next steps.",
      illustrationKey: "mxtoolbox-verify",
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
