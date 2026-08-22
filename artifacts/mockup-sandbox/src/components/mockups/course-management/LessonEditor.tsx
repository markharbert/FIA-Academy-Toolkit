import { useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  BarChart2,
  BookOpen,
  Bold,
  ChevronRight,
  Eye,
  GripVertical,
  Image,
  Italic,
  LayoutDashboard,
  Link as LinkIcon,
  List,
  ListOrdered,
  LogOut,
  Mail,
  Minus,
  MoreHorizontal,
  PlayCircle,
  Plus,
  Quote,
  Save,
  Shield,
  Trash2,
} from "lucide-react";

type Resource = { id: number; name: string; url: string };

export function LessonEditor() {
  const [published, setPublished] = useState(false);
  const [saved, setSaved] = useState(true);
  const [showEmbed, setShowEmbed] = useState(false);
  const [resources, setResources] = useState<Resource[]>([
    { id: 1, name: "Worksheet: Find Your Why.pdf", url: "toolkit.fearlessmarketinglab.com/resources/find-your-why.pdf" },
    { id: 2, name: "Brand Voice Template", url: "docs.google.com/document/d/1abc..." },
  ]);

  const saveLesson = () => {
    setSaved(false);
    window.setTimeout(() => setSaved(true), 650);
  };

  const addResource = () => {
    const name = window.prompt("Resource name", "New lesson resource");
    if (!name?.trim()) return;
    const url = window.prompt("Resource URL", "https://");
    if (!url?.trim()) return;
    setResources((items) => [...items, { id: Date.now(), name: name.trim(), url: url.trim() }]);
  };

  return (
    <div
      className="flex min-h-screen w-full overflow-hidden text-slate-100"
      style={{ background: "hsl(230 50% 6%)", fontFamily: "ui-sans-serif, system-ui, sans-serif" }}
    >
      <aside
        className="hidden w-[220px] shrink-0 flex-col border-r border-slate-800/70 md:flex"
        style={{ background: "linear-gradient(180deg, hsl(230 75% 14%) 0%, hsl(230 75% 10%) 100%)" }}
      >
        <div className="flex h-[76px] items-center gap-3 border-b border-white/[0.07] px-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#3f92cc] text-sm font-black text-white shadow-[0_5px_20px_rgba(63,146,204,.22)]">F</div>
          <div><p className="text-[13px] font-bold tracking-wide text-white">Fearless Lab</p><p className="mt-0.5 text-[10px] uppercase tracking-[.16em] text-slate-500">Admin workspace</p></div>
        </div>
        <nav className="space-y-1 px-3 py-5 text-[13px]">
          {[
            [LayoutDashboard, "Dashboard"],
            [BookOpen, "Courses"],
            [PlayCircle, "Lessons"],
            [Mail, "Members"],
            [BarChart2, "Analytics"],
          ].map(([Icon, label]) => (
            <button key={label as string} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-slate-400 transition hover:bg-white/[0.06] hover:text-slate-100">
              <Icon size={16} strokeWidth={1.8} /><span>{label as string}</span>
            </button>
          ))}
        </nav>
        <div className="mt-auto border-t border-white/[0.07] p-3">
          <button className="mb-1 flex w-full items-center gap-3 rounded-lg bg-white/[0.08] px-3 py-2.5 text-white"><Shield size={16} /><span>Admin Panel</span></button>
          <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-slate-500 hover:text-slate-200"><LogOut size={16} /><span>Sign out</span></button>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="shrink-0 border-b border-slate-800/80 px-5 py-3 md:px-7" style={{ background: "hsl(230 48% 9%)" }}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <button className="rounded-md p-1 text-slate-400 hover:bg-white/10 hover:text-white" aria-label="Back to outline"><ArrowLeft size={18} /></button>
              <button className="text-sm text-slate-400 hover:text-white">Outline</button>
              <span className="h-5 border-l border-slate-700" />
              <h1 className="truncate border-b border-dashed border-slate-600 pb-0.5 text-sm font-bold text-white md:text-[15px]">Day 1: Your Why</h1>
              <button className="hidden rounded p-1 text-slate-500 hover:bg-white/10 md:block" aria-label="More lesson options"><MoreHorizontal size={17} /></button>
            </div>
            <div className="flex items-center gap-2.5">
              <span className="text-xs font-medium text-slate-400">{published ? "Published" : "Draft"}</span>
              <button onClick={() => setPublished(!published)} aria-label="Toggle lesson status" className={`relative h-5 w-9 rounded-full transition ${published ? "bg-[#3f92cc]" : "bg-slate-700"}`}>
                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-slate-200 shadow transition-transform ${published ? "translate-x-[18px]" : "translate-x-0.5"}`} />
              </button>
              <button className="hidden items-center gap-2 rounded-md border border-slate-700 bg-transparent px-3 py-2 text-xs font-semibold text-slate-300 hover:border-slate-500 hover:text-white sm:flex"><Eye size={14} /> Preview</button>
              <button onClick={saveLesson} className="flex items-center gap-2 rounded-md bg-[#3f92cc] px-3.5 py-2 text-xs font-bold text-white hover:bg-[#55a3d8]"><Save size={14} /> Save</button>
            </div>
          </div>
          <div className="mt-2 pl-9 text-[11px] text-slate-500">{saved ? "💾 Last saved 2 min ago" : "Saving changes…"}</div>
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[760px] space-y-10 px-5 py-8 md:px-8">
            <section>
              <SectionHeading label="VIDEO" />
              <div className="pt-2">
                <label className="mb-2 block text-xs font-medium text-slate-400">Video URL or embed code</label>
                <input defaultValue="https://vimeo.com/123456789" onChange={() => setSaved(false)} className="w-full rounded-lg border border-slate-700 bg-[hsl(230_48%_8%)] px-4 py-2.5 text-sm text-slate-200 outline-none transition placeholder:text-slate-600 focus:border-[#3f92cc]" placeholder="Paste a Vimeo or YouTube URL, or embed snippet…" />
                <div className="mt-2.5 flex items-center justify-between text-xs">
                  <span className="text-green-400">✓ Vimeo video detected</span><button className="text-slate-500 hover:text-slate-300">Remove ×</button>
                </div>
                <div className="relative mt-3 flex aspect-video items-center justify-center overflow-hidden rounded-xl border border-slate-700 bg-[hsl(230_48%_12%)]">
                  <span className="absolute right-3 top-3 rounded-full bg-[#3f92cc]/20 px-2 py-1 text-[10px] font-bold text-[#6bb4e5]">Vimeo</span>
                  <div className="flex items-center gap-2 opacity-90"><span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#3f92cc] text-xl font-black text-white">V</span><span className="text-lg font-semibold tracking-tight text-slate-200">vimeo</span></div>
                  <span className="absolute bottom-3 text-[10px] tracking-[.18em] text-slate-600">123456789</span>
                </div>
              </div>
            </section>

            <section>
              <SectionHeading label="LESSON CONTENT" />
              <div className="pt-2">
                <div className="inline-flex flex-wrap gap-0.5 rounded-lg border border-slate-700 bg-[hsl(230_48%_11%)] p-1">
                  {[
                    [ "H1", "heading one"], ["H2", "heading two"],
                  ].map(([label, aria]) => <ToolbarButton key={aria} label={label} ariaLabel={aria} />)}
                  <ToolbarIcon Icon={Bold} ariaLabel="bold" /><ToolbarIcon Icon={Italic} ariaLabel="italic" divider />
                  <ToolbarIcon Icon={List} ariaLabel="bulleted list" divider /><ToolbarIcon Icon={ListOrdered} ariaLabel="numbered list" />
                  <ToolbarIcon Icon={LinkIcon} ariaLabel="insert link" divider /><ToolbarIcon Icon={Image} ariaLabel="insert image" />
                  <ToolbarIcon Icon={Minus} ariaLabel="insert divider" divider /><ToolbarIcon Icon={Quote} ariaLabel="quote" />
                </div>
                <div className="mt-2 min-h-[280px] rounded-xl border border-slate-700 bg-[hsl(230_48%_8%)] p-6">
                  <h2 className="mb-3 text-xl font-bold text-white">Why You Need to Define Your Why</h2>
                  <p className="mb-4 text-sm leading-6 text-slate-300">Most people start creating content without knowing why they do it. Without a clear &quot;why&quot;, your message feels hollow and your audience can tell...</p>
                  <ul className="mb-4 list-disc space-y-1 pl-5 text-sm leading-6 text-slate-300"><li>Clarity creates consistency in your content</li><li>Your audience connects with authentic purpose</li><li>Your &quot;why&quot; becomes your competitive advantage</li></ul>
                  <div className="my-4 border-t border-slate-700" /><p className="text-sm leading-6 text-slate-300">Use the worksheet below to identify your core motivation...</p>
                </div>
              </div>
            </section>

            <section>
              <button onClick={() => setShowEmbed(!showEmbed)} className="flex w-full items-center justify-between rounded-lg border border-slate-700 bg-[hsl(230_48%_9%)] px-4 py-3 text-left hover:border-slate-600">
                <span className="flex items-center gap-2.5 text-sm font-medium text-slate-300"><ChevronRight size={16} className={showEmbed ? "rotate-90 transition-transform" : "transition-transform"} />Advanced: Custom Embed</span>
                <span className="flex items-center gap-1 rounded-full bg-[#e8b500]/10 px-2 py-1 text-[10px] font-semibold text-[#e8b500]"><AlertTriangle size={12} /> Admin only</span>
              </button>
              {showEmbed && <div className="mt-2 rounded-lg border border-slate-700 bg-[hsl(230_48%_8%)] p-4 text-xs text-slate-500">Custom HTML and script embeds can be added here.</div>}
            </section>

            <section className="pb-10">
              <SectionHeading label="RESOURCES" />
              <div className="space-y-2 pt-3">
                {resources.map((resource) => <div key={resource.id} className="flex items-center gap-3 rounded-lg border border-slate-800 bg-[hsl(230_48%_8%)] px-3 py-3"><GripVertical size={16} className="shrink-0 text-slate-600" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-slate-200">{resource.name}</p><p className="truncate text-xs text-slate-500">{resource.url}</p></div><button onClick={() => setResources((items) => items.filter((item) => item.id !== resource.id))} className="rounded p-1.5 text-slate-600 hover:bg-red-500/10 hover:text-red-400" aria-label={`Remove ${resource.name}`}><Trash2 size={15} /></button></div>)}
                <button onClick={addResource} className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-700 py-2.5 text-xs font-semibold text-slate-500 hover:border-[#3f92cc] hover:text-[#6bb4e5]"><Plus size={15} /> Add Resource</button>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}

function SectionHeading({ label }: { label: string }) {
  return <div className="flex items-center gap-3"><span className="text-[10px] font-bold tracking-[.2em] text-slate-500">{label}</span><span className="h-px flex-1 bg-slate-800" /></div>;
}

function ToolbarButton({ label, ariaLabel, divider = false }: { label: string; ariaLabel: string; divider?: boolean }) {
  return <button aria-label={ariaLabel} className={`h-8 w-8 rounded text-[11px] font-bold text-slate-400 hover:bg-white/10 hover:text-white ${divider ? "mr-1 border-r border-slate-700" : ""}`}>{label}</button>;
}

function ToolbarIcon({ Icon, ariaLabel, divider = false }: { Icon: typeof LinkIcon; ariaLabel: string; divider?: boolean }) {
  return <button aria-label={ariaLabel} className={`flex h-8 w-8 items-center justify-center rounded text-slate-400 hover:bg-white/10 hover:text-white ${divider ? "mr-1 border-r border-slate-700" : ""}`}><Icon size={14} /></button>;
}