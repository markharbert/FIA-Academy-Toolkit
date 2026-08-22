import {
  GripVertical,
  ChevronRight,
  ChevronDown,
  Folder,
  FileText,
  Plus,
  MoreHorizontal,
  Shield,
  LogOut,
  LayoutDashboard,
  PlayCircle,
  Mail,
  BarChart2,
  BookOpen,
  ArrowLeft,
  ChevronLeft,
} from "lucide-react";
import { useState } from "react";

type NodeKind = "module" | "lesson";

type OutlineNode = {
  id: string;
  title: string;
  kind: NodeKind;
  status: "Published" | "Draft";
  children?: OutlineNode[];
  muted?: boolean;
};

const initialTree: OutlineNode[] = [
  {
    id: "launch",
    title: "LAUNCH",
    kind: "module",
    status: "Draft",
    children: [
      {
        id: "prelaunch",
        title: "Pre-Launch Checklist",
        kind: "module",
        status: "Published",
        children: [],
      },
      {
        id: "welcome",
        title: "Welcome Video",
        kind: "lesson",
        status: "Published",
      },
      {
        id: "strategy",
        title: "Strategy Sessions",
        kind: "module",
        status: "Draft",
        children: [
          {
            id: "why",
            title: "Day 1: Your Why",
            kind: "lesson",
            status: "Published",
          },
          {
            id: "niche",
            title: "Day 2: Finding Your Niche",
            kind: "lesson",
            status: "Draft",
            muted: true,
          },
          {
            id: "content",
            title: "Day 3: Content Strategy",
            kind: "lesson",
            status: "Draft",
            muted: true,
          },
        ],
      },
    ],
  },
  {
    id: "content-creation",
    title: "CONTENT CREATION",
    kind: "module",
    status: "Published",
    children: [],
  },
  {
    id: "monetization",
    title: "MONETIZATION",
    kind: "module",
    status: "Draft",
    muted: true,
    children: [],
  },
  {
    id: "bonus",
    title: "Bonus: Live Q&A Replay",
    kind: "lesson",
    status: "Published",
  },
];

