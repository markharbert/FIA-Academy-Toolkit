import { useLocation } from "wouter";
import { Video, TrendingUp, FileText, MonitorPlay, ArrowRight, Clapperboard, ChevronDown, type LucideIcon } from "lucide-react";

interface StageItem {
  step: number;
  title: string;
  description: string;
  detail: string;
  url: string;
  icon: LucideIcon;
  gradient: string;
  iconBg: string;
  testId: string;
}

const PIPELINE_STAGES: StageItem[] = [
  {
    step: 1,
    title: "Research",
    description: "Find your winning topic",
    detail: "Discover high-demand YouTube topics using real search data. Uncover keyword opportunity scores, monthly volume, and trend direction before your competitors do.",
    url: "/video-studio/research",
    icon: TrendingUp,
    gradient: "from-blue-500 to-cyan-600",
    iconBg: "bg-blue-500/20",
    testId: "stage-research",
  },
  {
    step: 2,
    title: "Script",
    description: "Build your 5-part formula script",
    detail: "Turn your research into a fully written video script. AI generates your Hook, Set the Hook, CTAs, Content sections, Shorts version, and YouTube description — all at once.",
    url: "/video-studio/scripts",
    icon: FileText,
    gradient: "from-teal-500 to-emerald-600",
    iconBg: "bg-teal-500/20",
    testId: "stage-scripts",
  },
  {
    step: 3,
    title: "Record",
    description: "Practice and deliver your script",
    detail: "Use the distraction-free teleprompter to scroll your script while you record. Works with AI-generated scripts or any script you write yourself — paste or upload a .txt file.",
    url: "/video-studio/record",
    icon: MonitorPlay,
    gradient: "from-violet-500 to-purple-600",
    iconBg: "bg-violet-500/20",
    testId: "stage-record",
  },
];

export default function VideoStudioPage() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-background">
      {/* Hero header */}
      <div className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 bg-gradient-to-br from-[hsl(220_70%_8%)] to-[hsl(345_55%_16%)]" />
        <div className="absolute -bottom-24 -right-12 h-72 w-72 rounded-full bg-rose-500/20 blur-3xl" />
        <div className="absolute -top-16 -left-8 h-64 w-64 rounded-full bg-violet-500/10 blur-3xl" />
        <div className="relative max-w-6xl mx-auto px-6 py-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-xl bg-rose-500/20 ring-1 ring-rose-400/30 flex items-center justify-center">
              <Clapperboard className="h-5 w-5 text-rose-300" />
            </div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Video Studio</h1>
          </div>
          <p className="text-white/60 text-sm mt-1.5 max-w-xl">
            Research a topic, build your script, then record — all in one place.
          </p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 space-y-12">

        {/* ─── Zone 1: Workflow Pipeline ─── */}
        <section>
          <div className="flex items-center gap-3 mb-7">
            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">The Workflow</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <div className="flex flex-col md:flex-row items-stretch gap-0">
            {PIPELINE_STAGES.map((stage, idx) => {
              const Icon = stage.icon;
              return (
                <div key={stage.url} className="flex flex-col md:flex-row items-stretch flex-1 min-w-0">
                  <button
                    onClick={() => setLocation(stage.url)}
                    data-testid={stage.testId}
                    className="group relative text-left rounded-2xl border border-border bg-card p-6 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring flex-1 min-w-0"
                  >
                    <div className={`absolute inset-x-0 top-0 h-1 rounded-t-2xl bg-gradient-to-r ${stage.gradient}`} />

                    <div className="flex items-start justify-between mb-4 mt-1">
                      <div className={`w-11 h-11 rounded-xl ${stage.iconBg} flex items-center justify-center`}>
                        <div className={`bg-gradient-to-br ${stage.gradient} rounded-lg w-9 h-9 flex items-center justify-center`}>
                          <Icon className="h-5 w-5 text-white" />
                        </div>
                      </div>
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-gradient-to-r ${stage.gradient} text-white`}>
                        Step {stage.step}
                      </span>
                    </div>

                    <h2 className="text-base font-bold text-foreground mb-0.5">{stage.title}</h2>
                    <p className="text-xs font-medium text-muted-foreground mb-3">{stage.description}</p>
                    <p className="text-sm text-muted-foreground leading-relaxed">{stage.detail}</p>

                    <div className="flex items-center justify-between mt-5">
                      <span className={`text-sm font-semibold bg-gradient-to-r ${stage.gradient} bg-clip-text text-transparent`}>
                        Open
                      </span>
                      <ArrowRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground/70 group-hover:translate-x-1 transition-all duration-200" />
                    </div>
                  </button>

                  {idx < PIPELINE_STAGES.length - 1 && (
                    <>
                      <div className="hidden md:flex items-center justify-center px-3 shrink-0 text-muted-foreground/25">
                        <ArrowRight className="h-5 w-5" />
                      </div>
                      <div className="flex md:hidden items-center justify-center py-2 text-muted-foreground/25">
                        <ChevronDown className="h-5 w-5" />
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* ─── Zone 2: Standalone Tool ─── */}
        <section>
          <div className="flex items-center gap-3 mb-7">
            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">After your video is recorded</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <div className="max-w-xs">
            <button
              onClick={() => setLocation("/video-score")}
              data-testid="tool-video-score"
              className="group relative text-left w-full rounded-2xl border border-border bg-card p-6 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="absolute inset-x-0 top-0 h-1 rounded-t-2xl bg-gradient-to-r from-rose-500 to-pink-600" />

              <div className="flex items-start justify-between mb-4 mt-1">
                <div className="w-11 h-11 rounded-xl bg-rose-500/20 flex items-center justify-center">
                  <div className="bg-gradient-to-br from-rose-500 to-pink-600 rounded-lg w-9 h-9 flex items-center justify-center">
                    <Video className="h-5 w-5 text-white" />
                  </div>
                </div>
                <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
                  AI Powered
                </span>
              </div>

              <h2 className="text-base font-bold text-foreground mb-0.5">Video Score</h2>
              <p className="text-xs font-medium text-muted-foreground mb-3">AI-powered feedback on your videos</p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                After you've recorded, upload your video and get instant AI scoring against the 5-part formula. See exactly where you nailed it and what to improve next time.
              </p>

              <div className="flex items-center justify-between mt-5">
                <span className="text-sm font-semibold bg-gradient-to-r from-rose-500 to-pink-600 bg-clip-text text-transparent">
                  Open tool
                </span>
                <ArrowRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground/70 group-hover:translate-x-1 transition-all duration-200" />
              </div>
            </button>
          </div>
        </section>

      </div>
    </div>
  );
}
