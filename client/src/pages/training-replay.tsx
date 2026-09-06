import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import Player from "@vimeo/player";
import DOMPurify from "dompurify";
import { ArrowLeft, ChevronDown, Clock, ExternalLink, FileText, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TrainingResourceIcon } from "@/components/training-resource-icon";
import { cn } from "@/lib/utils";

type Resource = { id: string; name: string; url: string; subtitle?: string | null; kind?: string };
type Chapter = { startSeconds: number; title: string };
type Cue = { startSeconds: number; text: string };
type Replay = {
  title: string;
  description?: string | null;
  category?: string | null;
  durationMinutes?: number | null;
  videoUrl?: string | null;
  content?: string | null;
  resources?: Resource[];
  transcriptText?: string | null;
  transcriptCues?: Cue[];
  transcriptChapters?: Chapter[];
};

async function api(url: string) {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) throw new Error("This replay is not available.");
  return response.json();
}

function safeHref(url: string) {
  try {
    const protocol = new URL(url).protocol;
    return protocol === "https:" || protocol === "http:" ? url : "#";
  } catch {
    return "#";
  }
}

function formatTimestamp(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remaining = String(total % 60).padStart(2, "0");
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${remaining}`
    : `${minutes}:${remaining}`;
}

function getEmbedUrl(videoUrl?: string | null) {
  if (!videoUrl) return null;
  try {
    const url = new URL(videoUrl);
    if (url.hostname.includes("vimeo.com")) {
      const videoId = url.pathname.match(/(?:^|\/)(?:video\/)?(\d+)(?:\/|$)/)?.[1];
      if (!videoId) return null;
      const params = new URLSearchParams(url.search);
      params.set("api", "1");
      return `https://player.vimeo.com/video/${videoId}?${params.toString()}`;
    }
    if (url.hostname.includes("youtube.com")) {
      const videoId = url.searchParams.get("v");
      return videoId ? `https://www.youtube.com/embed/${videoId}` : null;
    }
    if (url.hostname.includes("youtu.be")) {
      const videoId = url.pathname.split("/").filter(Boolean)[0];
      return videoId ? `https://www.youtube.com/embed/${videoId}` : null;
    }
    return null;
  } catch {
    return null;
  }
}

