import { useState } from "react";
import {
  Plus,
  MoreHorizontal,
  Users,
  ChevronDown,
  CheckCircle,
  GripVertical,
  Settings,
} from "lucide-react";
import { RealSidebar } from "./RealSidebar";

type Course = {
  title: string;
  description: string;
  stats: string;
  initials: string;
  cover: string;
  status: "Published" | "Draft";
};

const courses: Course[] = [
  {
    title: "Fearless Influencer Academy",
    description: "The complete system for building your influence online.",
    stats: "4 modules · 23 lessons",
    initials: "FIA",
    cover: "linear-gradient(125deg, hsl(268 68% 25%), hsl(235 67% 24%))",
    status: "Published",
  },
  {
    title: "Email Mastery Bootcamp",
    description: "Write emails people look forward to opening.",
    stats: "2 modules · 8 lessons",
    initials: "EMB",
    cover: "linear-gradient(125deg, hsl(183 70% 22%), hsl(220 70% 25%))",
    status: "Draft",
  },
  {
    title: "Video Confidence Coach",
    description: "Show up on camera with clarity, ease, and confidence.",
    stats: "1 module · 3 lessons",
    initials: "VCC",
    cover: "linear-gradient(125deg, hsl(27 75% 26%), hsl(7 67% 25%))",
    status: "Draft",
  },
];


