import { useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import Player from "@vimeo/player";
import jsPDF from "jspdf";
import { Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Clock, Download, FileSearch, Globe2, Library, MessageCircleQuestion, Play, Search, Sparkles, Tag, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type SearchMode = "trainings" | "transcripts" | "qa";
type TranscriptMatch = { text: string; startSeconds: number; endSeconds?: number | null; version: number; transcriptUpdatedAt?: string | null };
type Item = { id: string; slug: string; title: string; description?: string | null; videoUrl?: string | null; category?: string | null; tags?: string[]; durationMinutes?: number | null; thumbnailUrl?: string | null; completed?: boolean; completedAt?: string | null; transcriptMatches?: TranscriptMatch[] };
type ActiveMatch = { item: Item; match: TranscriptMatch };
type QASource = { replayId: string; slug: string; title: string; videoUrl?: string | null; text: string; startSeconds: number; endSeconds?: number | null };
type QAResult = { question: string; answer: string; foundAnswer: boolean; answerSource?: "trainings" | "web" | "none"; sources: QASource[] };
async function api(url: string) { const response = await fetch(url, { credentials: "include" }); if (!response.ok) throw new Error("Unable to load the training library."); return response.json(); }
async function postApi<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.message || "Unable to answer that question.");
  return payload;
}
const stamp = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

type AnswerBlock =
  | { type: "paragraph"; lines: string[] }
  | { type: "heading"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "divider" };

function parseAnswerBlocks(text: string): AnswerBlock[] {
  const blocks: AnswerBlock[] = [];
  let paragraphLines: string[] = [];
  let listItems: string[] = [];
  let listOrdered = false;
  const flushParagraph = () => {
    if (paragraphLines.length) {
      blocks.push({ type: "paragraph", lines: paragraphLines });
      paragraphLines = [];
    }
  };
  const flushList = () => {
    if (listItems.length) {
      blocks.push({ type: "list", ordered: listOrdered, items: listItems });
      listItems = [];
    }
  };
  for (const rawLine of text.trim().split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }
    if (/^(?:-{3,}|_{3,}|\*{3,})$/.test(line)) {
      flushParagraph();
      flushList();
      blocks.push({ type: "divider" });
      continue;
    }
    const heading = line.match(/^#{1,3}\s+(.+)$/);
    const boldHeading = line.match(/^\*\*([^*]+)\*\*:?$/);
    if (heading || boldHeading) {
      flushParagraph();
      flushList();
      blocks.push({ type: "heading", text: (heading?.[1] ?? boldHeading?.[1] ?? "").replace(/:$/, "") });
      continue;
    }
    const bullet = line.match(/^[-*•]\s+(.+)$/);
    const numbered = line.match(/^\d+[.)]\s+(.+)$/);
    if (bullet || numbered) {
      flushParagraph();
      const ordered = Boolean(numbered);
      if (listItems.length && ordered !== listOrdered) flushList();
      listOrdered = ordered;
      listItems.push((bullet?.[1] ?? numbered?.[1] ?? "").trim());
      continue;
    }
    flushList();
    paragraphLines.push(line);
  }
  flushParagraph();
  flushList();
  return blocks;
}

function decodeAnswerText(text: string) {
  return text
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function cleanAnswerText(text: string) {
  return decodeAnswerText(text)
    .replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, "$1$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .trim();
}

function renderAnswerInline(text: string) {
  const readableText = decodeAnswerText(text);
  const parts = readableText.split(/(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\[[^\]]+\]\([^)]+\))/g);
  return parts.map((part, index) => {
    const isBold = (part.startsWith("**") && part.endsWith("**")) || (part.startsWith("__") && part.endsWith("__"));
    if (isBold) return <strong key={index} className="font-bold text-slate-950">{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={index} className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[0.9em] font-semibold text-slate-800">{part.slice(1, -1)}</code>;
    }
    const markdownLink = part.match(/^\[([^\]]+)\]\([^)]+\)$/);
    if (markdownLink) return <span key={index} className="font-semibold text-slate-900">{markdownLink[1]}</span>;
    return <span key={index}>{part}</span>;
  });
}