export default function TrainingReplayPage() {
  const { slug } = useParams<{ slug: string }>();
  const [, go] = useLocation();
  const { data: replay, isLoading, isError } = useQuery<Replay>({
    queryKey: ["/api/training/replays", slug],
    queryFn: () => api(`/api/training/replays/${slug}`),
  });
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [transcriptTab, setTranscriptTab] = useState<"chapters" | "transcript">("chapters");
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);
  const vimeoPlayerRef = useRef<HTMLIFrameElement>(null);
  const vimeoPlayerApiRef = useRef<Player | null>(null);
  const transcriptScrollContainerRef = useRef<HTMLDivElement>(null);
  const activeTranscriptWordRef = useRef<HTMLSpanElement>(null);
  const lastScrolledWordRef = useRef<number | null>(null);

  const embedUrl = getEmbedUrl(replay?.videoUrl);
  const isVimeoReplay = Boolean(replay?.videoUrl?.includes("vimeo.com"));
  const chapters = replay?.transcriptChapters ?? [];
  const transcriptCues = replay?.transcriptCues ?? [];
  const transcriptText = replay?.transcriptText ?? "";
  const transcriptTokens = transcriptText.split(/(\s+)/);
  let transcriptWordCount = 0;
  const transcriptTokenWordIndexes = transcriptTokens.map((token) => {
    if (!token || /^\s+$/.test(token)) return -1;
    return transcriptWordCount++;
  });
  const activeCueIndex = transcriptCues.findIndex((cue, index) => {
    const nextCue = transcriptCues[index + 1];
    return videoCurrentTime >= cue.startSeconds
      && videoCurrentTime < (nextCue?.startSeconds ?? cue.startSeconds + 8);
  });
  const activeCue = activeCueIndex >= 0 ? transcriptCues[activeCueIndex] : null;
  const activeCueEnd = activeCueIndex >= 0
    ? (transcriptCues[activeCueIndex + 1]?.startSeconds ?? activeCue!.startSeconds + 8)
    : 0;
  const activeCueWords = activeCue?.text.trim().split(/\s+/).filter(Boolean) ?? [];
  const activeWordInCue = activeCue
    ? Math.min(
        activeCueWords.length - 1,
        Math.floor(
          Math.min(
            0.999,
            Math.max(
              0,
              (videoCurrentTime - activeCue.startSeconds)
                / Math.max(0.1, activeCueEnd - activeCue.startSeconds),
            ),
          ) * activeCueWords.length,
        ),
      )
    : -1;
  const activeWordIndex = activeCue
    ? transcriptCues
        .slice(0, activeCueIndex)
        .reduce((count, cue) => count + cue.text.trim().split(/\s+/).filter(Boolean).length, 0)
      + activeWordInCue
    : -1;

  useEffect(() => {
    const iframe = vimeoPlayerRef.current;
    if (!iframe || !isVimeoReplay || !embedUrl) return;
    const player = new Player(iframe);
    const update = ({ seconds }: { seconds: number }) => setVideoCurrentTime(seconds);
    vimeoPlayerApiRef.current = player;
    player.on("timeupdate", update);
    const initialTime = Number(new URLSearchParams(window.location.search).get("t"));
    if (Number.isFinite(initialTime) && initialTime > 0) void player.setCurrentTime(initialTime);
    return () => {
      player.off("timeupdate", update);
      if (vimeoPlayerApiRef.current === player) vimeoPlayerApiRef.current = null;
    };
  }, [embedUrl, isVimeoReplay]);

  useEffect(() => {
    if (!transcriptOpen || transcriptTab !== "transcript" || activeWordIndex < 0) return;
    if (lastScrolledWordRef.current === activeWordIndex) return;
    lastScrolledWordRef.current = activeWordIndex;
    const container = transcriptScrollContainerRef.current;
    const word = activeTranscriptWordRef.current;
    if (!container || !word) return;
    const containerRect = container.getBoundingClientRect();
    const wordRect = word.getBoundingClientRect();
    if (wordRect.top < containerRect.top || wordRect.bottom > containerRect.bottom) {
      const offset = wordRect.top - containerRect.top - (container.clientHeight - wordRect.height) / 2;
      container.scrollBy({ top: offset, behavior: "smooth" });
    }
  }, [activeWordIndex, transcriptOpen, transcriptTab]);

  useEffect(() => {
    setTranscriptOpen(false);
    setTranscriptTab("chapters");
    setVideoCurrentTime(0);
    lastScrolledWordRef.current = null;
  }, [slug]);

  const seekToChapter = (seconds: number) => {
    if (!isVimeoReplay) return;
    void vimeoPlayerApiRef.current?.setCurrentTime(seconds);
    vimeoPlayerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  if (isLoading) {
    return (
      <main className="mx-auto max-w-[1400px] space-y-5 px-4 py-8 sm:px-8">
        <div className="h-8 w-72 animate-pulse rounded bg-muted" />
        <div className="aspect-video animate-pulse rounded-xl bg-muted" />
      </main>
    );
  }
  if (isError || !replay) {
    return (
      <main className="p-10 text-center">
        <h1 className="text-xl font-bold">Replay unavailable</h1>
        <p className="mt-2 text-muted-foreground">It may no longer be published or you may not have access.</p>
        <Button className="mt-5" onClick={() => go("/training/library")}>Back to library</Button>
      </main>
    );
  }

  return (
    <main className="min-h-[calc(100vh-3rem)] bg-slate-50">
      <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        <div className="mx-auto w-full max-w-[1100px]">
          <Button variant="ghost" className="-ml-4 mb-5" onClick={() => go("/training/library")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Training Library
          </Button>

          <div className="mb-4 flex flex-wrap items-center gap-2">
            {replay.category && (
              <span className="inline-flex rounded-full border border-red-700 bg-red-600 px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wider text-white shadow-sm">
                {replay.category}
              </span>
            )}
            {replay.durationMinutes && (
              <span className="flex items-center gap-1 text-sm text-slate-500">
                <Clock className="h-4 w-4" />
                {replay.durationMinutes} min
              </span>
            )}
          </div>

          <h1 className="mb-3 text-[28px] font-bold leading-tight tracking-tight text-slate-950 sm:text-4xl">
            {replay.title}
          </h1>
          {replay.description && (
            <p className="mb-7 w-full text-base leading-7 text-slate-600 sm:text-lg">
              {replay.description}
            </p>
          )}
        </div>

        {embedUrl ? (
          <div className="mx-auto mb-8 w-full max-w-[1100px]">
            <div className="aspect-video overflow-hidden rounded-xl bg-slate-950 shadow-sm">
              <iframe
                ref={isVimeoReplay ? vimeoPlayerRef : undefined}
                src={embedUrl}
                className="h-full w-full"
                allowFullScreen
                title={replay.title}
              />
            </div>
          </div>
        ) : (
          <div className="mx-auto mb-8 flex aspect-video w-full max-w-[1100px] items-center justify-center rounded-xl bg-slate-900 text-slate-300">
            <Play className="mr-2 h-5 w-5" />
            Video coming soon
          </div>
        )}

        <div className="mx-auto max-w-[780px]">
          {transcriptText && (
            <div className="mx-auto mb-8 mt-8 w-full overflow-hidden rounded-xl border border-blue-100 bg-blue-50/60">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                onClick={() => setTranscriptOpen((open) => !open)}
                aria-expanded={transcriptOpen}
              >
                <span className="flex items-center gap-2 text-[13px] font-semibold text-blue-900">
                  <FileText className="h-4 w-4" />
                  View Chapters / Transcript
                </span>
                <ChevronDown className={cn("h-4 w-4 text-blue-900 transition-transform", transcriptOpen && "rotate-180")} />
              </button>

              {transcriptOpen && (
                <div className="border-t border-blue-100 bg-white">
                  <div className="flex gap-1 border-b border-blue-50 px-4 pt-3" role="tablist" aria-label="Replay transcript">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={transcriptTab === "chapters"}
                      onClick={() => setTranscriptTab("chapters")}
                      className={cn(
                        "rounded-t-md px-3 py-2 text-[12px] font-semibold transition-colors",
                        transcriptTab === "chapters"
                          ? "border border-b-blue-50 border-blue-100 bg-blue-50 text-blue-900"
                          : "text-slate-500",
                      )}
                    >
                      Chapters
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={transcriptTab === "transcript"}
                      onClick={() => setTranscriptTab("transcript")}
                      className={cn(
                        "rounded-t-md px-3 py-2 text-[12px] font-semibold transition-colors",
                        transcriptTab === "transcript"
                          ? "border border-b-blue-50 border-blue-100 bg-blue-50 text-blue-900"
                          : "text-slate-500",
                      )}
                    >
                      Transcript
                    </button>
                  </div>

                  <div ref={transcriptScrollContainerRef} className="max-h-[360px] overflow-y-auto">
                    {transcriptTab === "chapters" ? (
                      <div className="p-3">
                        {chapters.length > 0 ? (
                          <div className="space-y-1">
                            {chapters.map((chapter) => (
                              <button
                                key={`${chapter.startSeconds}-${chapter.title}`}
                                type="button"
                                onClick={() => seekToChapter(chapter.startSeconds)}
                                disabled={!isVimeoReplay}
                                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors enabled:hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                <span className="w-10 shrink-0 font-mono text-[12px] font-semibold text-blue-600">
                                  {formatTimestamp(chapter.startSeconds)}
                                </span>
                                <span className="text-[13px] font-medium text-slate-700">{chapter.title}</span>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <p className="px-2 py-3 text-[13px] text-slate-500">
                            Chapters have not been created for this replay yet.
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="whitespace-pre-wrap px-5 py-4 text-[14px] leading-7 text-slate-700">
                        {transcriptCues.length > 0
                          ? transcriptTokens.map((token, index) => {
                              const wordIndex = transcriptTokenWordIndexes[index];
                              const isWord = wordIndex >= 0;
                              return (
                                <span
                                  key={index}
                                  ref={isWord && wordIndex === activeWordIndex ? activeTranscriptWordRef : undefined}
                                  className={isWord && wordIndex === activeWordIndex
                                    ? "rounded-sm bg-yellow-300 px-0.5 text-slate-900 shadow-sm"
                                    : undefined}
                                >
                                  {token}
                                </span>
                              );
                            })
                          : transcriptText}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {replay.content && (
            <section
              className="prose prose-slate mb-10 max-w-none text-[15px] leading-7"
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(replay.content, {
                  ALLOWED_TAGS: ["p", "br", "b", "i", "em", "strong", "ul", "ol", "li", "a", "h1", "h2", "h3", "h4", "blockquote", "code", "pre", "hr", "img", "span"],
                  ALLOWED_ATTR: ["href", "target", "rel", "src", "alt", "class", "style"],
                  ALLOW_DATA_ATTR: false,
                  FORCE_BODY: true,
                }),
              }}
            />
          )}

          {replay.resources?.length ? (
            <section className="mb-10">
              <h2 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">Replay Resources</h2>
              <div className="space-y-2">
                {replay.resources.map((resource) => (
                  <a
                    key={resource.id}
                    href={safeHref(resource.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-4 shadow-sm transition-colors hover:bg-blue-50"
                  >
                    <TrainingResourceIcon kind={resource.kind} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-slate-950">{resource.name}</p>
                      {resource.subtitle && <p className="truncate text-[11px] text-slate-400">{resource.subtitle}</p>}
                    </div>
                    <ExternalLink className="h-4 w-4 shrink-0 text-slate-400 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
                  </a>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </main>
  );
}