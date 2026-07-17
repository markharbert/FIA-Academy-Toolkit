import { Link } from "wouter";
import {
  UploadCloud,
  Compass,
  ScrollText,
  Play,
  ShieldCheck,
  FolderKanban,
  Network,
  Flame,
} from "lucide-react";
import { Tile, TileTitle } from "../widget-registry";

const ACTIONS = [
  {
    icon: UploadCloud,
    label: "Upload Video",
    sub: "Get AI coaching",
    href: "/video-score-upload",
    grad: "from-rose-500 to-orange-400",
    ring: "ring-rose-500/20",
  },
  {
    icon: Compass,
    label: "Research Topics",
    sub: "Find viral ideas",
    href: "/video-studio/research",
    grad: "from-teal-500 to-cyan-400",
    ring: "ring-teal-500/20",
  },
  {
    icon: ScrollText,
    label: "Write Script",
    sub: "5-part formula",
    href: "/video-studio/scripts",
    grad: "from-emerald-500 to-green-400",
    ring: "ring-emerald-500/20",
  },
  {
    icon: Play,
    label: "Teleprompter",
    sub: "Record your video",
    href: "/video-studio/record",
    grad: "from-violet-500 to-purple-400",
    ring: "ring-violet-500/20",
  },
  {
    icon: ShieldCheck,
    label: "Check Email",
    sub: "Inbox placement",
    href: "/email-tools/inbox-analyzer",
    grad: "from-sky-500 to-blue-400",
    ring: "ring-sky-500/20",
  },
  {
    icon: FolderKanban,
    label: "New Project",
    sub: "Plan your work",
    href: "/projects",
    grad: "from-indigo-500 to-blue-500",
    ring: "ring-indigo-500/20",
  },
  {
    icon: Network,
    label: "Build Funnel",
    sub: "Visual canvas",
    href: "/funnel-grid",
    grad: "from-orange-500 to-amber-400",
    ring: "ring-orange-500/20",
  },
  {
    icon: Flame,
    label: "Log DMO",
    sub: "Keep your streak",
    href: "/dmo-tracker",
    grad: "from-amber-500 to-yellow-400",
    ring: "ring-amber-500/20",
  },
];

export function QuickActionsWidget() {
  return (
    <Tile
      accent="bg-gradient-to-r from-violet-600 via-purple-500 to-indigo-500"
      testId="card-quick-actions"
    >
      <TileTitle
        icon={Compass}
        title="Quick Actions"
        accent="bg-violet-500/10 text-violet-600 dark:text-violet-400"
      />
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {ACTIONS.map((a) => (
          <Link key={a.href} href={a.href}>
            <div
              className={`rounded-xl border border-border bg-card hover:bg-muted/40 transition-all hover-elevate p-3 flex flex-col gap-2.5 cursor-pointer group ring-1 ${a.ring}`}
              data-testid={`quick-action-${a.label.toLowerCase().replace(/\s+/g, "-")}`}
            >
              <div
                className={`h-9 w-9 rounded-xl flex items-center justify-center bg-gradient-to-br ${a.grad} shadow-sm`}
              >
                <a.icon className="h-4.5 w-4.5 text-white" style={{ width: 18, height: 18 }} />
              </div>
              <div>
                <p className="text-xs font-semibold leading-tight text-foreground">{a.label}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{a.sub}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </Tile>
  );
}
