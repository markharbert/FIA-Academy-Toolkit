import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Video, FileText, Mic, Star, ChevronRight } from "lucide-react";

const TOOLS = [
  {
    url: "/video-studio/research",
    icon: Star,
    color: "rose",
    label: "Research",
    desc: "Find trending topics and video ideas your audience is actively searching for.",
  },
  {
    url: "/video-studio/scripts",
    icon: FileText,
    color: "rose",
    label: "Scripts",
    desc: "Write and manage AI-assisted video scripts that convert viewers into leads.",
  },
  {
    url: "/video-studio/record",
    icon: Mic,
    color: "rose",
    label: "Teleprompter",
    desc: "Record polished videos with a scrolling teleprompter — read naturally on camera.",
  },
  {
    url: "/video-score",
    icon: Video,
    color: "rose",
    label: "Video Score",
    desc: "Upload a video and get AI feedback on delivery, clarity, and engagement.",
  },
];

export default function Stage5Page() {
  const [, setLocation] = useLocation();

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 text-xs font-semibold">
            Level 2 · Momentum
          </Badge>
          <Badge variant="outline" className="text-xs text-white/40 border-white/10">
            Stage 5 of 6
          </Badge>
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">Organic Content</h1>
        <p className="text-white/60 text-base leading-relaxed max-w-2xl">
          The lifeline for lead generation and nurturing. Video content attracts your target audience, educates them on your solution, and builds the relationship that makes them want to buy from you.
        </p>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-3">Video Studio</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {TOOLS.map(tool => {
            const Icon = tool.icon;
            return (
              <button
                key={tool.url}
                onClick={() => setLocation(tool.url)}
                className="group text-left p-4 rounded-2xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] hover:border-rose-500/30 transition-all"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-rose-500/15 flex items-center justify-center shrink-0">
                      <Icon className="h-5 w-5 text-rose-400" />
                    </div>
                    <div>
                      <div className="font-semibold text-sm text-white">{tool.label}</div>
                      <div className="text-xs text-white/50 mt-0.5 leading-relaxed">{tool.desc}</div>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-white/20 group-hover:text-white/50 shrink-0 mt-0.5 transition-colors" />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <Card className="border-white/5 bg-white/[0.02]">
        <CardContent className="pt-4 pb-4">
          <p className="text-xs text-white/40 leading-relaxed italic">
            "Video accomplishes two things: it's awesome for lead generation, and it's phenomenal for nurturing existing leads. It allows them to get to know you — to see who you are — and therefore they feel more comfortable purchasing from you."
          </p>
          <p className="text-xs text-white/25 mt-2">— Keystone Framework, Stage 5</p>
        </CardContent>
      </Card>
    </div>
  );
}
