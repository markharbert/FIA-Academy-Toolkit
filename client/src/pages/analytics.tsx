import { useLocation } from "wouter";
import { BarChart2, Youtube, Globe, ArrowRight, TrendingUp, type LucideIcon } from "lucide-react";

interface Tool {
  title: string;
  description: string;
  detail: string;
  url: string;
  icon: LucideIcon;
  gradient: string;
  iconBg: string;
  testId: string;
}

const ANALYTICS_TOOLS: Tool[] = [
  {
    title: "YouTube Analytics",
    description: "Understand how your channel is performing",
    detail:
      "Connect your YouTube channel to see subscriber count, total views, and a breakdown of every video — views, likes, comments, and publish date — all in one clean dashboard.",
    url: "/analytics/youtube",
    icon: Youtube,
    gradient: "from-red-500 to-rose-600",
    iconBg: "bg-red-500/20",
    testId: "tool-youtube-analytics",
  },
  {
    title: "Website Analytics",
    description: "See how people find you on Google",
    detail:
      "Connect Google Search Console to discover exactly what people are searching to find your website, which pages rank where, and how your search traffic is trending over time.",
    url: "/analytics/search-console",
    icon: Globe,
    gradient: "from-blue-500 to-indigo-600",
    iconBg: "bg-blue-500/20",
    testId: "tool-gsc-analytics",
  },
];

export default function AnalyticsPage() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-background">
      <div className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 bg-gradient-to-br from-[hsl(220_70%_8%)] to-[hsl(158_55%_14%)]" />
        <div className="absolute -bottom-24 -right-12 h-72 w-72 rounded-full bg-emerald-500/20 blur-3xl" />
        <div className="absolute -top-16 -left-8 h-64 w-64 rounded-full bg-sky-500/10 blur-3xl" />
        <div className="relative max-w-5xl mx-auto px-6 py-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-xl bg-emerald-500/20 ring-1 ring-emerald-400/30 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-emerald-300" />
            </div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Analytics</h1>
          </div>
          <p className="text-white/60 text-sm mt-1.5 max-w-xl">
            Connect your marketing channels and see exactly how your content and website are performing — all in one place.
          </p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {ANALYTICS_TOOLS.map((tool) => {
            const Icon = tool.icon;
            return (
              <button
                key={tool.url}
                onClick={() => setLocation(tool.url)}
                data-testid={tool.testId}
                className="group relative text-left rounded-2xl border border-border bg-card p-6 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className={`absolute inset-x-0 top-0 h-1 rounded-t-2xl bg-gradient-to-r ${tool.gradient}`} />
                <div className="flex items-start justify-between mb-4 mt-1">
                  <div className={`w-11 h-11 rounded-xl ${tool.iconBg} flex items-center justify-center`}>
                    <div className={`bg-gradient-to-br ${tool.gradient} rounded-lg w-9 h-9 flex items-center justify-center`}>
                      <Icon className="h-5 w-5 text-white" />
                    </div>
                  </div>
                </div>
                <h2 className="text-base font-bold text-foreground mb-1">{tool.title}</h2>
                <p className="text-xs font-medium text-muted-foreground mb-3">{tool.description}</p>
                <p className="text-sm text-muted-foreground leading-relaxed">{tool.detail}</p>
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
          More analytics tools coming soon
        </p>
      </div>
    </div>
  );
}
