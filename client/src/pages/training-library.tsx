import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Clock, Library, Search, Tag, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

type Item = { id: string; slug: string; title: string; description?: string | null; category?: string | null; tags?: string[]; durationMinutes?: number | null; thumbnailUrl?: string | null; completed?: boolean; completedAt?: string | null; transcriptMatches?: { text: string; startSeconds: number }[] };
async function api(url: string) { const response = await fetch(url, { credentials: "include" }); if (!response.ok) throw new Error("Unable to load the training library."); return response.json(); }
const stamp = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

export default function TrainingLibraryPage() {
  const [, go] = useLocation();
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [category, setCategory] = useState("all");
  const [tags, setTags] = useState<string[]>([]);
  const [topicsOpen, setTopicsOpen] = useState(false);
  const [page, setPage] = useState(1);
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
    queryKey: ["/api/training/library", debouncedQ, category, tags, page],
    queryFn: () => api(`/api/training/library?q=${encodeURIComponent(debouncedQ)}&category=${encodeURIComponent(category === "all" ? "" : category)}&tags=${encodeURIComponent(tags.join(","))}&page=${page}`),
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
        <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-violet-600" /><Input className="h-11 border-violet-100 pl-10" placeholder="Search titles, topics, and transcripts" value={q} onChange={(event) => { setQ(event.target.value); setPage(1); }} /></div>
        <div className="mt-4 flex flex-wrap items-center gap-2"><span className="mr-1 text-xs font-bold uppercase tracking-wider text-slate-500">Browse</span><Button size="sm" variant={category === "all" ? "default" : "outline"} onClick={() => { setCategory("all"); setPage(1); }}>All sessions</Button>{categories.map((item) => <Button key={item} size="sm" variant={category === item ? "default" : "outline"} onClick={() => { setCategory(item); setPage(1); }}>{item}</Button>)}</div>
        {availableTags.length > 0 && (
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
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-violet-200 bg-white/70 p-14 text-center">
          <Library className="mx-auto h-10 w-10 text-violet-300" />
          <h2 className="mt-4 font-semibold text-slate-900">{active ? "No matching replays" : "No replays available yet"}</h2>
          <p className="mt-1 text-sm text-slate-600">{active ? "Try clearing a filter or using a different phrase." : "Check back soon for the next session."}</p>
          {active && <Button className="mt-4" variant="outline" onClick={clear}>Clear filters</Button>}
        </div>
      ) : (
        <>
        <div className="grid items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => {
            const match = item.transcriptMatches?.[0];
            return (
              <button
                key={item.id}
                onClick={() => go(`/training/library/${item.slug}${match ? `?t=${match.startSeconds}` : ""}`)}
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
                    {match && <span className="text-violet-700">{stamp(match.startSeconds)} match</span>}
                  </div>
                  {match && <p className="mt-2 line-clamp-1 text-xs text-slate-500">{match.text}</p>}
                </div>
              </button>
            );
          })}
        </div>
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
    </div>
  </main>;
}