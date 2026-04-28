import { useLocation } from "wouter";
import { Video, TrendingUp, FileText, ArrowRight, type LucideIcon } from "lucide-react";

interface Tool {
  title: string;
  description: string;
  detail: string;
  url: string;
  icon: LucideIcon;
  gradient: string;
  iconBg: string;
  badge?: string;
  testId: string;
}

const VIDEO_TOOLS: Tool[] = [
  {
    title: "Video Score",
    description: "AI-powered feedback on your videos",
    detail: "Record or upload a short video and get instant scoring against the 5-part formula — Hook, Set the Hook, First CTA, Content, and Final CTA. See exactly where to improve.",
    url: "/video-score",
    icon: Video,
    gradient: "from-violet-500 to-purple-600",
    iconBg: "bg-violet-500/20",
    badge: "AI Powered",
    testId: "tool-video-score",
  },
  {
    title: "Video Trends",
    description: "Discover trending topics in your niche",
    detail: "Research what your audience is searching for using YouTube data. Uncover high-opportunity keywords and topics before your competition does.",
    url: "/video-trends",
    icon: TrendingUp,
    gradient: "from-blue-500 to-cyan-600",
    iconBg: "bg-blue-500/20",
    badge: "YouTube Data",
    testId: "tool-video-trends",
  },
  {
    title: "Scripts",
    description: "Write and manage your video scripts",
    detail: "Turn your research into fully written scripts built around the 5-part formula. Save, organize, and revisit your best content ideas anytime.",
    url: "/video-trends/scripts",
    icon: FileText,
    gradient: "from-teal-500 to-emerald-600",
    iconBg: "bg-teal-500/20",
    testId: "tool-scripts",
  },
];

export default function VideoToolsPage() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-background">
      {/* Hero header */}
      <div className="bg-sidebar text-sidebar-foreground px-6 py-10">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-3xl font-bold text-white tracking-tight">Video Tools</h1>
          <p className="text-white/50 text-sm mt-1.5 max-w-xl">
            Everything you need to research, create, and improve your video content — all in one place.
          </p>
        </div>
      </div>

      {/* Tool grid */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {VIDEO_TOOLS.map((tool) => {
            const Icon = tool.icon;
            return (
              <button
                key={tool.url}
                onClick={() => setLocation(tool.url)}
                data-testid={tool.testId}
                className="group relative text-left rounded-2xl border border-border bg-card p-6 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {/* Gradient accent bar */}
                <div className={`absolute inset-x-0 top-0 h-1 rounded-t-2xl bg-gradient-to-r ${tool.gradient}`} />

                {/* Icon + badge row */}
                <div className="flex items-start justify-between mb-4 mt-1">
                  <div className={`w-11 h-11 rounded-xl ${tool.iconBg} flex items-center justify-center`}>
                    <div className={`bg-gradient-to-br ${tool.gradient} rounded-lg w-9 h-9 flex items-center justify-center`}>
                      <Icon className="h-5 w-5 text-white" />
                    </div>
                  </div>
                  {tool.badge && (
                    <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
                      {tool.badge}
                    </span>
                  )}
                </div>

                {/* Title + description */}
                <h2 className="text-base font-bold text-foreground mb-1">{tool.title}</h2>
                <p className="text-xs font-medium text-muted-foreground mb-3">{tool.description}</p>
                <p className="text-sm text-muted-foreground leading-relaxed">{tool.detail}</p>

                {/* CTA row */}
                <div className="flex items-center justify-between mt-5">
                  <span className={`text-sm font-semibold bg-gradient-to-r ${tool.gradient} bg-clip-text text-transparent`}>
                    Open tool
                  </span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground/70 group-hover:translate-x-1 transition-all duration-200" />
                </div>
              </button>
            );
          })}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-10 opacity-60">
          More tools coming soon
        </p>
      </div>
    </div>
  );
}
