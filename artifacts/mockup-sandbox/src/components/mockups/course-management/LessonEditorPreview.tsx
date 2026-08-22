/**
 * LessonEditorPreview — member-facing lesson view.
 * The left sidebar is ALWAYS present. The active course (FIA) is highlighted
 * in the Training section and expands to show the lesson navigation inline.
 */
import { useState } from "react";
import {
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Clock3,
  Download,
  ExternalLink,
  FileText,
  Folder,
  Play,
  SkipBack,
  SkipForward,
} from "lucide-react";
import {
  LayoutDashboard,
  CalendarDays,
  PlayCircle,
  Mail,
  BarChart2,
  BookMarked,
  BookOpen,
  MessageSquarePlus,
  Shield,
  GraduationCap,
  LogOut,
  User,
} from "lucide-react";

// ─── Inline sidebar that shows course lesson-nav when inside a course ─────────

const modules = [
  {
    id: "launch",
    title: "LAUNCH",
    lessons: [
      { id: "prelaunch",  title: "Pre-Launch Checklist", done: true },
      { id: "welcome",    title: "Welcome Video",         done: true },
      { id: "why",        title: "Day 1: Your Why",       done: false, active: true },
      { id: "niche",      title: "Day 2: Finding Your Niche", done: false },
      { id: "content",    title: "Day 3: Content Strategy",   done: false },
    ],
  },
  { id: "content-creation", title: "CONTENT CREATION", lessons: [] },
  { id: "monetization",     title: "MONETIZATION",     lessons: [] },
];

const toolNavItems = [
  { label: "Dashboard",    icon: LayoutDashboard, color: "text-sky-400",     path: "dashboard" },
  { label: "Planning",     icon: CalendarDays,    color: "text-orange-400",  path: "planning",  hasChildren: true },
  { label: "Video Studio", icon: PlayCircle,      color: "text-rose-400",    path: "video",     hasChildren: true },
  { label: "Email Tools",  icon: Mail,            color: "text-teal-400",    path: "email",     hasChildren: true },
  { label: "Analytics",    icon: BarChart2,       color: "text-emerald-400", path: "analytics", hasChildren: true },
  { label: "Library",      icon: BookMarked,      color: "text-purple-400",  path: "library",   hasChildren: true },
] as const;

