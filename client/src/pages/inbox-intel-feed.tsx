import { useState, useMemo, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Search,
  Pin,
  Filter,
  X,
  Mail,
  Inbox,
  Loader2,
  Calendar,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { FeedResponse, FeedItem } from "@shared/schema";

type DatePreset = "all" | "today" | "7d" | "30d" | "90d";

function presetToFromDate(preset: DatePreset): Date | null {
  if (preset === "all") return null;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (preset === "today") return d;
  if (preset === "7d") {
    d.setDate(d.getDate() - 6);
    return d;
  }
  if (preset === "30d") {
    d.setDate(d.getDate() - 29);
    return d;
  }
  if (preset === "90d") {
    d.setDate(d.getDate() - 89);
    return d;
  }
  return null;
}

function formatDate(d: Date | string): string {
  const date = new Date(d);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatTime(d: Date | string): string {
  return new Date(d).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function groupByDay(items: FeedItem[]): { date: string; label: string; items: FeedItem[] }[] {
  const groups = new Map<string, FeedItem[]>();
  for (const item of items) {
    const d = new Date(item.receivedAt);
    const key = d.toISOString().slice(0, 10);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  return [...groups.entries()].map(([date, items]) => {
    const d = new Date(date);
    let label: string;
    if (d.getTime() === today.getTime()) label = "Today";
    else if (d.getTime() === yesterday.getTime()) label = "Yesterday";
    else label = d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
    return { date, label, items };
  });
}

export default function InboxIntelFeedPage() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [datePreset, setDatePreset] = useState<DatePreset>("30d");
  const [selectedTrackerIds, setSelectedTrackerIds] = useState<string[]>([]);
  const [selectedEsp, setSelectedEsp] = useState<string>("all");
  const [pinnedOnly, setPinnedOnly] = useState(false);

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const queryParams = useMemo(() => {
    const params: Record<string, string> = { limit: "200" };
    const fromDate = presetToFromDate(datePreset);
    if (fromDate) params.from = fromDate.toISOString();
    if (selectedTrackerIds.length > 0) params.trackerIds = selectedTrackerIds.join(",");
    if (selectedEsp && selectedEsp !== "all") params.esp = selectedEsp;
    if (pinnedOnly) params.pinnedOnly = "true";
    if (debouncedSearch) params.search = debouncedSearch;
    return params;
  }, [datePreset, selectedTrackerIds, selectedEsp, pinnedOnly, debouncedSearch]);

  const queryString = new URLSearchParams(queryParams).toString();

  const { data, isLoading } = useQuery<FeedResponse>({
    queryKey: ["/api/inbox-intel/feed", queryParams],
    queryFn: async () => {
      const res = await fetch(`/api/inbox-intel/feed?${queryString}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load feed");
      return res.json();
    },
  });

  const trackers = data?.trackers || [];
  const esps = data?.esps || [];
  const items = data?.items || [];
  const total = data?.total || 0;

  const hasActiveFilters =
    selectedTrackerIds.length > 0 || selectedEsp !== "all" || pinnedOnly || debouncedSearch.length > 0 || datePreset !== "30d";

  const clearAllFilters = () => {
    setSelectedTrackerIds([]);
    setSelectedEsp("all");
    setPinnedOnly(false);
    setSearch("");
    setDebouncedSearch("");
    setDatePreset("30d");
  };

  const toggleTracker = (id: string) => {
    setSelectedTrackerIds((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
    );
  };

  const grouped = groupByDay(items);

  const trackerLabel =
    selectedTrackerIds.length === 0
      ? "All competitors"
      : selectedTrackerIds.length === 1
        ? trackers.find((t) => t.id === selectedTrackerIds[0])?.name || "1 competitor"
        : `${selectedTrackerIds.length} competitors`;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-sidebar text-sidebar-foreground px-6 py-8">
        <div className="max-w-6xl mx-auto">
          <button
            onClick={() => setLocation("/email-tools/inbox-intel")}
            className="text-white/60 hover:text-white text-sm flex items-center gap-1 mb-4"
            data-testid="link-back-inbox-intel"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Inbox Intel
          </button>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
              <Inbox className="h-5 w-5 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Unified Feed</h1>
          </div>
          <p className="text-white/50 text-sm mt-1.5 max-w-xl">
            Every email captured across every competitor, in one chronological stream. Filter by competitor, date, ESP, or search to zero in on patterns.
          </p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        {/* Filter bar */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            {/* Search */}
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search subject or sender…"
                className="pl-9"
                data-testid="input-feed-search"
              />
            </div>

            {/* Date preset */}
            <Select value={datePreset} onValueChange={(v) => setDatePreset(v as DatePreset)}>
              <SelectTrigger className="w-auto min-w-[140px]" data-testid="select-feed-date">
                <Calendar className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="90d">Last 90 days</SelectItem>
                <SelectItem value="all">All time</SelectItem>
              </SelectContent>
            </Select>

            {/* Competitor multi-select */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="default"
                  className="gap-1.5"
                  data-testid="button-feed-competitor-filter"
                >
                  <Filter className="h-3.5 w-3.5" />
                  {trackerLabel}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64 max-h-80 overflow-y-auto">
                <DropdownMenuLabel>Filter by competitor</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {trackers.length === 0 && (
                  <div className="px-2 py-3 text-xs text-muted-foreground">No competitors yet.</div>
                )}
                {trackers.map((t) => (
                  <DropdownMenuCheckboxItem
                    key={t.id}
                    checked={selectedTrackerIds.includes(t.id)}
                    onCheckedChange={() => toggleTracker(t.id)}
                    onSelect={(e) => e.preventDefault()}
                    data-testid={`checkbox-competitor-${t.id}`}
                  >
                    {t.name}
                  </DropdownMenuCheckboxItem>
                ))}
                {selectedTrackerIds.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <button
                      onClick={() => setSelectedTrackerIds([])}
                      className="w-full text-left px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted rounded-sm"
                    >
                      Clear selection
                    </button>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* ESP filter */}
            {esps.length > 0 && (
              <Select value={selectedEsp} onValueChange={setSelectedEsp}>
                <SelectTrigger className="w-auto min-w-[120px]" data-testid="select-feed-esp">
                  <Mail className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                  <SelectValue placeholder="Any ESP" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any ESP</SelectItem>
                  {esps.map((esp) => (
                    <SelectItem key={esp} value={esp}>
                      {esp}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* Pinned toggle */}
            <Button
              variant={pinnedOnly ? "default" : "outline"}
              onClick={() => setPinnedOnly((v) => !v)}
              className="gap-1.5"
              data-testid="button-feed-pinned-toggle"
            >
              <Pin className="h-3.5 w-3.5" />
              Pinned only
            </Button>

            {/* CSV download — uses current filters */}
            <Button variant="outline" asChild className="gap-1.5" title="Download as CSV">
              <a
                href={`/api/inbox-intel/feed.csv?${queryString}`}
                data-testid="link-download-feed-csv"
              >
                <Download className="h-3.5 w-3.5" />
                CSV
              </a>
            </Button>

            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAllFilters}
                className="text-muted-foreground"
                data-testid="button-feed-clear-filters"
              >
                <X className="h-3.5 w-3.5 mr-1" /> Clear
              </Button>
            )}
          </div>

          <div className="text-xs text-muted-foreground mt-3" data-testid="text-feed-count">
            {isLoading ? "Loading…" : `${items.length} of ${total} matching ${total === 1 ? "email" : "emails"}`}
            {items.length === 200 && total > 200 && " (showing latest 200)"}
          </div>
        </div>

        {/* Feed list */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-20 border border-dashed border-border rounded-2xl">
            <Inbox className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-50" />
            <h3 className="text-base font-semibold text-foreground mb-1">
              {hasActiveFilters ? "No emails match these filters" : "No emails captured yet"}
            </h3>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              {hasActiveFilters
                ? "Try widening the date range or clearing some filters."
                : "Add a competitor and use their seed address to subscribe — captures will land here."}
            </p>
            {hasActiveFilters && (
              <Button variant="outline" size="sm" className="mt-4" onClick={clearAllFilters}>
                Clear filters
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {grouped.map((group) => (
              <section key={group.date} data-testid={`group-day-${group.date}`}>
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {group.label}
                  </h3>
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-[11px] text-muted-foreground">
                    {group.items.length} {group.items.length === 1 ? "email" : "emails"}
                  </span>
                </div>
                <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
                  {group.items.map((item) => (
                    <button
                      key={item.id}
                      onClick={() =>
                        setLocation(`/email-tools/inbox-intel/${item.trackerId}/email/${item.id}`)
                      }
                      className="w-full text-left flex items-start gap-3 px-4 py-3 hover-elevate active-elevate-2 transition-colors"
                      data-testid={`row-feed-${item.id}`}
                    >
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white font-bold text-xs flex-shrink-0 mt-0.5">
                        {item.trackerName.substring(0, 1).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <span
                            className="text-xs font-semibold text-violet-600 dark:text-violet-400"
                            data-testid={`text-feed-tracker-${item.id}`}
                          >
                            {item.trackerName}
                          </span>
                          <span className="text-xs text-muted-foreground">·</span>
                          <span className="text-xs text-muted-foreground truncate">
                            {item.fromName || item.fromEmail || "Unknown sender"}
                          </span>
                          {item.isPinned && (
                            <Pin className="h-3 w-3 text-amber-500 flex-shrink-0" />
                          )}
                          {!item.bodyAvailable && (
                            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                              archived
                            </span>
                          )}
                        </div>
                        <p
                          className="text-sm text-foreground truncate"
                          data-testid={`text-feed-subject-${item.id}`}
                        >
                          {item.subject}
                        </p>
                        <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
                          {item.detectedEsp && <span>{item.detectedEsp}</span>}
                          {item.linkCount !== null && item.linkCount !== undefined && (
                            <span>{item.linkCount} links</span>
                          )}
                          {item.wordCount !== null && item.wordCount !== undefined && (
                            <span>{item.wordCount} words</span>
                          )}
                        </div>
                      </div>
                      <div className="hidden sm:flex flex-col items-end text-xs text-muted-foreground flex-shrink-0">
                        <span>{formatDate(item.receivedAt)}</span>
                        <span>{formatTime(item.receivedAt)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
