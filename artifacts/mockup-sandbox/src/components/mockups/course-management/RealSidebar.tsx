/**
 * RealSidebar — accurate replica of the app's AppSidebar for mockup use.
 * Admin section has TWO separate entries:
 *   - Admin Panel (existing settings: Overview, Users, Announcements, Settings)
 *   - Courses     (new, entirely separate section — does NOT touch the existing admin)
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
} from "lucide-react";

type ActivePath =
  | "admin"
  | "courses"
  | "dashboard"
  | "planning"
  | "video"
  | "email"
  | "analytics"
  | "library";

interface RealSidebarProps {
  activePath?: ActivePath;
}

export function RealSidebar({ activePath = "admin" }: RealSidebarProps) {
  const sidebarBg = "linear-gradient(180deg, hsl(230 75% 14%) 0%, hsl(230 75% 10%) 100%)";
  const borderColor = "hsl(230 60% 16%)";

  const navItems = [
    { label: "Dashboard",   icon: LayoutDashboard, color: "text-sky-400",     path: "dashboard" },
    { label: "Planning",    icon: CalendarDays,    color: "text-orange-400",  path: "planning",   hasChildren: true },
    { label: "Video Studio",icon: PlayCircle,      color: "text-rose-400",    path: "video",      hasChildren: true },
    { label: "Email Tools", icon: Mail,            color: "text-teal-400",    path: "email",      hasChildren: true },
    { label: "Analytics",   icon: BarChart2,       color: "text-emerald-400", path: "analytics",  hasChildren: true },
    { label: "Library",     icon: BookMarked,      color: "text-purple-400",  path: "library",    hasChildren: true },
  ] as const;

  const isActive = (p: string) => activePath === p;

  return (
    <div
      className="flex flex-col flex-shrink-0 h-full"
      style={{ width: 220, background: sidebarBg, borderRight: `1px solid ${borderColor}` }}
    >
      {/* Logo */}
      <div className="flex items-center px-3 py-3" style={{ borderBottom: `1px solid ${borderColor}` }}>
        <img
          src="/__mockup/images/academy-toolkit-logo.png"
          alt="Academy Toolkit"
          className="h-10 w-auto object-contain"
        />
      </div>

      {/* Scrollable nav */}
      <div className="flex-1 overflow-y-auto py-3 px-2">
        {/* Navigation group */}
        <div className="mb-1 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-white/30">
          Navigation
        </div>
        <div className="space-y-0.5">
          {navItems.map((item) => {
            const active = isActive(item.path);
            const Icon = item.icon;
            return (
              <button
                key={item.path}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors ${
                  active
                    ? "bg-white/10 text-white font-medium"
                    : "text-white/70 hover:text-white hover:bg-white/5"
                }`}
              >
                <Icon className={`h-4 w-4 flex-shrink-0 ${active ? "text-white" : item.color}`} />
                <span className="flex-1 text-left">{item.label}</span>
                {"hasChildren" in item && item.hasChildren && (
                  <ChevronDown className="h-3 w-3 text-white/30" />
                )}
              </button>
            );
          })}
        </div>

        {/* Separator */}
        <div className="my-3 mx-2" style={{ borderTop: `1px solid ${borderColor}` }} />

        {/* Help & Support */}
        <div className="mb-1 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-white/30">
          Help &amp; Support
        </div>
        <div className="space-y-0.5">
          <button className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-white/70 hover:text-white hover:bg-white/5">
            <BookOpen className="h-4 w-4 flex-shrink-0 text-slate-400" />
            <span>Help Docs</span>
          </button>
          <button className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-white/70 hover:text-white hover:bg-white/5">
            <MessageSquarePlus className="h-4 w-4 flex-shrink-0 text-slate-400" />
            <span>Bug / Feature Requests</span>
          </button>
        </div>

        {/* Separator */}
        <div className="my-3 mx-2" style={{ borderTop: `1px solid ${borderColor}` }} />

        {/* Admin group — TWO separate entries */}
        <div className="mb-1 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-white/30">
          Admin
        </div>
        <div className="space-y-0.5">
          {/* Existing admin settings — untouched */}
          <button
            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors ${
              isActive("admin")
                ? "bg-white/10 text-white font-medium"
                : "text-white/70 hover:text-white hover:bg-white/5"
            }`}
          >
            <Shield
              className={`h-4 w-4 flex-shrink-0 ${isActive("admin") ? "text-white" : "text-violet-400"}`}
            />
            <span>Admin Panel</span>
          </button>

          {/* NEW — completely separate courses section */}
          <button
            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors ${
              isActive("courses")
                ? "bg-amber-500/15 text-amber-200 font-medium"
                : "text-white/70 hover:text-white hover:bg-white/5"
            }`}
          >
            <GraduationCap
              className={`h-4 w-4 flex-shrink-0 ${isActive("courses") ? "text-amber-300" : "text-amber-400"}`}
            />
            <span>Courses</span>
          </button>
        </div>
      </div>

      {/* Footer */}
      <div className="px-2 py-2" style={{ borderTop: `1px solid ${borderColor}` }}>
        <button className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-white/70 hover:text-white hover:bg-white/5">
          <div className="h-5 w-5 rounded-full bg-[#3f92cc]/30 flex items-center justify-center flex-shrink-0">
            <User className="h-3 w-3 text-[#3f92cc]" />
          </div>
          <span className="flex-1 text-left truncate">Mark H.</span>
        </button>
        <button className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-white/70 hover:text-white hover:bg-white/5">
          <LogOut className="h-4 w-4 flex-shrink-0 text-slate-400" />
          <span>Log out</span>
        </button>
      </div>
    </div>
  );
}
