import { useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import Player from "@vimeo/player";
import { Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Clock, FileSearch, Library, Play, Search, Tag, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type SearchMode = "trainings" | "transcripts";
type TranscriptCue = { text: string; startSeconds: number; endSeconds?: number | null };
type TranscriptMatch = { text: string; startSeconds: number; endSeconds?: number | null; contextCues?: TranscriptCue[]; version: number; transcriptUpdatedAt?: string | null };
type Item = { id: string; slug: string; title: string; description?: string | null; videoUrl?: string | null; category?: string | null; tags?: string[]; durationMinutes?: number | null; thumbnailUrl?: string | null; completed?: boolean; completedAt?: string | null; transcriptMatches?: TranscriptMatch[] };
type ActiveMatch = { item: Item; match: TranscriptMatch };
async function api(url: string) { const response = await fetch(url, { credentials: "include" }); if (!response.ok) throw new Error("Unable to load the training library."); return response.json(); }
const stamp = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

function getVideoEmbedUrl(videoUrl: string | null | undefined, startSeconds: number) {
  if (!videoUrl) return null;
  try {
    const url = new URL(videoUrl);
    const start = Math.max(0, Math.floor(startSeconds));
    if (url.hostname.includes("vimeo.com")) {
      const videoId = url.pathname.match(/(?:^|\/)(?:video\/)?(\d+)(?:\/|$)/)?.[1];
      return videoId
        ? `https://player.vimeo.com/video/${videoId}?api=1&autoplay=1&muted=1#t=${start}s`
        : null;
    }
    if (url.hostname.includes("youtube.com")) {
      const videoId = url.searchParams.get("v");
      return videoId ? `https://www.youtube.com/embed/${videoId}?start=${start}&autoplay=1&mute=1&enablejsapi=1` : null;
    }
    if (url.hostname.includes("youtu.be")) {
      const videoId = url.pathname.split("/").filter(Boolean)[0];
      return videoId ? `https://www.youtube.com/embed/${videoId}?start=${start}&autoplay=1&mute=1&enablejsapi=1` : null;
    }
    if (url.hostname.includes("wistia.com") || url.hostname.includes("wi.st")) {
      const videoId = url.pathname.split("/").filter(Boolean).pop();
      return videoId ? `https://fast.wistia.net/embed/iframe/${videoId}?time=${start}&autoPlay=true&muted=true` : null;
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
  const [videoCurrentTime, setVideoCurrentTime] = useState(active.match.startSeconds);
  const embedUrl = getVideoEmbedUrl(active.item.videoUrl, active.match.startSeconds);
  const isVimeo = Boolean(active.item.videoUrl?.includes("vimeo.com"));
  const isDirect = isDirectVideoUrl(active.item.videoUrl);
  const contextCues = active.match.contextCues?.length
    ? active.match.contextCues
    : [{ text: active.match.text, startSeconds: active.match.startSeconds, endSeconds: active.match.endSeconds }];
  const activeCueIndex = contextCues.findIndex((cue, index) => {
    const cueEnd = cue.endSeconds ?? contextCues[index + 1]?.startSeconds ?? cue.startSeconds + 8;
    return videoCurrentTime >= cue.startSeconds && videoCurrentTime < cueEnd;
  });
  const activeCue = activeCueIndex >= 0 ? contextCues[activeCueIndex] : null;
  const activeCueEnd = activeCue
    ? (activeCue.endSeconds ?? contextCues[activeCueIndex + 1]?.startSeconds ?? activeCue.startSeconds + 8)
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

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isDirect || !active.item.videoUrl) return;
    const seekAndPlay = () => {
      video.currentTime = active.match.startSeconds;
      void video.play().catch(async () => {
        video.muted = true;
        await video.play().catch(() => undefined);
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
    const update = ({ seconds }: { seconds: number }) => setVideoCurrentTime(seconds);
    player.on("timeupdate", update);
    let disposed = false;
    const pollCurrentTime = async () => {
      try {
        const seconds = await player.getCurrentTime();
        if (!disposed && Number.isFinite(seconds)) setVideoCurrentTime(seconds);
      } catch {
        // The iframe can still be initializing; the next poll will retry.
      }
    };
    const pollTimer = window.setInterval(() => {
      void pollCurrentTime();
    }, 250);
    void pollCurrentTime();
    void (async () => {
      try {
        await player.setCurrentTime(active.match.startSeconds);
        await player.play();
      } catch {
        try {
          await player.setVolume(0);
          await player.play();
        } catch {
          // The muted iframe remains available for manual playback.
        }
      }
    })();
    return () => {
      disposed = true;
      window.clearInterval(pollTimer);
      player.off("timeupdate", update);
      void player.pause().catch(() => undefined);
      void player.destroy().catch(() => undefined);
    };
  }, [active, embedUrl, isVimeo]);

  useEffect(() => {
    setVideoCurrentTime(active.match.startSeconds);
  }, [active]);

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
            muted
            playsInline
            onTimeUpdate={(event) => setVideoCurrentTime(event.currentTarget.currentTime)}
            className="aspect-video w-full rounded-xl bg-slate-950"
          >
            <source src={active.item.videoUrl} />
          </video>
        ) : (
          <div className="flex aspect-video items-center justify-center rounded-xl bg-slate-950 px-6 text-center text-sm text-slate-300">
            This video cannot be previewed here. Open the full training to watch it.
          </div>
        )}
        <div className="mt-4 flex flex-col gap-3">
          <p className="text-sm leading-relaxed text-slate-600">
            {contextCues.map((cue, cueIndex) => {
              const tokens = cue.text.split(/(\s+)/);
              let wordIndex = 0;
              return (
                <span key={`${cue.startSeconds}-${cueIndex}`}>
                  {cueIndex > 0 && " "}
                  {tokens.map((token, tokenIndex) => {
                    const isWhitespace = !token || /^\s+$/.test(token);
                    const currentWordIndex = isWhitespace ? -1 : wordIndex++;
                    const highlighted = cueIndex === activeCueIndex && currentWordIndex === activeWordInCue;
                    return (
                      <span
                        key={tokenIndex}
                        className={highlighted ? "rounded-sm bg-yellow-300 px-0.5 text-slate-900 shadow-sm" : undefined}
                      >
                        {token}
                      </span>
                    );
                  })}
                </span>
              );
            })}
          </p>
          <Button className="w-full" onClick={onWatchFull}>
            <Play className="mr-1.5 h-3.5 w-3.5" />
            Watch this training in full
          </Button>
        </div>
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
  });
  const items = data?.items || data?.replays || [];
  const categories = data?.facets?.categories || [];
  const availableTags = data?.facets?.tags || [];
  const pagination = data?.pagination;
  const active = Boolean(q || category !== "all" || tags.length);
  const heading = useMemo(() => active ? `${pagination?.total ?? items.length} replay${(pagination?.total ?? items.length) === 1 ? "" : "s"} found` : "The Replay Vault", [active, items.length, pagination?.total]);
  const toggle = (tag: string) => {
    setPage(1);
    setTags((current) => current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]);
  };
  const clear = () => { setQ(""); setDebouncedQ(""); setCategory("all"); setTags([]); setPage(1); };
  return <main className="min-h-[calc(100dvh-3rem)] bg-[radial-gradient(circle_at_88%_0%,hsl(254_74%_91%),transparent_30rem)] px-4 py-8 sm:px-8">
    <div className="mx-auto max-w-7xl">
      <header className="mb-8 max-w-3xl"><div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-violet-700"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-700 text-white"><Library className="h-4 w-4" /></span> Fearless Influencer Academy</div><h1 className="text-4xl font-extrabold tracking-tight text-slate-950 sm:text-5xl">{heading}</h1><p className="mt-3 max-w-2xl text-base text-slate-600">Practical sessions, sharp ideas, and the context to put them to work.</p></header>
      <section className="mb-8 rounded-2xl border border-violet-100 bg-white/90 p-4 shadow-[0_14px_35px_-28px_rgba(46,16,101,.42)]">
        <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl bg-violet-50 p-1.5" role="tablist" aria-label="Search mode">
          <button type="button" role="tab" aria-selected={mode === "trainings"} className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-bold transition ${mode === "trainings" ? "bg-white text-violet-900 shadow-sm" : "text-slate-600 hover:text-violet-800"}`} onClick={() => { setMode("trainings"); setPage(1); }}>
            <Library className="h-4 w-4" />Search trainings
          </button>
          <button type="button" role="tab" aria-selected={mode === "transcripts"} className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-bold transition ${mode === "transcripts" ? "bg-white text-violet-900 shadow-sm" : "text-slate-600 hover:text-violet-800"}`} onClick={() => { setMode("transcripts"); setPage(1); }}>
            <FileSearch className="h-4 w-4" />Search transcripts
          </button>
        </div>
        <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-violet-600" /><Input className="h-11 border-violet-100 pl-10" placeholder={mode === "transcripts" ? "Search what was said in every training" : "Search titles, descriptions, categories, and topics"} value={q} onChange={(event) => { setQ(event.target.value); setPage(1); }} /></div>
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
      {isLoading ? (
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
              const target = `/training/library/${activeMatch.item.slug}?t=${Math.floor(activeMatch.match.startSeconds)}`;
              setActiveMatch(null);
              go(target);
            }}
          />
        )}
      </Dialog>
    </div>
  </main>;
}