export function OutlineEditor() {
  const [tree, setTree] = useState(initialTree);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    launch: true,
    strategy: true,
  });
  const [hovered, setHovered] = useState<string | null>(null);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");

  const toggle = (id: string) =>
    setExpanded((current) => ({ ...current, [id]: !current[id] }));

  const addLesson = (moduleId: string) => {
    const title = newTitle.trim();
    if (!title) {
      setAddingTo(null);
      return;
    }
    const addTo = (nodes: OutlineNode[]): OutlineNode[] =>
      nodes.map((node) =>
        node.id === moduleId
          ? {
              ...node,
              children: [
                ...(node.children ?? []),
                { id: `${moduleId}-${Date.now()}`, title, kind: "lesson", status: "Draft" },
              ],
            }
          : { ...node, children: node.children ? addTo(node.children) : node.children },
      );
    setTree(addTo(tree));
    setExpanded((current) => ({ ...current, [moduleId]: true }));
    setNewTitle("");
    setAddingTo(null);
  };

  const renderNodes = (nodes: OutlineNode[], depth = 0) =>
    nodes.map((node, index) => {
      const isModule = node.kind === "module";
      const isOpen = !!expanded[node.id];
      const isLaunch = node.id === "launch";
      return (
        <div key={node.id}>
          <div
            className={`group relative flex h-10 items-center gap-2 rounded-lg px-2 transition-colors hover:bg-white/5 ${
              node.muted ? "text-slate-400/70" : "text-slate-100"
            }`}
            style={{ paddingLeft: `${depth * 28 + 8}px` }}
            onMouseEnter={() => setHovered(node.id)}
            onMouseLeave={() => setHovered(null)}
          >
            {depth > 0 && (
              <span
                className="pointer-events-none absolute bottom-0 top-0 border-l border-slate-700/70"
                style={{ left: `${depth * 28 - 6}px` }}
              />
            )}
            <GripVertical className="mr-1 h-4 w-4 shrink-0 cursor-grab text-slate-600" />
            {isModule ? (
              <button
                type="button"
                aria-label={`${isOpen ? "Collapse" : "Expand"} ${node.title}`}
                onClick={() => toggle(node.id)}
                className="flex h-5 w-5 items-center justify-center text-slate-500 hover:text-slate-200"
              >
                {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
            ) : (
              <span className="w-5" />
            )}
            {isModule ? (
              <Folder className="h-4 w-4 shrink-0 text-amber-400" />
            ) : (
              <FileText className="h-4 w-4 shrink-0 text-sky-400" />
            )}
            <span className={`min-w-0 flex-1 truncate text-[13px] font-medium ${node.muted ? "opacity-60" : ""}`}>
              {node.title}
            </span>
            {isLaunch && (
              <button
                type="button"
                onClick={() => setAddingTo(addingTo === node.id ? null : node.id)}
                className="hidden items-center gap-1 rounded px-1.5 py-1 text-[11px] text-slate-400 hover:bg-slate-700/60 hover:text-slate-100 group-hover:flex"
              >
                <Plus size={12} /> Add
              </button>
            )}
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] leading-none ${
                node.status === "Published"
                  ? "border-green-500/30 bg-green-500/15 text-green-400"
                  : "border-slate-600/50 bg-slate-700/50 text-slate-400"
              }`}
            >
              {node.status}
            </span>
            <button
              type="button"
              aria-label={`More actions for ${node.title}`}
              onClick={() => setHovered(node.id)}
              className={`flex h-7 w-7 items-center justify-center rounded text-slate-500 hover:bg-white/10 hover:text-slate-200 ${
                hovered === node.id ? "opacity-100" : "opacity-0"
              }`}
            >
              <MoreHorizontal size={16} />
            </button>
          </div>
          {addingTo === node.id && (
            <div className="ml-[84px] flex h-10 items-center gap-2 border-l border-slate-700/70 pl-3">
              <input
                autoFocus
                value={newTitle}
                onChange={(event) => setNewTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") addLesson(node.id);
                  if (event.key === "Escape") setAddingTo(null);
                }}
                placeholder="Lesson title…"
                className="h-7 flex-1 rounded border border-[#3f92cc]/70 bg-slate-900/70 px-2 text-xs text-slate-100 outline-none"
              />
              <span className="text-[10px] text-slate-500">Enter save · Esc cancel</span>
            </div>
          )}
          {isModule && isOpen && node.children && (
            <div>{renderNodes(node.children, depth + 1)}</div>
          )}
          {node.id === "niche" && (
            <div
              className="mx-2 my-1 h-0.5 rounded-full bg-[#3f92cc]"
              style={{ marginLeft: `${(depth + 1) * 28 + 8}px` }}
            />
          )}
          {node.id === "strategy" && isOpen && index === 2 && null}
        </div>
      );
    });

  return (
    <div
      className="flex min-h-screen w-full overflow-hidden text-slate-100"
      style={{ background: "hsl(230 50% 6%)", fontFamily: "'DM Sans', ui-sans-serif, sans-serif" }}
    >
      <aside
        className="hidden w-[220px] shrink-0 flex-col border-r border-slate-800/60 md:flex"
        style={{ background: "linear-gradient(180deg, hsl(230 75% 14%) 0%, hsl(230 75% 10%) 100%)" }}
      >
        <div className="flex h-[68px] items-center gap-3 border-b border-white/10 px-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#3f92cc] text-white shadow-[0_5px_18px_rgba(63,146,204,.25)]">
            <BookOpen size={17} />
          </div>
          <div>
            <div className="text-sm font-bold tracking-tight">CreatorOS</div>
            <div className="text-[10px] text-slate-400">COURSE STUDIO</div>
          </div>
        </div>
        <div className="px-3 pt-6">
          <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[.16em] text-slate-500">Workspace</p>
          {[
            [LayoutDashboard, "Dashboard"],
            [PlayCircle, "Courses"],
            [Mail, "Members"],
            [BarChart2, "Analytics"],
          ].map(([Icon, label]) => (
            <button type="button" key={label as string} className="mb-1 flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-xs text-slate-400 hover:bg-white/5 hover:text-slate-100">
              <Icon size={16} /> {label as string}
            </button>
          ))}
        </div>
        <div className="mt-auto space-y-1 border-t border-white/10 px-3 py-4">
          <button type="button" className="flex w-full items-center gap-3 rounded-md bg-[#3f92cc]/15 px-3 py-2.5 text-left text-xs font-medium text-[#78b9e2]">
            <Shield size={16} /> Admin Panel
          </button>
          <button type="button" className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-xs text-slate-400 hover:bg-white/5 hover:text-slate-100">
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="shrink-0 border-b border-slate-800/80 px-4 py-3 md:px-6" style={{ background: "hsl(230 48% 9%)" }}>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <button type="button" className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-100">
              <ArrowLeft size={14} /> Courses
            </button>
            <span className="text-slate-700">/</span>
            <h1 className="mr-auto text-base font-bold tracking-tight text-slate-100 md:text-lg">Fearless Influencer Academy</h1>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setExpanded({ launch: true, strategy: true })} className="text-xs text-slate-400 hover:text-slate-100">Expand All</button>
              <button type="button" onClick={() => setExpanded({})} className="text-xs text-slate-400 hover:text-slate-100">Collapse All</button>
              <button type="button" className="rounded-md border border-slate-600 px-3 py-1.5 text-xs text-slate-200 hover:bg-white/5">Edit Details</button>
              <span className="rounded-full border border-green-500/30 bg-green-500/15 px-2 py-0.5 text-xs text-green-400">Published</span>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-2 pl-1 text-[11px] text-slate-500">
            <span>4 modules · 23 lessons</span><span className="text-slate-700">·</span><span>Fearless Influencer Academy</span>
          </div>
        </header>
        <section className="flex-1 overflow-y-auto px-4 py-4 md:px-6">
          <button type="button" className="mb-3 flex items-center gap-1 rounded-md border border-dashed border-slate-700 px-2.5 py-1.5 text-xs text-slate-400 hover:border-[#3f92cc] hover:text-[#78b9e2]">
            <Plus size={14} /> Add Module
          </button>
          <div className="max-w-4xl">{renderNodes(tree)}</div>
          <div className="mt-8 flex items-center justify-between border-t border-slate-800/70 pt-4 text-[11px] text-slate-600">
            <span>Drag rows to reorganize your course</span>
            <span className="flex items-center gap-1"><ChevronLeft size={13} /> Outline settings</span>
          </div>
        </section>
      </main>
    </div>
  );
}