export function CourseList() {
  const [activeTab, setActiveTab] = useState("Courses");
  const [showDialog, setShowDialog] = useState(false);
  const [openMenu, setOpenMenu] = useState<number | null>(null);
  const [notice, setNotice] = useState("");

  const showNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2200);
  };

  return (
    <div
      className="min-h-screen flex text-slate-100"
      style={{
        background: "hsl(230 50% 6%)",
        fontFamily: "'DM Sans', ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <RealSidebar activePath="admin" />

      <main className="flex-1 min-w-0">
        <header className="h-[82px] border-b flex items-center justify-between px-6 lg:px-10" style={{ borderColor: "hsl(230 30% 18%)" }}>
          <div>
            <h1 className="text-[21px] font-semibold tracking-[-0.02em]">Admin Panel</h1>
            <div className="mt-1 text-[11px] text-slate-500 flex items-center gap-1.5">
              Academy Toolkit <span className="text-slate-700">/</span> <span className="text-slate-400">Admin Panel</span>
            </div>
          </div>
          <button onClick={() => showNotice("All systems operational")} className="hidden sm:flex items-center gap-2 text-[11px] text-slate-400 hover:text-white">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/80" /> All systems operational
            <ChevronDown size={14} className="text-slate-600" />
          </button>
        </header>

        <div className="px-6 lg:px-10">
          <div className="h-[62px] flex items-end gap-7 border-b overflow-x-auto" style={{ borderColor: "hsl(230 30% 18%)" }}>
            {["Overview", "Users", "Courses", "Announcements", "Settings"].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`h-full relative whitespace-nowrap text-[13px] transition-colors ${activeTab === tab ? "text-white font-medium" : "text-slate-500 hover:text-slate-300"}`}
              >
                {tab}
                {activeTab === tab && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#da0010]" />}
              </button>
            ))}
          </div>

          {activeTab === "Courses" ? (
            <section className="py-9">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-[24px] font-semibold tracking-[-0.03em]">Courses</h2>
                  <p className="mt-1.5 text-[13px] text-slate-500">Build and manage training courses for your members.</p>
                </div>
                <button onClick={() => setShowDialog(true)} className="shrink-0 flex items-center gap-2 rounded-md bg-[#da0010] px-3.5 py-2 text-[12px] font-semibold text-white hover:bg-[#b8000e] transition-colors shadow-lg shadow-red-950/20">
                  <Plus size={15} /> New Course
                </button>
              </div>

              <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
                {courses.map((course, index) => (
                  <article key={course.title} className="group overflow-hidden rounded-lg border transition-transform hover:-translate-y-0.5" style={{ background: "hsl(230 48% 9%)", borderColor: "hsl(230 30% 18%)" }}>
                    <div className="h-40 relative overflow-hidden" style={{ background: course.cover }}>
                      <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(circle at 75% 25%, rgba(255,255,255,.35), transparent 32%), linear-gradient(135deg, transparent 45%, rgba(255,255,255,.08) 46%, transparent 47%)", backgroundSize: "auto, 14px 14px" }} />
                      <div className="absolute -right-2 -bottom-5 text-[86px] leading-none font-black tracking-[-0.12em] text-white/[0.10] select-none">{course.initials}</div>
                      <div className="absolute left-5 top-5 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/55">Academy Toolkit</div>
                    </div>
                    <div className="p-5">
                      <h3 className="font-semibold text-[15px] leading-5 text-slate-100">{course.title}</h3>
                      <p className="mt-2 text-[12px] text-slate-500 truncate">{course.description}</p>
                      <div className="mt-5 flex items-center justify-between text-[11px] text-slate-500">
                        <span>{course.stats}</span>
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] ${course.status === "Published" ? "border-green-500/30 bg-green-500/15 text-green-400" : "border-slate-600/50 bg-slate-700/50 text-slate-400"}`}>
                          {course.status === "Published" && <CheckCircle size={10} className="inline mr-1 -mt-0.5" />}{course.status}
                        </span>
                      </div>
                      <div className="mt-5 pt-4 border-t flex gap-2" style={{ borderColor: "hsl(230 30% 18%)" }}>
                        <button onClick={() => showNotice(`Opening ${course.title}`)} className="flex-1 rounded border px-3 py-2 text-[11px] font-medium text-slate-300 hover:text-white hover:border-slate-500 transition-colors" style={{ borderColor: "hsl(230 30% 24%)" }}>Edit Outline</button>
                        <div className="relative">
                          <button onClick={() => setOpenMenu(openMenu === index ? null : index)} aria-label={`More options for ${course.title}`} className="h-[31px] w-[34px] flex items-center justify-center rounded border text-slate-500 hover:text-slate-200 hover:border-slate-500" style={{ borderColor: "hsl(230 30% 24%)" }}><MoreHorizontal size={16} /></button>
                          {openMenu === index && <div className="absolute right-0 bottom-9 z-10 w-32 rounded-md border p-1 shadow-xl" style={{ background: "hsl(230 48% 12%)", borderColor: "hsl(230 30% 23%)" }}><button onClick={() => { setOpenMenu(null); showNotice("Course settings opened"); }} className="w-full flex items-center gap-2 rounded px-2 py-1.5 text-left text-[11px] text-slate-300 hover:bg-white/5"><Settings size={12} /> Settings</button></div>}
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : (
            <div className="py-20 flex flex-col items-center justify-center text-center">
              <div className="rounded-full bg-blue-400/10 p-4 text-blue-300"><Users size={24} /></div>
              <h2 className="mt-4 text-lg font-semibold">{activeTab}</h2>
              <p className="mt-1 text-sm text-slate-500">This admin workspace is ready for your next decision.</p>
            </div>
          )}
        </div>
      </main>

      {notice && <div className="fixed bottom-5 right-5 rounded-md border bg-slate-900 px-4 py-3 text-xs text-slate-200 shadow-2xl" style={{ borderColor: "hsl(230 30% 25%)" }}>{notice}</div>}
      {showDialog && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-950/75 p-4" onClick={() => setShowDialog(false)}>
          <div className="w-full max-w-md rounded-xl border p-6 shadow-2xl" style={{ background: "hsl(230 48% 10%)", borderColor: "hsl(230 30% 23%)" }} onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between"><div><h3 className="text-lg font-semibold">New course</h3><p className="mt-1 text-xs text-slate-500">Give your members somewhere new to grow.</p></div><GripVertical size={18} className="rotate-90 text-slate-600" /></div>
            <label className="mt-6 block text-xs text-slate-400">Course title<input autoFocus className="mt-2 w-full rounded border bg-slate-950/40 px-3 py-2.5 text-sm outline-none focus:border-[#3f92cc]" style={{ borderColor: "hsl(230 30% 23%)" }} placeholder="e.g. Community Building 101" /></label>
            <label className="mt-4 block text-xs text-slate-400">Description<textarea className="mt-2 w-full resize-none rounded border bg-slate-950/40 px-3 py-2.5 text-sm outline-none focus:border-[#3f92cc]" style={{ borderColor: "hsl(230 30% 23%)" }} rows={3} placeholder="What will members learn?" /></label>
            <div className="mt-6 flex justify-end gap-2"><button onClick={() => setShowDialog(false)} className="rounded border px-3.5 py-2 text-xs text-slate-300 hover:text-white" style={{ borderColor: "hsl(230 30% 24%)" }}>Cancel</button><button onClick={() => { setShowDialog(false); showNotice("Course draft created"); }} className="rounded bg-[#da0010] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#b8000e]">Create Course</button></div>
          </div>
        </div>
      )}
    </div>
  );
}