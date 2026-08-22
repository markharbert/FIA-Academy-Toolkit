import {
  GripVertical, ChevronRight, ChevronDown, Folder, FileText,
  Plus, MoreHorizontal, ArrowLeft, ChevronLeft,
} from "lucide-react";
import { useState } from "react";
import { RealSidebar } from "./RealSidebar";

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
      { id: "prelaunch", title: "Pre-Launch Checklist", kind: "module", status: "Published", children: [] },
      { id: "welcome", title: "Welcome Video", kind: "lesson", status: "Published" },
      {
        id: "strategy",
        title: "Strategy Sessions",
        kind: "module",
        status: "Draft",
        children: [
          { id: "why", title: "Day 1: Your Why", kind: "lesson", status: "Published" },
          { id: "niche", title: "Day 2: Finding Your Niche", kind: "lesson", status: "Draft", muted: true },
          { id: "content", title: "Day 3: Content Strategy", kind: "lesson", status: "Draft", muted: true },
        ],
      },
    ],
  },
  { id: "content-creation", title: "CONTENT CREATION", kind: "module", status: "Published", children: [] },
  { id: "monetization", title: "MONETIZATION", kind: "module", status: "Draft", muted: true, children: [] },
  { id: "bonus", title: "Bonus: Live Q&A Replay", kind: "lesson", status: "Published" },
];

