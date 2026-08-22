/**
 * RealSidebar — accurate replica of the app's AppSidebar for mockup use.
 *
 * Sidebar order (top → bottom):
 *   1. TRAINING   — new member-facing section (configurable name & order), above all tools
 *   2. NAVIGATION — existing tools (Dashboard, Planning, Video Studio, etc.)
 *   3. HELP & SUPPORT
 *   4. ADMIN      — admin-only: Admin Panel + Courses builder
 */
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
  ChevronDown,
  LogOut,
  User,
  GripVertical,
  Settings2,
} from "lucide-react";

type ActivePath =
  | "admin"
  | "courses"
  | "dashboard"
  | "planning"
  | "video"
  | "email"
  | "analytics"
  | "library"
  | "training-fia"
  | "training-emb"
  | "training-vcc";

interface RealSidebarProps {
  activePath?: ActivePath;
  /** When true, renders an admin-perspective sidebar (shows Courses builder entry too) */
  isAdmin?: boolean;
}

/** Simulated admin-configured course list shown in the Training section */
const trainingCourses = [
  { id: "training-fia", label: "Fearless Influencer Academy", short: "FIA" },
  { id: "training-emb", label: "Email Mastery Bootcamp",      short: "EMB" },
  { id: "training-vcc", label: "Video Confidence Coach",       short: "VCC" },
] as const;

const toolNavItems = [
  { label: "Dashboard",    icon: LayoutDashboard, color: "text-sky-400",     path: "dashboard" },
  { label: "Planning",     icon: CalendarDays,    color: "text-orange-400",  path: "planning",  hasChildren: true },
  { label: "Video Studio", icon: PlayCircle,      color: "text-rose-400",    path: "video",     hasChildren: true },
  { label: "Email Tools",  icon: Mail,            color: "text-teal-400",    path: "email",     hasChildren: true },
  { label: "Analytics",    icon: BarChart2,       color: "text-emerald-400", path: "analytics", hasChildren: true },
  { label: "Library",      icon: BookMarked,      color: "text-purple-400",  path: "library",   hasChildren: true },
] as const;

