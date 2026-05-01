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
  subtitle: "Upload a practice video, get it transcribed automatically, and receive AI-powered feedback based on the 5-part marketing video formula.",
  category: "Video Tools",
  categorySlug: "video-tools",
  readMinutes: 4,
  overview:
    "Video Score is your private practice space. Upload a short marketing video and within 1–2 minutes the AI analyzes your transcript against a proven 5-part formula — giving you a score and specific, actionable feedback for every section. Everything stays completely private — no one else can see your recordings.",
  steps: [
    {
      number: 1,
      title: "Open Video Tools from the sidebar",
      body: [
        'In the left sidebar, find the "Navigation" section and click "Video Tools". This opens the Video Tools hub — a central page showing all available video tools.',
      ],
      tip: 'The sidebar can be collapsed to icons-only to give you more screen space. Click the toggle button at the top of the sidebar to collapse or expand it.',
      illustrationKey: "sidebar-nav",
    },
    {
      number: 2,
      title: "Choose Video Score",
      body: [
        'On the Video Tools hub you\'ll see large cards for each available tool. Click the "Video Score" card — it\'s the first one on the left.',
        "This takes you to your Video Score library, where all your previous sessions are listed.",
      ],
      illustrationKey: "video-tools-hub",
    },
    {
      number: 3,
      title: "Click \"Score New Video\"",
      body: [
        'On the Video Score page, click the "Score New Video" button. The first time you visit you\'ll see the empty state below — once you have sessions they\'ll be listed here.',
        "All your sessions are saved indefinitely — you can come back and review any of them at any time.",
      ],
      note: "You can also access Video Score directly from your dashboard's quick-action cards.",
      illustrationKey: "sessions-list",
    },
    {
      number: 4,
      title: "Drag and drop your video file",
      body: [
        'You\'ll land on the "Add Video" page. Drag your video file directly onto the dashed drop zone, or click anywhere on it to open a file browser.',
        "Supported formats include MP4, MOV, WebM, AVI, and most other common video formats. Files up to 2 GB are accepted.",
      ],
      tip: "Record your video in your phone's camera app or with any screen recorder, then upload the file here. Aim for 60–90 seconds to practice all 5 formula parts.",
      illustrationKey: "upload-page",
    },
    {
      number: 5,
      title: "Confirm your file and start the analysis",
      body: [
        "Once you select a file, it appears in the drop zone with the filename and size shown. Review that it's the right file, then click the \"Upload and Analyze\" button to begin.",
        "The file is uploaded directly to secure cloud storage, then the AI pipeline starts automatically.",
      ],
      bullets: [
        "Use a quiet recording — background noise affects transcription accuracy",
        "Good audio quality matters more than video quality for scoring",
        "Try to speak clearly and at a comfortable pace",
      ],
      illustrationKey: "file-selected",
    },
    {
      number: 6,
      title: "Wait while your video uploads",
      body: [
        "A progress bar shows the upload percentage in real time. Upload speed depends on your internet connection and file size — a typical 60-second video takes under a minute.",
        "Keep the tab open during the upload. Once it reaches 100%, the processing pipeline starts automatically.",
      ],
      note: "After the upload completes, you can safely navigate away. The AI will continue processing in the background and the session will update automatically when it's done.",
      illustrationKey: "uploading",
    },
    {
      number: 7,
      title: "The AI transcribes and scores your video",
      body: [
        "Behind the scenes, three things happen in parallel after your upload:",
      ],
      bullets: [
        "Transcription — your audio is extracted and converted to text by the AI (usually 30–60 seconds)",
        "AI Scoring — once the transcript is ready, it's scored against the 5-part formula (another 20–40 seconds)",
        "Video Preview — your video is converted to a fast-loading streaming format in the background",
      ],
      note: "Full results typically appear within 1–2 minutes. The session card in your library shows a live status while it's processing.",
      illustrationKey: "processing-status",
    },
    {
      number: 8,
      title: "Review your Overall Score",
      body: [
        "Once analysis is complete, your results appear on the session page. At the top is your Overall Score — a single number from 0 to 100.",
        "The color tells you where you stand at a glance:",
      ],
      bullets: [
        "Green (80–100) — strong performance across the formula",
        "Yellow (60–79) — solid foundation with clear areas to improve",
        "Red (0–59) — significant gaps in one or more formula sections",
      ],
      illustrationKey: "overall-score",
    },
    {
      number: 9,
      title: "Read the 5-Part Formula Breakdown",
      body: [
        "Below the overall score you'll find a detailed breakdown for each of the 5 formula parts. Click any section to expand it and read the full AI feedback.",
        "The 5 parts are:",
      ],
      bullets: [
        "Hook — Did you grab attention in the first 5 seconds?",
        "Set the Hook — Did you explain why the viewer should keep watching?",
        "First CTA — Did you include an early call to action before your main content?",
        "Content — Did you deliver real value?",
        "Final CTA — Did you close with a clear, specific next step?",
      ],
      tip: "Focus on the sections with the lowest scores first. Each section shows exactly what worked, what was missing, and specific suggestions to improve.",
      illustrationKey: "formula-breakdown",
    },
    {
      number: 10,
      title: "Download your report or retranscribe",
      body: [
        'Click "Download PDF" to save a branded report with your scores and full AI feedback. Collect these over time to see your progress.',
        'If the transcription missed something or your audio was unclear, click "Retranscribe" to re-run the analysis. You can retranscribe up to 3 times per session.',
      ],
      tip: "Your Video Score library also shows a progress chart once you have multiple sessions — a great way to track your improvement over time.",
      illustrationKey: "download-report",
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
    articles: [],
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
