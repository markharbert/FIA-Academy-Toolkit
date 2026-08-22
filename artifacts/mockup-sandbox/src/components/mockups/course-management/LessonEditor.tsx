import { useState } from "react";
import {
  AlertTriangle, ArrowLeft, Bold, ChevronRight, Eye,
  GripVertical, Image, Italic, Link as LinkIcon,
  List, ListOrdered, Minus, MoreHorizontal, Plus, Quote, Save, Trash2,
} from "lucide-react";
import { RealSidebar } from "./RealSidebar";

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
      className="flex min-h-screen w-full overflow-hidden text-gray-900"
      style={{ background: "#ffffff", fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" }}
    >
      <RealSidebar activePath="admin" />

      <main className="flex min-w-0 flex-1 flex-col">
        {/* Sticky header */}
        <header
          className="shrink-0 border-b bg-white px-5 py-3 md:px-7"
          style={{ borderColor: "#e5e7eb" }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <button
                className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                aria-label="Back to outline"
              >
                <ArrowLeft size={18} />
              </button>
              <button className="text-sm text-gray-400 hover:text-gray-700">Outline</button>
              <span className="h-5 border-l border-gray-200" />
              <h1 className="truncate border-b border-dashed border-gray-300 pb-0.5 text-sm font-bold text-gray-900 md:text-[15px]">
                Day 1: Your Why
              </h1>
              <button
                className="hidden rounded p-1 text-gray-400 hover:bg-gray-100 md:block"
                aria-label="More lesson options"
              >
                <MoreHorizontal size={17} />
              </button>
            </div>
            <div className="flex items-center gap-2.5">
              <span className="text-xs font-medium text-gray-500">{published ? "Published" : "Draft"}</span>
              <button
                onClick={() => setPublished(!published)}
                aria-label="Toggle lesson status"
                className={`relative h-5 w-9 rounded-full transition ${published ? "bg-[#da0010]" : "bg-gray-200"}`}
              >
                <span
                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                    published ? "translate-x-[18px]" : "translate-x-0.5"
                  }`}
                />
              </button>
              <button className="hidden items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-600 hover:border-gray-400 hover:text-gray-900 sm:flex">
                <Eye size={14} /> Preview
              </button>
              <button
                onClick={saveLesson}
                className="flex items-center gap-2 rounded-md bg-[#da0010] px-3.5 py-2 text-xs font-bold text-white hover:bg-[#b8000e]"
              >
                <Save size={14} /> Save
              </button>
            </div>
          </div>
          <div className="mt-2 pl-9 text-[11px] text-gray-400">
            {saved ? "💾 Last saved 2 min ago" : "Saving changes…"}
          </div>
        </header>

        {/* Editor body */}
        <div className="flex-1 overflow-y-auto bg-gray-50/40">
          <div className="mx-auto max-w-[760px] space-y-10 px-5 py-8 md:px-8">

            {/* VIDEO */}
            <section>
              <SectionHeading label="VIDEO" />
              <div className="pt-3">
                <label className="mb-1.5 block text-xs font-medium text-gray-500">
                  Video URL or embed code
                </label>
                <input
                  defaultValue="https://vimeo.com/123456789"
                  onChange={() => setSaved(false)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-[#da0010] focus:ring-1 focus:ring-[#da0010]/20 shadow-sm"
                  placeholder="Paste a Vimeo or YouTube URL, or embed snippet…"
                />
                <div className="mt-2 flex items-center justify-between text-xs">
                  <span className="text-green-600 font-medium">✓ Vimeo video detected</span>
                  <button className="text-gray-400 hover:text-gray-700">Remove ×</button>
                </div>
                <div className="relative mt-3 flex aspect-video items-center justify-center overflow-hidden rounded-xl border border-gray-200 bg-gray-50 shadow-sm">
                  <span className="absolute right-3 top-3 rounded-full bg-[#3f92cc]/10 px-2 py-1 text-[10px] font-bold text-[#3f92cc]">
                    Vimeo
                  </span>
                  <div className="flex items-center gap-2 opacity-80">
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#3f92cc] text-xl font-black text-white">
                      V
                    </span>
                    <span className="text-lg font-semibold tracking-tight text-gray-500">vimeo</span>
                  </div>
                  <span className="absolute bottom-3 text-[10px] tracking-[.18em] text-gray-300">
                    123456789
                  </span>
                </div>
              </div>
            </section>

            {/* LESSON CONTENT */}
            <section>
              <SectionHeading label="LESSON CONTENT" />
              <div className="pt-3">
                {/* Toolbar */}
                <div className="inline-flex flex-wrap gap-0.5 rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
                  {[["H1", "heading one"], ["H2", "heading two"]].map(([label, aria]) => (
                    <ToolbarButton key={aria} label={label} ariaLabel={aria} />
                  ))}
                  <ToolbarIcon Icon={Bold} ariaLabel="bold" />
                  <ToolbarIcon Icon={Italic} ariaLabel="italic" divider />
                  <ToolbarIcon Icon={List} ariaLabel="bulleted list" divider />
                  <ToolbarIcon Icon={ListOrdered} ariaLabel="numbered list" />
                  <ToolbarIcon Icon={LinkIcon} ariaLabel="insert link" divider />
                  <ToolbarIcon Icon={Image} ariaLabel="insert image" />
                  <ToolbarIcon Icon={Minus} ariaLabel="insert divider" divider />
                  <ToolbarIcon Icon={Quote} ariaLabel="quote" />
                </div>
                {/* Editor area */}
                <div className="mt-2 min-h-[280px] rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                  <h2 className="mb-3 text-xl font-bold text-gray-900">Why You Need to Define Your Why</h2>
                  <p className="mb-4 text-sm leading-6 text-gray-600">
                    Most people start creating content without knowing why they do it. Without a clear &quot;why&quot;, your
                    message feels hollow and your audience can tell...
                  </p>
                  <ul className="mb-4 list-disc space-y-1 pl-5 text-sm leading-6 text-gray-600">
                    <li>Clarity creates consistency in your content</li>
                    <li>Your audience connects with authentic purpose</li>
                    <li>Your &quot;why&quot; becomes your competitive advantage</li>
                  </ul>
                  <div className="my-4 border-t border-gray-200" />
                  <p className="text-sm leading-6 text-gray-600">
                    Use the worksheet below to identify your core motivation...
                  </p>
                </div>
              </div>
            </section>

            {/* CUSTOM EMBED */}
            <section>
              <button
                onClick={() => setShowEmbed(!showEmbed)}
                className="flex w-full items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3 text-left hover:border-gray-300 hover:bg-gray-50 transition-colors shadow-sm"
              >
                <span className="flex items-center gap-2.5 text-sm font-medium text-gray-700">
                  <ChevronRight
                    size={16}
                    className={showEmbed ? "rotate-90 transition-transform" : "transition-transform"}
                  />
                  Advanced: Custom Embed
                </span>
                <span className="flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-1 text-[10px] font-semibold text-amber-700">
                  <AlertTriangle size={11} /> Admin only
                </span>
              </button>
              {showEmbed && (
                <div className="mt-2 rounded-lg border border-gray-200 bg-white p-4 text-xs text-gray-500 shadow-sm">
                  Custom HTML and script embeds can be added here.
                </div>
              )}
            </section>

            {/* RESOURCES */}
            <section className="pb-10">
              <SectionHeading label="RESOURCES" />
              <div className="space-y-2 pt-3">
                {resources.map((resource) => (
                  <div
                    key={resource.id}
                    className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-3 shadow-sm"
                  >
                    <GripVertical size={16} className="shrink-0 text-gray-300 cursor-grab" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-800">{resource.name}</p>
                      <p className="truncate text-xs text-gray-400">{resource.url}</p>
                    </div>
                    <button
                      onClick={() => setResources((items) => items.filter((i) => i.id !== resource.id))}
                      className="rounded p-1.5 text-gray-300 hover:bg-red-50 hover:text-red-500 transition-colors"
                      aria-label={`Remove ${resource.name}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
                <button
                  onClick={addResource}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-200 py-2.5 text-xs font-medium text-gray-400 hover:border-[#da0010] hover:text-[#da0010] transition-colors"
                >
                  <Plus size={15} /> Add Resource
                </button>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}

function SectionHeading({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[10px] font-bold tracking-[.2em] text-gray-400">{label}</span>
      <span className="h-px flex-1 bg-gray-200" />
    </div>
  );
}

function ToolbarButton({ label, ariaLabel, divider = false }: { label: string; ariaLabel: string; divider?: boolean }) {
  return (
    <button
      aria-label={ariaLabel}
      className={`h-8 w-8 rounded text-[11px] font-bold text-gray-500 hover:bg-gray-100 hover:text-gray-900 ${
        divider ? "mr-1 border-r border-gray-200" : ""
      }`}
    >
      {label}
    </button>
  );
}

function ToolbarIcon({ Icon, ariaLabel, divider = false }: { Icon: typeof LinkIcon; ariaLabel: string; divider?: boolean }) {
  return (
    <button
      aria-label={ariaLabel}
      className={`flex h-8 w-8 items-center justify-center rounded text-gray-500 hover:bg-gray-100 hover:text-gray-900 ${
        divider ? "mr-1 border-r border-gray-200" : ""
      }`}
    >
      <Icon size={14} />
    </button>
  );
}