export function RealSidebar({ activePath = "admin", isAdmin = true }: RealSidebarProps) {
  const sidebarBg = "linear-gradient(180deg, hsl(230 75% 14%) 0%, hsl(230 75% 10%) 100%)";
  const dividerColor = "hsl(230 60% 16%)";
  const isActive = (p: string) => activePath === p;
  const isTrainingActive = (activePath as string).startsWith("training-");

  return (
    <div
      className="flex flex-col flex-shrink-0"
      style={{
        width: 220,
        minHeight: "100vh",
        background: sidebarBg,
        borderRight: `1px solid ${dividerColor}`,
      }}
    >
      {/* ── Logo ── */}
      <div className="flex items-center px-3 py-3 flex-shrink-0" style={{ borderBottom: `1px solid ${dividerColor}` }}>
        <img
          src="/__mockup/images/academy-toolkit-logo.png"
          alt="Academy Toolkit"
          className="h-10 w-auto object-contain"
        />
      </div>

      {/* ── Scrollable body ── */}
      <div className="flex-1 overflow-y-auto py-3 px-2 space-y-1">

        {/* ════════════════════════════════════
            TRAINING  — member-facing courses
            Name & order configurable by admin
            ════════════════════════════════════ */}
        <div className="mb-0.5 flex items-center justify-between px-2 pt-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-white/30">
            Training {/* ← admin can rename this */}
          </span>
          {/* Admin-only: manage icon visible in design to indicate configurability */}
          {isAdmin && (
            <button
              title="Configure Training section"
              className="opacity-0 group-hover:opacity-100 hover:opacity-100 rounded p-0.5 text-white/20 hover:text-white/60 transition-opacity"
            >
              <Settings2 size={11} />
            </button>
          )}
        </div>

        <div className="space-y-0.5 pb-1">
          {trainingCourses.map((course) => {
            const active = isActive(course.id);
            return (
              <button
                key={course.id}
                className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-[13px] transition-colors ${
                  active
                    ? "bg-amber-500/15 text-amber-100 font-medium"
                    : "text-white/65 hover:text-white hover:bg-white/5"
                }`}
              >
                {/* Tiny course initial badge */}
                <span
                  className={`flex-shrink-0 h-5 w-5 rounded text-[9px] font-black flex items-center justify-center ${
                    active ? "bg-amber-500/30 text-amber-200" : "bg-white/10 text-white/50"
                  }`}
                >
                  {course.short}
                </span>
                <span className="flex-1 text-left truncate">{course.label}</span>
              </button>
            );
          })}

          {/* Placeholder for drag-to-reorder affordance — admin sees this in builder */}
          {isAdmin && (
            <div className="flex items-center gap-1.5 px-2 py-1 opacity-30 cursor-default select-none">
              <GripVertical size={10} className="text-white/40" />
              <span className="text-[10px] text-white/30 italic">drag to reorder</span>
            </div>
          )}
        </div>

        {/* divider */}
        <div className="mx-2 my-2" style={{ borderTop: `1px solid ${dividerColor}` }} />

        {/* ════════════════════════════════════
            NAVIGATION — the existing tools
            ════════════════════════════════════ */}
        <div className="mb-0.5 px-2 pt-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-white/30">
            Navigation
          </span>
        </div>

        <div className="space-y-0.5 pb-1">
          {toolNavItems.map((item) => {
            const active = isActive(item.path);
            const Icon = item.icon;
            return (
              <button
                key={item.path}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[13px] transition-colors ${
                  active
                    ? "bg-white/10 text-white font-medium"
                    : "text-white/65 hover:text-white hover:bg-white/5"
                }`}
              >
                <Icon className={`h-4 w-4 flex-shrink-0 ${active ? "text-white" : item.color}`} />
                <span className="flex-1 text-left">{item.label}</span>
                {"hasChildren" in item && item.hasChildren && (
                  <ChevronDown className="h-3 w-3 text-white/25" />
                )}
              </button>
            );
          })}
        </div>

        {/* divider */}
        <div className="mx-2 my-2" style={{ borderTop: `1px solid ${dividerColor}` }} />

        {/* ════════════════════════════════════
            HELP & SUPPORT
            ════════════════════════════════════ */}
        <div className="mb-0.5 px-2 pt-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-white/30">
            Help &amp; Support
          </span>
        </div>
        <div className="space-y-0.5 pb-1">
          <button className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[13px] text-white/65 hover:text-white hover:bg-white/5">
            <BookOpen className="h-4 w-4 flex-shrink-0 text-slate-400" />
            <span>Help Docs</span>
          </button>
          <button className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[13px] text-white/65 hover:text-white hover:bg-white/5">
            <MessageSquarePlus className="h-4 w-4 flex-shrink-0 text-slate-400" />
            <span>Bug / Feature Requests</span>
          </button>
        </div>

        {/* divider */}
        <div className="mx-2 my-2" style={{ borderTop: `1px solid ${dividerColor}` }} />

        {/* ════════════════════════════════════
            ADMIN — admin-only
            Two separate entries: settings + courses builder
            ════════════════════════════════════ */}
        {isAdmin && (
          <>
            <div className="mb-0.5 px-2 pt-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-white/30">
                Admin
              </span>
            </div>
            <div className="space-y-0.5">
              <button
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[13px] transition-colors ${
                  isActive("admin")
                    ? "bg-white/10 text-white font-medium"
                    : "text-white/65 hover:text-white hover:bg-white/5"
                }`}
              >
                <Shield className={`h-4 w-4 flex-shrink-0 ${isActive("admin") ? "text-white" : "text-violet-400"}`} />
                <span>Admin Panel</span>
              </button>

              <button
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[13px] transition-colors ${
                  isActive("courses")
                    ? "bg-amber-500/15 text-amber-200 font-medium"
                    : "text-white/65 hover:text-white hover:bg-white/5"
                }`}
              >
                <GraduationCap
                  className={`h-4 w-4 flex-shrink-0 ${isActive("courses") ? "text-amber-300" : "text-amber-400"}`}
                />
                <span>Courses</span>
              </button>
            </div>
          </>
        )}
      </div>

      {/* ── Footer ── */}
      <div className="px-2 py-2 flex-shrink-0" style={{ borderTop: `1px solid ${dividerColor}` }}>
        <button className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[13px] text-white/65 hover:text-white hover:bg-white/5">
          <div className="h-5 w-5 rounded-full bg-[#3f92cc]/30 flex items-center justify-center flex-shrink-0">
            <User className="h-3 w-3 text-[#3f92cc]" />
          </div>
          <span className="flex-1 text-left truncate">Mark H.</span>
        </button>
        <button className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[13px] text-white/65 hover:text-white hover:bg-white/5">
          <LogOut className="h-4 w-4 flex-shrink-0 text-slate-400" />
          <span>Log out</span>
        </button>
      </div>
    </div>
  );
}