function FormattedAnswer({ text }: { text: string }) {
  const blocks = parseAnswerBlocks(text);
  return (
    <div className="max-w-4xl space-y-5 text-[15px] leading-7 text-slate-700">
      {blocks.map((block, blockIndex) => {
        if (block.type === "divider") {
          return <hr key={blockIndex} className="border-0 border-t border-violet-100" />;
        }
        if (block.type === "heading") {
          return <h3 key={blockIndex} className="pt-1 text-lg font-extrabold leading-7 text-slate-950">{renderAnswerInline(block.text)}</h3>;
        }
        if (block.type === "list") {
          const List = block.ordered ? "ol" : "ul";
          return (
            <List
              key={blockIndex}
              className={block.ordered
                ? "list-decimal space-y-2 pl-6 marker:font-bold marker:text-violet-600"
                : "list-disc space-y-2 pl-6 marker:text-violet-500"}
            >
              {block.items.map((item, itemIndex) => <li key={itemIndex} className="pl-1">{renderAnswerInline(item)}</li>)}
            </List>
          );
        }
        return (
          <p key={blockIndex}>
            {block.lines.map((line, lineIndex) => (
              <span key={lineIndex}>
                {lineIndex > 0 && <br />}
                {renderAnswerInline(line)}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}

function downloadQaPdf(result: QAResult) {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 54;
  const contentW = pageW - margin * 2;
  const sourceLabel = result.answerSource === "web"
    ? "Found online"
    : result.answerSource === "trainings"
      ? "Answer from your trainings"
      : "Replay Vault answer";
  const addFooter = () => {
    const pageCount = doc.getNumberOfPages();
    for (let page = 1; page <= pageCount; page += 1) {
      doc.setPage(page);
      doc.setDrawColor(226, 232, 240);
      doc.line(margin, pageH - 42, pageW - margin, pageH - 42);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text("Fearless Influencer Academy — Replay Vault Q&A", margin, pageH - 25);
      doc.text(`Page ${page} of ${pageCount}`, pageW - margin, pageH - 25, { align: "right" });
    }
  };
  const drawContentHeader = () => {
    doc.setFillColor(30, 27, 75);
    doc.rect(0, 0, pageW, 46, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(255, 255, 255);
    doc.text("Fearless Influencer Academy", margin, 29);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text("Replay Vault Q&A", pageW - margin, 29, { align: "right" });
  };

  // Cover page
  doc.setFillColor(30, 27, 75);
  doc.rect(0, 0, pageW, pageH, "F");
  doc.setFillColor(124, 58, 237);
  doc.rect(0, 0, pageW, 14, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Fearless Influencer Academy", margin, 92);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(221, 214, 254);
  doc.text("Replay Vault Q&A", margin, 116);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(27);
  doc.setTextColor(255, 255, 255);
  const coverQuestion = doc.splitTextToSize(cleanAnswerText(result.question), contentW);
  doc.text(coverQuestion, margin, 245);
  const questionHeight = coverQuestion.length * 32;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(221, 214, 254);
  doc.text("QUESTION", margin, 205);
  doc.setFillColor(196, 181, 253);
  const badgeWidth = sourceLabel === "Answer from your trainings" ? 156 : 116;
  doc.roundedRect(margin, 245 + questionHeight + 34, badgeWidth, 24, 12, 12, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(49, 46, 129);
  doc.text(sourceLabel, margin + badgeWidth / 2, 245 + questionHeight + 50, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(196, 181, 253);
  doc.text("A formatted answer from the Replay Vault", margin, pageH - 70);

  // Answer pages
  doc.addPage();
  drawContentHeader();
  let y = 82;
  const ensureSpace = (height: number) => {
    if (y + height > pageH - 62) {
      doc.addPage();
      drawContentHeader();
      y = 78;
    }
  };
  const answerTitle = doc.splitTextToSize(cleanAnswerText(result.question), contentW);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42);
  doc.text(answerTitle, margin, y);
  y += answerTitle.length * 22 + 14;
  doc.setDrawColor(221, 214, 254);
  doc.line(margin, y, pageW - margin, y);
  y += 26;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(109, 40, 217);
  doc.text(sourceLabel.toUpperCase(), margin, y);
  y += 24;

  for (const block of parseAnswerBlocks(result.answer)) {
    if (block.type === "divider") {
      ensureSpace(18);
      doc.setDrawColor(226, 232, 240);
      doc.line(margin, y, pageW - margin, y);
      y += 18;
      continue;
    }
    if (block.type === "heading") {
      const lines = doc.splitTextToSize(cleanAnswerText(block.text), contentW);
      ensureSpace(lines.length * 18 + 14);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(15, 23, 42);
      doc.text(lines, margin, y);
      y += lines.length * 18 + 12;
      continue;
    }
    if (block.type === "paragraph") {
      const lines = doc.splitTextToSize(cleanAnswerText(block.lines.join(" ")), contentW);
      ensureSpace(lines.length * 15 + 12);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10.5);
      doc.setTextColor(51, 65, 85);
      doc.text(lines, margin, y);
      y += lines.length * 15 + 12;
      continue;
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    for (const [index, item] of block.items.entries()) {
      const prefix = block.ordered ? `${index + 1}. ` : "• ";
      const itemLines = doc.splitTextToSize(`${prefix}${cleanAnswerText(item)}`, contentW - 14);
      ensureSpace(itemLines.length * 15 + 7);
      doc.setTextColor(51, 65, 85);
      doc.text(itemLines, margin + 10, y);
      y += itemLines.length * 15 + 7;
    }
    y += 5;
  }

  if (result.sources.length > 0) {
    ensureSpace(50);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(15, 23, 42);
    doc.text("Supporting training", margin, y);
    y += 20;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(51, 65, 85);
    for (const source of result.sources) {
      const lines = doc.splitTextToSize(`${stamp(source.startSeconds)} — ${cleanAnswerText(source.title)}`, contentW - 10);
      ensureSpace(lines.length * 15 + 5);
      doc.text(`• ${lines[0]}`, margin + 10, y);
      if (lines.length > 1) doc.text(lines.slice(1), margin + 19, y + 15);
      y += lines.length * 15 + 5;
    }
  }

  addFooter();
  const filename = `replay-vault-qa-${cleanAnswerText(result.question).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "answer"}.pdf`;
  doc.save(filename);
}

function getVideoEmbedUrl(videoUrl: string | null | undefined, startSeconds: number) {
  if (!videoUrl) return null;
  try {
    const url = new URL(videoUrl);
    const start = Math.max(0, Math.floor(startSeconds));
    if (url.hostname.includes("vimeo.com")) {
      const videoId = url.pathname.match(/(?:^|\/)(?:video\/)?(\d+)(?:\/|$)/)?.[1];
      return videoId
        ? `https://player.vimeo.com/video/${videoId}?api=1&autoplay=1&transcript=1#t=${start}s`
        : null;
    }
    if (url.hostname.includes("youtube.com")) {
      const videoId = url.searchParams.get("v");
      return videoId ? `https://www.youtube.com/embed/${videoId}?start=${start}&autoplay=1&enablejsapi=1` : null;
    }
    if (url.hostname.includes("youtu.be")) {
      const videoId = url.pathname.split("/").filter(Boolean)[0];
      return videoId ? `https://www.youtube.com/embed/${videoId}?start=${start}&autoplay=1&enablejsapi=1` : null;
    }
    if (url.hostname.includes("wistia.com") || url.hostname.includes("wi.st")) {
      const videoId = url.pathname.split("/").filter(Boolean).pop();
      return videoId ? `https://fast.wistia.net/embed/iframe/${videoId}?time=${start}&autoPlay=true` : null;
    }
    return null;
  } catch {
    return null;
  }
}

function isDirectVideoUrl(videoUrl: string | null | undefined) {
  return Boolean(videoUrl && /\.(?:mp4|webm|ogg)(?:$|[?#])/i.test(videoUrl));
}

function TranscriptVideoDialog({ active, onWatchFull }: {
  active: ActiveMatch;
  onWatchFull: () => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const embedUrl = getVideoEmbedUrl(active.item.videoUrl, active.match.startSeconds);
  const isVimeo = Boolean(active.item.videoUrl?.includes("vimeo.com"));
  const isDirect = isDirectVideoUrl(active.item.videoUrl);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isDirect || !active.item.videoUrl) return;
    const seekAndPlay = () => {
      video.currentTime = active.match.startSeconds;
      void video.play().catch(async () => {
        // Keep audio enabled if the browser requires a manual play gesture.
      });
    };
    if (video.readyState >= 1) seekAndPlay();
    else video.addEventListener("loadedmetadata", seekAndPlay, { once: true });
    return () => {
      video.removeEventListener("loadedmetadata", seekAndPlay);
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [active, isDirect]);

  useEffect(() => {
    if (!isVimeo || !iframeRef.current || !embedUrl) return;
    const player = new Player(iframeRef.current);
    let disposed = false;
    void (async () => {
      try {
        await player.setCurrentTime(active.match.startSeconds);
        if (disposed) return;
        await player.play();
      } catch {
        if (disposed) return;
        try {
          await player.play();
        } catch {
          // The unmuted player remains available for manual playback.
        }
      }
    })();
    return () => {
      disposed = true;
      void player.pause().catch(() => undefined);
      // Do not call destroy() here. React development mode intentionally runs
      // effect cleanup during initialization, and destroying the iframe then
      // severs the Vimeo API connection used for transcript tracking. Closing
      // the dialog unmounts the iframe after this explicit pause.
    };
  }, [active, embedUrl, isVimeo]);

  return (
    <DialogContent className="w-[calc(100vw-2rem)] max-w-4xl overflow-hidden p-0">
      <DialogHeader className="px-5 pt-5 sm:px-6 sm:pt-6">
        <DialogTitle>{active.item.title}</DialogTitle>
        <DialogDescription>
          Starting at {stamp(active.match.startSeconds)} in this training.
        </DialogDescription>
      </DialogHeader>
      <div className="px-5 pb-5 sm:px-6 sm:pb-6">
        {embedUrl ? (
          <div className="aspect-video overflow-hidden rounded-xl bg-slate-950">
            <iframe
              ref={isVimeo ? iframeRef : undefined}
              src={embedUrl}
              className="h-full w-full"
              allow="autoplay; fullscreen; picture-in-picture"
              allowFullScreen
              title={active.item.title}
            />
          </div>
        ) : isDirect && active.item.videoUrl ? (
          <video
            ref={videoRef}
            controls
            autoPlay
            playsInline
            className="aspect-video w-full rounded-xl bg-slate-950"
          >
            <source src={active.item.videoUrl} />
          </video>
        ) : (
          <div className="flex aspect-video items-center justify-center rounded-xl bg-slate-950 px-6 text-center text-sm text-slate-300">
            This video cannot be previewed here. Open the full training to watch it.
          </div>
        )}
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-950">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white" aria-hidden="true">
            <FileSearch className="h-4 w-4" />
          </span>
          <p className="leading-5">
            <span className="font-bold">Want to follow the transcript?</span>{" "}
            Click the <span className="inline-flex items-center gap-1 rounded border border-blue-300 bg-white px-1.5 py-0.5 align-middle text-xs font-extrabold tracking-wide text-blue-800"><FileSearch className="h-3.5 w-3.5" />Transcript</span> button in the video player to open it.
          </p>
        </div>
        <Button className="mt-4 w-full" onClick={onWatchFull}>
          <Play className="mr-1.5 h-3.5 w-3.5" />
          Watch this training in full
        </Button>
      </div>
    </DialogContent>
  );
}

export default function TrainingLibraryPage() {
  const [, go] = useLocation();
  const [q, setQ] = useState("");
  const [mode, setMode] = useState<SearchMode>("trainings");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [category, setCategory] = useState("all");
  const [tags, setTags] = useState<string[]>([]);
  const [topicsOpen, setTopicsOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [activeMatch, setActiveMatch] = useState<ActiveMatch | null>(null);
  const qaMutation = useMutation<QAResult, Error, string>({
    mutationFn: (question) => postApi("/api/training/library/qa", { question }),
  });
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQ(q), 300);
    return () => window.clearTimeout(timer);
  }, [q]);
  const { data, isLoading, isError, refetch } = useQuery<{
    items?: Item[];
    replays?: Item[];
    facets?: { categories: string[]; tags: string[] };
    pagination?: { page: number; pageSize: number; total: number; totalPages: number };
  }>({
    queryKey: ["/api/training/library", mode, debouncedQ, category, tags, page],
    queryFn: () => api(`/api/training/library?mode=${mode}&q=${encodeURIComponent(debouncedQ)}&category=${encodeURIComponent(category === "all" ? "" : category)}&tags=${encodeURIComponent(tags.join(","))}&page=${page}`),
    placeholderData: keepPreviousData,
    enabled: mode !== "qa",
  });
  const items = data?.items || data?.replays || [];
  const categories = data?.facets?.categories || [];
  const availableTags = data?.facets?.tags || [];
  const pagination = data?.pagination;
  const active = Boolean(q || category !== "all" || tags.length);
  const clearQuery = () => {
    setQ("");
    setDebouncedQ("");
    setPage(1);
    if (mode === "qa") qaMutation.reset();
  };
  const heading = useMemo(() => mode === "qa"
    ? "Ask the Replay Vault"
    : active
      ? `${pagination?.total ?? items.length} replay${(pagination?.total ?? items.length) === 1 ? "" : "s"} found`
      : "The Replay Vault", [active, items.length, mode, pagination?.total]);
  const toggle = (tag: string) => {
    setPage(1);
    setTags((current) => current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]);
  };
  const clear = () => { setQ(""); setDebouncedQ(""); setCategory("all"); setTags([]); setPage(1); };
  return <main className="min-h-[calc(100dvh-3rem)] bg-[radial-gradient(circle_at_88%_0%,hsl(254_74%_91%),transparent_30rem)] px-4 py-8 sm:px-8">
    <div className="mx-auto max-w-7xl">
      <header className="mb-8 max-w-3xl"><div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-violet-700"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-700 text-white"><Library className="h-4 w-4" /></span> Fearless Influencer Academy</div><h1 className="text-4xl font-extrabold tracking-tight text-slate-950 sm:text-5xl">{heading}</h1><p className="mt-3 max-w-2xl text-base text-slate-600">Practical sessions, sharp ideas, and the context to put them to work.</p></header>
      <section className="mb-8 rounded-2xl border border-violet-100 bg-white/90 p-4 shadow-[0_14px_35px_-28px_rgba(46,16,101,.42)]">
        <div className="mb-4 grid grid-cols-3 gap-2 rounded-xl bg-violet-50 p-1.5" role="tablist" aria-label="Search mode">
          <button type="button" role="tab" aria-selected={mode === "trainings"} className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-bold transition ${mode === "trainings" ? "bg-white text-violet-900 shadow-sm" : "text-slate-600 hover:text-violet-800"}`} onClick={() => { setMode("trainings"); setPage(1); }}>
            <Library className="h-4 w-4" />Search trainings
          </button>
          <button type="button" role="tab" aria-selected={mode === "transcripts"} className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-bold transition ${mode === "transcripts" ? "bg-white text-violet-900 shadow-sm" : "text-slate-600 hover:text-violet-800"}`} onClick={() => { setMode("transcripts"); setPage(1); }}>
            <FileSearch className="h-4 w-4" />Search transcripts
          </button>
          <button type="button" role="tab" aria-selected={mode === "qa"} className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-bold transition ${mode === "qa" ? "bg-white text-violet-900 shadow-sm" : "text-slate-600 hover:text-violet-800"}`} onClick={() => { setMode("qa"); setPage(1); }}>
            <MessageCircleQuestion className="h-4 w-4" />Q&amp;A
          </button>
        </div>
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const question = q.trim();
            if (mode === "qa" && question.length >= 3) qaMutation.mutate(question);
          }}
        >
          <div className="relative min-w-0 flex-1">
            {mode === "qa" ? <MessageCircleQuestion className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-violet-600" /> : <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-violet-600" />}
            <Input
              className={`h-11 w-full border-violet-100 pl-10 ${q ? "pr-10" : ""}`}
              placeholder={mode === "qa" ? "Ask a question about the trainings" : mode === "transcripts" ? "Search what was said in every training" : "Search titles, descriptions, categories, and topics"}
              value={q}
              onChange={(event) => { setQ(event.target.value); setPage(1); }}
            />
            {q && (
              <button
                type="button"
                aria-label="Clear search"
                className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 transition hover:bg-violet-50 hover:text-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                onClick={clearQuery}
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {mode === "qa" && (
            <Button type="submit" className="h-11 shrink-0 px-5" disabled={q.trim().length < 3 || qaMutation.isPending}>
              {qaMutation.isPending ? "Thinking…" : "Ask"}
            </Button>
          )}
        </form>
        {mode === "trainings" && <div className="mt-4 flex flex-wrap items-center gap-2"><span className="mr-1 text-xs font-bold uppercase tracking-wider text-slate-500">Browse</span><Button size="sm" variant={category === "all" ? "default" : "outline"} onClick={() => { setCategory("all"); setPage(1); }}>All sessions</Button>{categories.map((item) => <Button key={item} size="sm" variant={category === item ? "default" : "outline"} onClick={() => { setCategory(item); setPage(1); }}>{item}</Button>)}</div>}
        {mode === "trainings" && availableTags.length > 0 && (
          <div className="mt-3 border-t border-violet-50 pt-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-slate-500">
                <Tag className="h-3.5 w-3.5" />
                Topics
              </span>
              <Popover open={topicsOpen} onOpenChange={setTopicsOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    role="combobox"
                    aria-expanded={topicsOpen}
                    className="min-w-[210px] justify-between border-violet-100 bg-white text-slate-700"
                  >
                    <span>{tags.length ? `${tags.length} topic${tags.length === 1 ? "" : "s"} selected` : "Choose topics"}</span>
                    <ChevronDown className="ml-2 h-3.5 w-3.5 text-violet-500" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-[min(22rem,calc(100vw-2rem))] p-0">
                  <Command>
                    <CommandInput placeholder="Search topics…" />
                    <CommandList>
                      <CommandEmpty>No matching topics.</CommandEmpty>
                      <CommandGroup heading={`${availableTags.length} available topic${availableTags.length === 1 ? "" : "s"}`}>
                        {availableTags.map((item) => (
                          <CommandItem key={item} value={item} onSelect={() => toggle(item)}>
                            <span className="flex h-4 w-4 items-center justify-center rounded border border-violet-200">
                              {tags.includes(item) && <Check className="h-3 w-3 text-violet-700" />}
                            </span>
                            <span className="truncate">{item}</span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {active && <Button size="sm" variant="ghost" className="ml-auto text-slate-500" onClick={clear}><X className="mr-1 h-3.5 w-3.5" />Clear</Button>}
            </div>
            {tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2" aria-label="Selected topics">
                {tags.map((item) => (
                  <Badge key={item} className="gap-1.5 bg-violet-100 px-2.5 py-1 text-violet-900 hover:bg-violet-100">
                    {item}
                    <button
                      type="button"
                      aria-label={`Remove ${item}`}
                      className="rounded-full text-violet-600 hover:text-violet-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600"
                      onClick={() => toggle(item)}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
      {mode === "qa" ? (
        qaMutation.isPending ? (
          <div className="rounded-2xl border border-violet-100 bg-white p-8 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
                <Sparkles className="h-5 w-5 animate-pulse" />
              </span>
              <div>
                <h2 className="font-bold text-slate-950">Searching your trainings first</h2>
                <p className="text-sm text-slate-600">If the library does not cover it, we’ll research authoritative online sources next…</p>
              </div>
            </div>
            <div className="mt-6 space-y-3">
              <div className="h-4 w-full animate-pulse rounded bg-violet-100" />
              <div className="h-4 w-11/12 animate-pulse rounded bg-violet-100" />
              <div className="h-4 w-4/5 animate-pulse rounded bg-violet-100" />
            </div>
          </div>
        ) : qaMutation.isError ? (
          <div className="rounded-2xl border border-destructive/30 bg-white p-10 text-center">
            <p className="font-semibold text-destructive">{qaMutation.error.message}</p>
            <Button variant="outline" className="mt-3" onClick={() => q.trim().length >= 3 && qaMutation.mutate(q.trim())}>Try again</Button>
          </div>
        ) : qaMutation.data ? (
          <div className="space-y-5">
            <article className="overflow-hidden rounded-2xl border border-violet-100 bg-white shadow-sm">
              <div className="flex flex-col gap-4 border-b border-violet-100 bg-violet-50/70 px-5 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-7">
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-700">Your question</p>
                  <h2 className="mt-1 text-xl font-extrabold text-slate-950">{qaMutation.data.question}</h2>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 border-violet-200 bg-white text-violet-800"
                  onClick={() => downloadQaPdf(qaMutation.data!)}
                >
                  <Download className="mr-1 h-3.5 w-3.5" />
                  Download as a PDF
                </Button>
              </div>
              <div className="px-5 py-6 sm:px-7">
                <div className="mb-4 flex items-center gap-2 text-sm font-bold text-violet-700">
                  {qaMutation.data.answerSource === "web" ? <Globe2 className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                  {qaMutation.data.answerSource === "web"
                    ? "Found online"
                    : qaMutation.data.answerSource === "trainings"
                      ? "Answer from your trainings"
                      : "No adequate answer found"}
                </div>
                {qaMutation.data.answerSource === "web" && (
                  <p className="mb-4 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-950">
                    There’s no supporting training information for this question, but here’s what we found online to help answer it.
                  </p>
                )}
                <FormattedAnswer text={qaMutation.data.answer} />
              </div>
            </article>
            {qaMutation.data.sources.length > 0 && (
              <section aria-labelledby="qa-sources-heading">
                <div className="mb-3">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-700">Go deeper</p>
                  <h2 id="qa-sources-heading" className="mt-1 text-xl font-extrabold text-slate-950">Watch the supporting training</h2>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {qaMutation.data.sources.map((source, index) => (
                    <article key={`${source.replayId}-${source.startSeconds}-${index}`} className="flex items-center justify-between gap-4 rounded-2xl border border-violet-100 bg-white p-4 shadow-sm">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-violet-700">{stamp(source.startSeconds)}</p>
                        <h3 className="mt-0.5 truncate font-bold text-slate-950">{source.title}</h3>
                      </div>
                      <Button
                        size="sm"
                        className="shrink-0"
                        onClick={() => setActiveMatch({
                          item: { id: source.replayId, slug: source.slug, title: source.title, videoUrl: source.videoUrl },
                          match: { text: source.text, startSeconds: source.startSeconds, endSeconds: source.endSeconds, version: 0 },
                        })}
                      >
                        <Play className="mr-1.5 h-3.5 w-3.5" />
                        Watch this part
                      </Button>
                    </article>
                  ))}
                </div>
              </section>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-violet-200 bg-white/70 p-14 text-center">
            <MessageCircleQuestion className="mx-auto h-10 w-10 text-violet-400" />
            <h2 className="mt-4 font-semibold text-slate-900">Ask the trainings a question</h2>
            <p className="mx-auto mt-1 max-w-2xl text-sm leading-6 text-slate-600">
              Ask for guidance, examples, or practical steps. Your answer will be based only on what was taught in the available training transcripts.
            </p>
          </div>
        )
      ) : isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((item) => <div key={item} className="h-72 animate-pulse rounded-2xl bg-violet-100/70" />)}
        </div>
      ) : isError ? (
        <div className="rounded-2xl border border-destructive/30 bg-white p-10 text-center">
          <p className="font-semibold text-destructive">We couldn’t load the library.</p>
          <Button variant="outline" className="mt-3" onClick={() => refetch()}>Try again</Button>
        </div>
      ) : mode === "transcripts" && !debouncedQ ? (
        <div className="rounded-2xl border border-dashed border-violet-200 bg-white/70 p-14 text-center">
          <FileSearch className="mx-auto h-10 w-10 text-violet-400" />
          <h2 className="mt-4 font-semibold text-slate-900">Search inside every transcript</h2>
          <p className="mx-auto mt-1 max-w-xl text-sm text-slate-600">Enter a phrase, question, or topic to find the exact moments where it was discussed.</p>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-violet-200 bg-white/70 p-14 text-center">
          <Library className="mx-auto h-10 w-10 text-violet-300" />
          <h2 className="mt-4 font-semibold text-slate-900">{active ? "No matching replays" : "No replays available yet"}</h2>
          <p className="mt-1 text-sm text-slate-600">{active ? "Try clearing a filter or using a different phrase." : "Check back soon for the next session."}</p>
          {active && <Button className="mt-4" variant="outline" onClick={clear}>Clear filters</Button>}
        </div>
      ) : (
        <>
        {mode === "transcripts" ? (
          <section className="mb-8 space-y-4" aria-labelledby="transcript-results-heading">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-700">Exact moments</p>
              <h2 id="transcript-results-heading" className="mt-1 text-2xl font-extrabold text-slate-950">Transcript matches</h2>
            </div>
            {items.flatMap((item) => (item.transcriptMatches || []).map((match, index) => (
              <article key={`${item.id}-${match.startSeconds}-${index}`} className="rounded-2xl border border-violet-100 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-violet-700">{stamp(match.startSeconds)}</p>
                    <h3 className="mt-1 font-bold text-slate-950">{item.title}</h3>
                  </div>
                  <Button size="sm" onClick={() => setActiveMatch({ item, match })}>
                    <Play className="mr-1.5 h-3.5 w-3.5" />Watch video
                  </Button>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-slate-700">{match.text}</p>
              </article>
            )))}
          </section>
        ) : <div className="grid items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => {
            return (
              <button
                key={item.id}
                onClick={() => go(`/training/library/${item.slug}`)}
                className="group flex h-full flex-col overflow-hidden rounded-2xl border border-violet-100 bg-white text-left shadow-sm transition duration-200 hover:-translate-y-1 hover:shadow-[0_18px_35px_-22px_rgba(46,16,101,.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600"
              >
                <div className="relative aspect-[16/9] w-full shrink-0 overflow-hidden bg-[linear-gradient(135deg,hsl(254_62%_33%),hsl(230_60%_17%))]">
                  {item.thumbnailUrl ? (
                    <img src={item.thumbnailUrl} alt="" className="absolute inset-0 block h-full w-full object-cover transition duration-500 group-hover:scale-[1.035]" />
                  ) : (
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_15%,rgba(255,255,255,.22),transparent_25%)]" />
                  )}
                  {item.completed && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/60 text-center">
                      <CheckCircle2 className="h-16 w-16 text-emerald-400 drop-shadow-lg" strokeWidth={2.5} />
                      <span className="mt-2 text-sm font-extrabold uppercase tracking-[0.16em] text-white">Completed</span>
                    </div>
                  )}
                </div>
                <div className="flex flex-1 flex-col p-5">
                  <h2 className="line-clamp-2 min-h-[3.5rem] text-lg font-bold leading-tight text-slate-950 transition group-hover:text-violet-700">{item.title}</h2>
                  <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-slate-600">{item.description || "Open this replay to watch the full session."}</p>
                  {item.category && <span className="mt-3 inline-flex w-fit rounded-full border border-red-700 bg-red-600 px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wider text-white shadow-sm">{item.category}</span>}
                  <div className="mt-auto flex items-center justify-between border-t border-violet-50 pt-3 text-xs font-medium text-slate-500">
                    <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-violet-600" />{item.durationMinutes ? `${item.durationMinutes} min` : "Replay"}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>}
        {pagination && pagination.totalPages > 1 && (
          <nav className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-violet-100 bg-white px-4 py-3 shadow-sm" aria-label="Replay Vault pages">
            <p className="text-sm font-medium text-slate-600">
              Showing {(pagination.page - 1) * pagination.pageSize + 1}–{Math.min(pagination.page * pagination.pageSize, pagination.total)} of {pagination.total}
            </p>
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" disabled={pagination.page <= 1} onClick={() => { setPage((current) => Math.max(1, current - 1)); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
                <ChevronLeft className="mr-1 h-4 w-4" />
                Previous
              </Button>
              <span className="text-sm font-bold text-slate-700">Page {pagination.page} of {pagination.totalPages}</span>
              <Button variant="outline" size="sm" disabled={pagination.page >= pagination.totalPages} onClick={() => { setPage((current) => current + 1); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
                Next
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </nav>
        )}
        </>
      )}
      <Dialog
        open={Boolean(activeMatch)}
        onOpenChange={(open) => {
          if (!open) setActiveMatch(null);
        }}
      >
        {activeMatch && (
          <TranscriptVideoDialog
            active={activeMatch}
            onWatchFull={() => {
              const target = `/training/library/${activeMatch.item.slug}?t=${Math.floor(activeMatch.match.startSeconds)}&fromTranscriptSearch=1`;
              setActiveMatch(null);
              go(target);
            }}
          />
        )}
      </Dialog>
    </div>
  </main>;
}