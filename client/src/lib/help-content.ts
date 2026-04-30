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
  subtitle: "Record a practice video, get it transcribed, and receive AI-powered feedback on the 5-part marketing video formula.",
  category: "Video Tools",
  categorySlug: "video-tools",
  readMinutes: 5,
  overview:
    "Video Score is your private practice studio. You record a short marketing video directly in your browser, and within 1–2 minutes the AI analyzes your transcript against a proven 5-part formula — giving you a score and specific, actionable feedback for each section. Everything stays completely private — no one else can see your recordings.",
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
        "This takes you to your Video Score library, where all your previous recorded sessions are listed.",
      ],
      illustrationKey: "video-tools-hub",
    },
    {
      number: 3,
      title: 'Click "New Session"',
      body: [
        'On the Video Score page, click the "New Session" button in the top-right corner. This opens the session setup screen where you\'ll name your session and configure your recording.',
        "All your past sessions are saved here indefinitely — you can come back and review any of them at any time.",
      ],
      note: "You can also upload a pre-recorded video file instead of recording live in the browser. Look for the upload option on the session setup screen.",
      illustrationKey: "sessions-list",
    },
    {
      number: 4,
      title: "Name your session and choose your Goal Type",
      body: [
        "Give your session a short descriptive name (e.g. \"Week 3 Sales Practice\"). If you leave the title blank, the AI will automatically generate one based on what you say in your video.",
        "Next, select your Goal Type. This is important — it tells the AI what kind of video you're recording so it can give you relevant feedback:",
      ],
      bullets: [
        "Sales Video — scored on persuasion, value proposition, objection handling, and a clear call to action",
        "Lead Generation — emphasis on the hook strength, the offer, and the opt-in incentive",
        "Education / Training — evaluated on clarity, logical structure, and credibility",
        "Recruiting — looks for opportunity framing, enthusiasm, and the invitation to learn more",
      ],
      tip: "Not sure which to choose? Pick \"Sales Video\" as a starting point — it gives the most comprehensive feedback across all formula sections.",
      illustrationKey: "goal-type-selector",
    },
    {
      number: 5,
      title: "Set up your camera and microphone",
      body: [
        "Choose your camera from the dropdown menu. The live preview updates immediately so you can frame yourself properly before recording.",
        "Choose your microphone from the second dropdown. Watch the audio level bar — it should react as you speak. If it stays flat, your microphone isn't being picked up.",
      ],
      bullets: [
        "Look directly into the camera lens, not at your own preview image",
        "Use a quiet room — background noise affects transcription accuracy",
        "Good lighting from the front makes a big difference",
      ],
      tip: "Your device selections are remembered between sessions. Once you've set them up the first time, you can go straight to recording next time.",
      illustrationKey: "device-setup",
    },
    {
      number: 6,
      title: "Record your video",
      body: [
        "Click the red Record button to start. A timer counts up so you can track your length. When you're done, click the Stop button.",
        "You'll then see a playback preview. Watch it back and decide whether to keep it or re-record. Click Submit to send it for analysis, or Re-record to try again.",
      ],
      bullets: [
        "Aim for 60–90 seconds — that's the ideal length for practicing the 5-part formula",
        "It's okay to pause or stumble — this is private practice, not a final take",
        "Try to hit all 5 formula parts: Hook → Set the Hook → First CTA → Content → Final CTA",
      ],
      warning: "Make sure your browser has permission to access your camera and microphone. If you see a permission prompt in the top bar of your browser, click Allow.",
      illustrationKey: "recording-interface",
    },
    {
      number: 7,
      title: "Wait for transcription and scoring",
      body: [
        "After you submit, the video is processed in parallel across three steps — you'll see a live status panel showing progress:",
      ],
      bullets: [
        "Transcription — the audio is extracted and sent to the AI for speech-to-text (usually 30–60 seconds)",
        "AI Scoring — once the transcript is ready, the AI scores it against the 5-part formula (another 20–40 seconds)",
        "Video Preview — your recording is converted to a fast-loading preview in the background",
      ],
      note: "Full results typically appear within 1–2 minutes. You don't need to stay on the page — you can navigate away and come back. The session will show its status in your sessions list.",
      illustrationKey: "processing-status",
    },
    {
      number: 8,
      title: "Review your Overall Score",
      body: [
        "Once analysis is complete, the results panel appears on the right side of the session view. At the top is your Overall Score — a single number from 0 to 100.",
        "The color tells you where you stand at a glance:",
      ],
      bullets: [
        "Green (80–100) — strong performance across the formula",
        "Yellow (60–79) — solid foundation, clear areas to improve",
        "Red (0–59) — significant gaps in one or more formula sections",
      ],
      illustrationKey: "overall-score",
    },
    {
      number: 9,
      title: "Read the 5-Part Formula Breakdown",
      body: [
        "Below the overall score, you'll find a card for each of the 5 formula parts. Each card shows a section score and written AI feedback — specific to your goal type and what you actually said.",
        "The 5 parts are evaluated in order:",
      ],
      bullets: [
        "Hook — Did you grab attention in the first 5 seconds?",
        "Set the Hook — Did you explain why the viewer should keep watching?",
        "First CTA — Did you include an early call to action before your content?",
        "Content — Did you deliver real value aligned with your goal type?",
        "Final CTA — Did you close with a clear, specific next step?",
      ],
      tip: "Focus on the sections with the lowest scores first. The AI feedback under each section will tell you exactly what was missing and how to fix it.",
      illustrationKey: "formula-breakdown",
    },
    {
      number: 10,
      title: "Download your report and use the Retranscribe option",
      body: [
        'Click "Download PDF" to export a branded report with your scores and full AI feedback. This is useful for tracking your progress session-over-session.',
        'If the transcription missed something or your audio was unclear, click "Retranscribe" to re-run the analysis. You can retranscribe up to 3 times per session.',
      ],
      tip: "Save your PDF reports over time and compare them. Watching your scores improve week-over-week is a great motivator.",
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
