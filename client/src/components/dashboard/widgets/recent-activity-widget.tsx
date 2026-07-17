import { useMemo } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Video,
  Mail,
  FileText,
  Sparkles,
  Activity,
  ChevronRight,
} from "lucide-react";
import { Tile, TileTitle, scoreColor, timeAgo, ANOMALY_META } from "../widget-registry";
import type { Session, EmailAnalysis, Script, InsightsResponse } from "@shared/schema";

type ActivityItem = {
  id: string;
  icon: React.ReactNode;
  label: string;
  sub: string;
  score?: number | null;
  ts: Date;
  href: string;
};

export function RecentActivityWidget() {
  const { data: sessions = [] } = useQuery<Session[]>({
    queryKey: ["/api/sessions"],
  });
  const { data: emails = [] } = useQuery<EmailAnalysis[]>({
    queryKey: ["/api/inbox-analyzer/emails"],
  });
  const { data: scripts = [] } = useQuery<Script[]>({
    queryKey: ["/api/topic-pulse/scripts"],
  });
  const { data: insights } = useQuery<InsightsResponse>({
    queryKey: ["/api/inbox-intel/insights"],
  });

  const recentActivity = useMemo<ActivityItem[]>(() => {
    const items: ActivityItem[] = [];
    sessions.slice(0, 3).forEach((s) => {
      items.push({
        id: `session-${s.id}`,
        icon: <Video className="h-3.5 w-3.5 text-rose-500" />,
        label: s.title || "Untitled session",
        sub:
          s.scoreStatus === "final"
            ? `Video scored ${s.scoreJson?.totalScore ?? "—"}/100`
            : s.scoreStatus === "partial"
            ? "Scoring in progress"
            : "Video uploaded",
        score: s.scoreStatus === "final" ? s.scoreJson?.totalScore : null,
        ts: new Date(s.createdAt),
        href: `/video-score-upload/${s.id}`,
      });
    });
    emails.slice(0, 3).forEach((e) => {
      items.push({
        id: `email-${e.id}`,
        icon: <Mail className="h-3.5 w-3.5 text-sky-500" />,
        label: e.subject || "(No subject)",
        sub: e.overallScore != null ? `Email scored ${e.overallScore}/100` : "Email analyzed",
        score: e.overallScore,
        ts: new Date(e.receivedAt),
        href: "/email-tools/inbox-analyzer",
      });
    });
    scripts.slice(0, 2).forEach((s) => {
      items.push({
        id: `script-${s.id}`,
        icon: <FileText className="h-3.5 w-3.5 text-emerald-500" />,
        label: s.title || "Untitled script",
        sub: "Script generated",
        ts: new Date(s.createdAt),
        href: "/video-studio/scripts",
      });
    });
    insights?.anomalies?.slice(0, 4).forEach((a) => {
      const meta = ANOMALY_META[a.type];
      items.push({
        id: `anom-${a.id}`,
        icon: <meta.icon className={`h-3.5 w-3.5 ${meta.color}`} />,
        label: a.trackerName,
        sub: a.message,
        ts: new Date(a.occurredAt),
        href: `/email-tools/inbox-intel/${a.trackerId}`,
      });
    });
    return items.sort((a, b) => b.ts.getTime() - a.ts.getTime()).slice(0, 7);
  }, [sessions, emails, scripts, insights]);

  return (
    <Tile
      accent="bg-gradient-to-r from-sky-500 via-indigo-500 to-violet-500"
      testId="card-recent-activity"
    >
      <div className="flex items-center justify-between">
        <TileTitle
          icon={Activity}
          title="Recent Activity"
          accent="bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
        />
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
          Last 7 events
        </span>
      </div>
      <div className="mt-3">
        {recentActivity.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
            <Sparkles className="h-6 w-6 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              No activity yet — dive into a tool to get started.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {recentActivity.map((item) => (
              <Link key={item.id} href={item.href}>
                <div
                  className="flex items-center gap-3 py-2.5 px-1 hover:bg-muted/30 rounded transition-colors cursor-pointer group"
                  data-testid={`activity-${item.id}`}
                >
                  <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center shrink-0">
                    {item.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.label}</p>
                    <p className="text-xs text-muted-foreground truncate">{item.sub}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {item.score != null && (
                      <span
                        className={`text-xs font-bold tabular-nums ${scoreColor(item.score)}`}
                      >
                        {item.score}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {timeAgo(item.ts)}
                    </span>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </Tile>
  );
}
