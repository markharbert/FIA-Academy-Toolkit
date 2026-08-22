import { useState } from "react";
import { Plus, MoreHorizontal, Users, CheckCircle, GripVertical, Settings } from "lucide-react";
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
  const [activeTab, setActiveTab] = useState("All");
  const [showDialog, setShowDialog] = useState(false);
  const [openMenu, setOpenMenu] = useState<number | null>(null);
  const [notice, setNotice] = useState("");

  const showNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2200);
  };

  return (
    <div
      className="min-h-screen flex text-gray-900"
      style={{ background: "#ffffff", fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" }}
    >
      <RealSidebar activePath="courses" />

      <main className="flex-1 min-w-0">
        {/* Page header — standalone Courses section, separate from Admin Panel */}
        <header className="border-b bg-white px-6 lg:px-10 pt-8 pb-0" style={{ borderColor: "#e5e7eb" }}>
          <div className="flex items-start justify-between gap-4 pb-5">
            <div>
              <div className="text-[11px] text-gray-400 flex items-center gap-1.5 mb-1">
                Admin <span className="text-gray-300">/</span> <span className="text-amber-600 font-medium">Courses</span>
              </div>
              <h1 className="text-[24px] font-bold tracking-[-0.02em] text-gray-900">Courses</h1>
              <p className="mt-1 text-[13px] text-gray-500">
                Build and manage training courses for your members.
              </p>
            </div>
            <button
              onClick={() => setShowDialog(true)}
              className="shrink-0 flex items-center gap-2 rounded-md bg-[#da0010] px-3.5 py-2 text-[12px] font-semibold text-white hover:bg-[#b8000e] transition-colors shadow-sm mt-1"
            >
              <Plus size={15} /> New Course
            </button>
          </div>

          {/* Courses-specific filter tabs — separate from admin settings tabs */}
          <div className="flex items-end gap-6 overflow-x-auto">
            {["All", "Published", "Draft"].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`h-9 relative whitespace-nowrap text-[13px] transition-colors pb-px ${
                  activeTab === tab
                    ? "text-gray-900 font-semibold"
                    : "text-gray-400 hover:text-gray-700"
                }`}
              >
                {tab}
                {activeTab === tab && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#da0010]" />
                )}
              </button>
            ))}
          </div>
        </header>

        <div className="px-6 lg:px-10 py-7">
          {/* Course cards */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {courses
              .filter((c) => activeTab === "All" || c.status === activeTab)
              .map((course, index) => (
                <article
                  key={course.title}
                  className="group overflow-hidden rounded-xl border bg-white transition-all hover:shadow-md hover:-translate-y-0.5"
                  style={{ borderColor: "#e5e7eb" }}
                >
                  {/* Cover */}
                  <div className="h-40 relative overflow-hidden" style={{ background: course.cover }}>
                    <div
                      className="absolute inset-0 opacity-20"
                      style={{ backgroundImage: "radial-gradient(circle at 75% 25%, rgba(255,255,255,.35), transparent 32%)" }}
                    />
                    <div className="absolute -right-2 -bottom-5 text-[86px] leading-none font-black tracking-[-0.12em] text-white/[0.10] select-none">
                      {course.initials}
                    </div>
                    <div className="absolute left-5 top-5 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/60">
                      Academy Toolkit
                    </div>
                  </div>

                  {/* Body */}
                  <div className="p-5">
                    <h3 className="font-semibold text-[15px] leading-5 text-gray-900">{course.title}</h3>
                    <p className="mt-1.5 text-[12px] text-gray-500 truncate">{course.description}</p>
                    <div className="mt-4 flex items-center justify-between text-[11px] text-gray-400">
                      <span>{course.stats}</span>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                          course.status === "Published"
                            ? "border-green-200 bg-green-50 text-green-700"
                            : "border-gray-200 bg-gray-100 text-gray-500"
                        }`}
                      >
                        {course.status === "Published" && <CheckCircle size={10} className="inline mr-1 -mt-0.5" />}
                        {course.status}
                      </span>
                    </div>
                    <div className="mt-4 pt-4 border-t flex gap-2" style={{ borderColor: "#f3f4f6" }}>
                      <button
                        onClick={() => showNotice(`Opening ${course.title}`)}
                        className="flex-1 rounded-md border border-gray-200 px-3 py-2 text-[11px] font-medium text-gray-600 hover:border-gray-400 hover:text-gray-900 transition-colors bg-white"
                      >
                        Edit Outline
                      </button>
                      <div className="relative">
                        <button
                          onClick={() => setOpenMenu(openMenu === index ? null : index)}
                          aria-label={`More options for ${course.title}`}
                          className="h-[31px] w-[34px] flex items-center justify-center rounded-md border border-gray-200 text-gray-400 hover:border-gray-400 hover:text-gray-700 bg-white"
                        >
                          <MoreHorizontal size={16} />
                        </button>
                        {openMenu === index && (
                          <div className="absolute right-0 bottom-9 z-10 w-32 rounded-md border bg-white p-1 shadow-lg" style={{ borderColor: "#e5e7eb" }}>
                            <button
                              onClick={() => { setOpenMenu(null); showNotice("Course settings opened"); }}
                              className="w-full flex items-center gap-2 rounded px-2 py-1.5 text-left text-[11px] text-gray-700 hover:bg-gray-50"
                            >
                              <Settings size={12} /> Settings
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </article>
              ))}
          </div>

          {courses.filter((c) => activeTab === "All" || c.status === activeTab).length === 0 && (
            <div className="py-20 flex flex-col items-center justify-center text-center">
              <div className="rounded-full bg-amber-50 p-4 text-amber-400">
                <Users size={24} />
              </div>
              <h2 className="mt-4 text-lg font-semibold text-gray-900">No {activeTab.toLowerCase()} courses</h2>
              <p className="mt-1 text-sm text-gray-500">Courses with {activeTab.toLowerCase()} status will appear here.</p>
            </div>
          )}
        </div>
      </main>

      {/* Toast */}
      {notice && (
        <div className="fixed bottom-5 right-5 rounded-lg border border-gray-200 bg-white px-4 py-3 text-xs text-gray-800 shadow-lg">
          {notice}
        </div>
      )}

      {/* New Course dialog */}
      {showDialog && (
        <div
          className="fixed inset-0 z-20 flex items-center justify-center bg-black/20 p-4 backdrop-blur-sm"
          onClick={() => setShowDialog(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border bg-white p-6 shadow-xl"
            style={{ borderColor: "#e5e7eb" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">New course</h3>
                <p className="mt-1 text-xs text-gray-500">Give your members somewhere new to grow.</p>
              </div>
              <GripVertical size={18} className="rotate-90 text-gray-300" />
            </div>
            <label className="mt-6 block text-xs font-medium text-gray-600">
              Course title
              <input
                autoFocus
                className="mt-1.5 w-full rounded-md border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-[#da0010] focus:ring-1 focus:ring-[#da0010]/20"
                placeholder="e.g. Community Building 101"
              />
            </label>
            <label className="mt-4 block text-xs font-medium text-gray-600">
              Description
              <textarea
                className="mt-1.5 w-full resize-none rounded-md border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-[#da0010] focus:ring-1 focus:ring-[#da0010]/20"
                rows={3}
                placeholder="What will members learn?"
              />
            </label>
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setShowDialog(false)}
                className="rounded-md border border-gray-300 px-3.5 py-2 text-xs text-gray-600 hover:border-gray-400 hover:text-gray-900"
              >
                Cancel
              </button>
              <button
                onClick={() => { setShowDialog(false); showNotice("Course draft created"); }}
                className="rounded-md bg-[#da0010] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#b8000e]"
              >
                Create Course
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