export function OutlineEditor() {
  const [tree, setTree] = useState(initialTree);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ launch: true, strategy: true });
  const [hovered, setHovered] = useState<string | null>(null);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");

  const toggle = (id: string) => setExpanded((c) => ({ ...c, [id]: !c[id] }));

  const addLesson = (moduleId: string) => {
    const title = newTitle.trim();
    if (!title) { setAddingTo(null); return; }
    const addTo = (nodes: OutlineNode[]): OutlineNode[] =>
      nodes.map((n) =>
        n.id === moduleId
          ? { ...n, children: [...(n.children ?? []), { id: `${moduleId}-${Date.now()}`, title, kind: "lesson", status: "Draft" }] }
          : { ...n, children: n.children ? addTo(n.children) : n.children }
      );
    setTree(addTo(tree));
    setExpanded((c) => ({ ...c, [moduleId]: true }));
    setNewTitle("");
    setAddingTo(null);
  };

  const renderNodes = (nodes: OutlineNode[], depth = 0) =>
    nodes.map((node) => {
      const isModule = node.kind === "module";
      const isOpen = !!expanded[node.id];
      const isLaunch = node.id === "launch";

      return (
        <div key={node.id}>
          <div
            className={`group relative flex h-10 items-center gap-2 rounded-lg px-2 transition-colors hover:bg-gray-50 ${
              node.muted ? "text-gray-400" : "text-gray-800"
            }`}
            style={{ paddingLeft: `${depth * 28 + 8}px` }}
            onMouseEnter={() => setHovered(node.id)}
            onMouseLeave={() => setHovered(null)}
          >
            {depth > 0 && (
              <span
                className="pointer-events-none absolute bottom-0 top-0 border-l border-gray-200"
                style={{ left: `${depth * 28 - 6}px` }}
              />
            )}
            <GripVertical className="mr-1 h-4 w-4 shrink-0 cursor-grab text-gray-300" />
            {isModule ? (
              <button
                type="button"
                onClick={() => toggle(node.id)}
                className="flex h-5 w-5 items-center justify-center text-gray-400 hover:text-gray-700"
              >
                {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
            ) : (
              <span className="w-5" />
            )}
            {isModule
              ? <Folder className="h-4 w-4 shrink-0 text-amber-500" />
              : <FileText className="h-4 w-4 shrink-0 text-[#3f92cc]" />
            }
            <span className={`min-w-0 flex-1 truncate text-[13px] font-medium ${node.muted ? "opacity-50" : ""}`}>
              {node.title}
            </span>
            {isLaunch && (
              <button
                type="button"
                onClick={() => setAddingTo(addingTo === node.id ? null : node.id)}
                className="hidden items-center gap-1 rounded px-1.5 py-1 text-[11px] text-gray-400 hover:bg-gray-100 hover:text-gray-700 group-hover:flex"
              >
                <Plus size={12} /> Add
              </button>
            )}
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] leading-none font-medium ${
                node.status === "Published"
                  ? "border-green-200 bg-green-50 text-green-700"
                  : "border-gray-200 bg-gray-100 text-gray-500"
              }`}
            >
              {node.status}
            </span>
            <button
              type="button"
              className={`flex h-7 w-7 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700 ${
                hovered === node.id ? "opacity-100" : "opacity-0"
              }`}
            >
              <MoreHorizontal size={16} />
            </button>
          </div>

          {addingTo === node.id && (
            <div className="flex h-10 items-center gap-2 border-l border-gray-200 pl-3" style={{ marginLeft: `${depth * 28 + 56}px` }}>
              <input
                autoFocus
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addLesson(node.id);
                  if (e.key === "Escape") setAddingTo(null);
                }}
                placeholder="Lesson title…"
                className="h-7 flex-1 rounded border border-[#da0010]/60 bg-white px-2 text-xs text-gray-900 outline-none shadow-sm"
              />
              <span className="text-[10px] text-gray-400">Enter save · Esc cancel</span>
            </div>
          )}

          {/* Drop indicator between Day 2 and Day 3 */}
          {node.id === "niche" && (
            <div
              className="mx-2 my-1 h-0.5 rounded-full bg-[#3f92cc]"
              style={{ marginLeft: `${(depth + 1) * 28 + 8}px` }}
            />
          )}

          {isModule && isOpen && node.children && (
            <div>{renderNodes(node.children, depth + 1)}</div>
          )}
        </div>
      );
    });

  return (
    <div
      className="flex min-h-screen w-full overflow-hidden text-gray-900"
      style={{ background: "#ffffff", fontFamily: "Inter, ui-sans-serif, sans-serif" }}
    >
      <RealSidebar activePath="admin" />

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Sticky header */}
        <header
          className="shrink-0 border-b bg-white px-4 py-3 md:px-6"
          style={{ borderColor: "#e5e7eb" }}
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <button type="button" className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700">
              <ArrowLeft size={14} /> Courses
            </button>
            <span className="text-gray-300">/</span>
            <h1 className="mr-auto text-base font-bold tracking-tight text-gray-900 md:text-lg">
              Fearless Influencer Academy
            </h1>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setExpanded({ launch: true, strategy: true })}
                className="text-xs text-gray-400 hover:text-gray-700"
              >
                Expand All
              </button>
              <button
                type="button"
                onClick={() => setExpanded({})}
                className="text-xs text-gray-400 hover:text-gray-700"
              >
                Collapse All
              </button>
              <button
                type="button"
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700 hover:border-gray-400 hover:bg-gray-50"
              >
                Edit Details
              </button>
              <span className="rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                Published
              </span>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-2 pl-1 text-[11px] text-gray-400">
            <span>4 modules · 23 lessons</span>
            <span className="text-gray-300">·</span>
            <span>Fearless Influencer Academy</span>
          </div>
        </header>

        {/* Tree */}
        <section className="flex-1 overflow-y-auto bg-white px-4 py-4 md:px-6">
          <button
            type="button"
            className="mb-3 flex items-center gap-1 rounded-md border border-dashed border-gray-300 px-2.5 py-1.5 text-xs text-gray-400 hover:border-[#da0010] hover:text-[#da0010] transition-colors"
          >
            <Plus size={14} /> Add Module
          </button>
          <div className="max-w-4xl">{renderNodes(tree)}</div>
          <div
            className="mt-8 flex items-center justify-between border-t pt-4 text-[11px] text-gray-400"
            style={{ borderColor: "#f3f4f6" }}
          >
            <span>Drag rows to reorganize your course</span>
            <span className="flex items-center gap-1">
              <ChevronLeft size={13} /> Outline settings
            </span>
          </div>
        </section>
      </main>
    </div>
  );
}