function CourseSidebar() {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ launch: true });
  const sidebarBg = "linear-gradient(180deg, hsl(230 75% 14%) 0%, hsl(230 75% 10%) 100%)";
  const divider   = "hsl(230 60% 16%)";

  return (
    <div
      className="flex flex-col flex-shrink-0"
      style={{ width: 240, minHeight: "100vh", background: sidebarBg, borderRight: `1px solid ${divider}` }}
    >
      {/* Logo */}
      <div className="flex items-center px-3 py-3 flex-shrink-0" style={{ borderBottom: `1px solid ${divider}` }}>
        <img src="/__mockup/images/academy-toolkit-logo.png" alt="Academy Toolkit" className="h-10 w-auto object-contain" />
      </div>

      <div className="flex-1 overflow-y-auto py-3 px-2 space-y-1 text-[13px]">

        {/* ── TRAINING ── */}
        <div className="px-2 pt-1 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/30">Training</div>

        {/* Other courses (collapsed) */}
        <button className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-white/50 hover:text-white hover:bg-white/5">
          <span className="flex-shrink-0 h-5 w-5 rounded text-[9px] font-black flex items-center justify-center bg-white/10 text-white/40">EMB</span>
          <span className="flex-1 text-left truncate text-[12px]">Email Mastery Bootcamp</span>
        </button>
        <button className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-white/50 hover:text-white hover:bg-white/5">
          <span className="flex-shrink-0 h-5 w-5 rounded text-[9px] font-black flex items-center justify-center bg-white/10 text-white/40">VCC</span>
          <span className="flex-1 text-left truncate text-[12px]">Video Confidence Coach</span>
        </button>

        {/* Active course — Fearless Influencer Academy — expanded with lesson nav */}
        <div className="rounded-lg overflow-hidden" style={{ background: "rgba(245,158,11,0.08)" }}>
          <div className="flex items-center gap-2.5 px-2 py-1.5">
            <span className="flex-shrink-0 h-5 w-5 rounded text-[9px] font-black flex items-center justify-center bg-amber-500/30 text-amber-200">FIA</span>
            <span className="flex-1 text-left truncate text-[13px] font-semibold text-amber-100">Fearless Influencer Academy</span>
          </div>

          {/* Lesson tree */}
          <div className="pb-1 px-1">
            {modules.map((mod) => {
              const open = !!expanded[mod.id];
              return (
                <div key={mod.id}>
                  <button
                    onClick={() => setExpanded((s) => ({ ...s, [mod.id]: !s[mod.id] }))}
                    className="w-full flex items-center gap-1.5 px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-amber-400/60 hover:text-amber-300"
                  >
                    {mod.lessons.length > 0
                      ? open ? <ChevronDown size={11} /> : <ChevronRight size={11} />
                      : <span className="w-[11px]" />
                    }
                    <Folder size={10} className="text-amber-500/50" />
                    <span className="truncate">{mod.title}</span>
                  </button>

                  {open && mod.lessons.map((lesson) => (
                    <button
                      key={lesson.id}
                      className={`w-full flex items-center gap-2 pl-7 pr-2 py-1 rounded-md text-left transition-colors ${
                        lesson.active
                          ? "bg-amber-500/20 text-amber-100"
                          : "text-white/50 hover:text-white hover:bg-white/5"
                      }`}
                    >
                      {lesson.done
                        ? <CheckCircle size={11} className="flex-shrink-0 text-green-400/80" />
                        : <span className={`flex-shrink-0 h-2.5 w-2.5 rounded-full border ${lesson.active ? "border-amber-400 bg-amber-400/30" : "border-white/20"}`} />
                      }
                      <span className="truncate text-[12px]">{lesson.title}</span>
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        <div className="mx-2 my-2" style={{ borderTop: `1px solid ${divider}` }} />

        {/* ── NAVIGATION ── */}
        <div className="px-2 pt-0.5 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/30">Navigation</div>
        {toolNavItems.map((item) => {
          const Icon = item.icon;
          return (
            <button key={item.path} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-white/60 hover:text-white hover:bg-white/5">
              <Icon className={`h-4 w-4 flex-shrink-0 ${item.color}`} />
              <span className="flex-1 text-left">{item.label}</span>
              {"hasChildren" in item && item.hasChildren && <ChevronDown className="h-3 w-3 text-white/25" />}
            </button>
          );
        })}

        <div className="mx-2 my-2" style={{ borderTop: `1px solid ${divider}` }} />

        {/* ── HELP & SUPPORT ── */}
        <div className="px-2 pt-0.5 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/30">Help &amp; Support</div>
        <button className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-white/60 hover:text-white hover:bg-white/5">
          <BookOpen className="h-4 w-4 flex-shrink-0 text-slate-400" /><span>Help Docs</span>
        </button>
        <button className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-white/60 hover:text-white hover:bg-white/5">
          <MessageSquarePlus className="h-4 w-4 flex-shrink-0 text-slate-400" /><span>Bug / Feature Requests</span>
        </button>
      </div>

      {/* Footer */}
      <div className="px-2 py-2 flex-shrink-0" style={{ borderTop: `1px solid ${divider}` }}>
        <button className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[13px] text-white/60 hover:text-white hover:bg-white/5">
          <div className="h-5 w-5 rounded-full bg-[#3f92cc]/30 flex items-center justify-center flex-shrink-0">
            <User className="h-3 w-3 text-[#3f92cc]" />
          </div>
          <span className="flex-1 text-left truncate">Mark H.</span>
        </button>
        <button className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[13px] text-white/60 hover:text-white hover:bg-white/5">
          <LogOut className="h-4 w-4 flex-shrink-0 text-slate-400" /><span>Log out</span>
        </button>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function LessonEditorPreview() {
  const [playing, setPlaying] = useState(false);

  return (
    <div
      className="flex min-h-screen text-gray-900"
      style={{ background: "#ffffff", fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" }}
    >
      {/* Sidebar — always present */}
      <CourseSidebar />

      {/* Lesson content */}
      <main className="flex-1 min-w-0 overflow-y-auto bg-gray-50/30">

        {/* Thin top bar — breadcrumb + progress */}
        <div className="border-b bg-white px-8 py-3 flex items-center justify-between" style={{ borderColor: "#e5e7eb" }}>
          <div className="flex items-center gap-2 text-[12px] text-gray-400">
            <span className="text-amber-600 font-medium">Fearless Influencer Academy</span>
            <span className="text-gray-300">/</span>
            <span>Strategy Sessions</span>
            <span className="text-gray-300">/</span>
            <span className="text-gray-600 font-medium">Day 1: Your Why</span>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-gray-400">
            <span>2 / 23 lessons</span>
            <div className="w-24 h-1.5 rounded-full bg-gray-100 overflow-hidden">
              <div className="h-full rounded-full bg-amber-400" style={{ width: "9%" }} />
            </div>
          </div>
        </div>

        {/* Lesson body */}
        <div className="mx-auto max-w-[780px] px-8 py-10">

          {/* Meta */}
          <div className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-wider text-amber-600 mb-4">
            <span>Strategy Sessions</span>
            <span className="text-gray-300">·</span>
            <span className="text-gray-400 font-normal normal-case tracking-normal">Lesson 3</span>
          </div>

          <h1 className="text-[32px] font-bold tracking-[-0.03em] text-gray-900 leading-tight mb-3">
            Day 1: Your Why
          </h1>
          <div className="flex items-center gap-4 text-[13px] text-gray-400 mb-8">
            <span className="flex items-center gap-1.5"><Clock3 size={13} /> 12 min</span>
            <span className="h-1 w-1 rounded-full bg-gray-300" />
            <span>Watch, then reflect</span>
          </div>

          {/* Video player */}
          <div
            className="relative aspect-video rounded-xl overflow-hidden mb-8 shadow-sm"
            style={{ background: "radial-gradient(circle at 70% 35%, #a34d42 0%, #6e282b 30%, #2d2224 75%)" }}
          >
            <div className="absolute inset-0 flex items-center justify-center">
              <button
                onClick={() => setPlaying(!playing)}
                className="h-14 w-14 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-sm hover:bg-white/30 transition-colors border border-white/30"
              >
                <Play size={22} className="text-white ml-1" />
              </button>
            </div>
            <div className="absolute left-6 top-6 text-[10px] font-bold uppercase tracking-[0.2em] text-white/50">
              Academy Toolkit
            </div>
            <div className="absolute left-6 bottom-6 text-2xl font-bold text-white leading-tight max-w-[260px]">
              The reason behind the work matters.
            </div>
            {/* Progress bar */}
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/10">
              <div className="h-full bg-[#da0010]" style={{ width: "0%" }} />
            </div>
          </div>

          {/* Lesson content */}
          <div className="prose prose-gray max-w-none mb-10 text-[15px] leading-7">
            <h2 className="text-xl font-bold text-gray-900 mb-3">Why You Need to Define Your Why</h2>
            <p className="text-gray-600 mb-4">
              Most people start creating content without knowing why they do it. Without a clear "why", your message feels hollow — and your audience can tell. Today we fix that.
            </p>
            <ul className="space-y-1.5 text-gray-600 mb-4 list-none pl-0">
              {["Clarity creates consistency in your content", "Your audience connects with authentic purpose", "Your \"why\" becomes your competitive advantage"].map((item) => (
                <li key={item} className="flex items-start gap-2.5">
                  <CheckCircle size={16} className="text-green-500 flex-shrink-0 mt-0.5" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <p className="text-gray-600">
              Use the worksheet below to identify your core motivation before moving to the next lesson.
            </p>
          </div>

          {/* Resources */}
          <div className="mb-10">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-3">Lesson Resources</h3>
            <div className="space-y-2">
              {[
                { name: "Worksheet: Find Your Why.pdf", detail: "PDF · 2 pages", icon: FileText, action: "Download", ActionIcon: Download },
                { name: "Brand Voice Template", detail: "Google Doc", icon: ExternalLink, action: "Open", ActionIcon: ExternalLink },
              ].map((r) => (
                <div key={r.name} className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 hover:border-gray-300 transition-colors shadow-sm">
                  <div className="h-9 w-9 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                    <FileText size={16} className="text-gray-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-gray-900 truncate">{r.name}</p>
                    <p className="text-[11px] text-gray-400">{r.detail}</p>
                  </div>
                  <button className="flex items-center gap-1.5 text-[12px] font-semibold text-[#da0010] hover:text-[#b8000e]">
                    <r.ActionIcon size={13} /> {r.action}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Prev / Next navigation */}
          <div className="flex items-center justify-between pt-6 border-t" style={{ borderColor: "#f3f4f6" }}>
            <button className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-[13px] font-medium text-gray-600 hover:border-gray-300 hover:text-gray-900 shadow-sm">
              <SkipBack size={15} /> Welcome Video
            </button>
            <button className="flex items-center gap-2 rounded-lg bg-[#da0010] px-4 py-2.5 text-[13px] font-bold text-white hover:bg-[#b8000e] shadow-sm">
              Day 2: Finding Your Niche <SkipForward size={15} />
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
