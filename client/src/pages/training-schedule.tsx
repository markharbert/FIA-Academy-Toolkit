import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ExternalLink,
  Link2,
  MapPin,
  RefreshCw,
  Repeat2,
  Sparkles,
  Video,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type CalendarSettings = {
  calendarId: string;
  calendarName: string;
  timezone: string;
};

type CalendarOption = {
  id: string;
  name: string;
  timezone: string | null;
  primary: boolean;
  color: string | null;
};

type ScheduleEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  isAllDay: boolean;
  timezone: string | null;
  location: string | null;
  description: string | null;
  htmlLink: string | null;
  meetingUrl: string | null;
  colorId: string | null;
  recurring: boolean;
};

type ScheduleResponse = {
  calendar: CalendarSettings;
  events: ScheduleEvent[];
};

const EVENT_TONES = [
  { dot: "bg-fuchsia-400", soft: "bg-fuchsia-400/12 border-fuchsia-400/20", text: "text-fuchsia-200" },
  { dot: "bg-cyan-400", soft: "bg-cyan-400/12 border-cyan-400/20", text: "text-cyan-200" },
  { dot: "bg-amber-300", soft: "bg-amber-300/12 border-amber-300/20", text: "text-amber-100" },
  { dot: "bg-emerald-400", soft: "bg-emerald-400/12 border-emerald-400/20", text: "text-emerald-200" },
];

function eventTone(event: ScheduleEvent) {
  const value = event.colorId || event.id;
  const seed = [...value].reduce((total, char) => total + char.charCodeAt(0), 0);
  return EVENT_TONES[seed % EVENT_TONES.length];
}

function eventDayKey(event: ScheduleEvent) {
  return event.isAllDay ? event.start.slice(0, 10) : format(new Date(event.start), "yyyy-MM-dd");
}

function displayTime(event: ScheduleEvent) {
  if (event.isAllDay) return "All day";
  return format(new Date(event.start), "h:mm a");
}

function displayRange(event: ScheduleEvent) {
  if (event.isAllDay) return "All-day experience";
  const day = format(new Date(event.start), "EEEE, MMMM d");
  return `${day} · ${format(new Date(event.start), "h:mm a")} – ${format(new Date(event.end), "h:mm a")}`;
}

export default function TrainingSchedulePage() {
  const { toast } = useToast();
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()));
  const [selectedEvent, setSelectedEvent] = useState<ScheduleEvent | null>(null);

  const range = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 0 });
    return { start, end };
  }, [currentMonth]);

  const { data: settings } = useQuery<CalendarSettings>({
    queryKey: ["/api/training/schedule/settings"],
  });
  const { data: calendars = [], isError: calendarsError } = useQuery<CalendarOption[]>({
    queryKey: ["/api/training/schedule/calendars"],
  });
  const eventsQuery = useQuery<ScheduleResponse>({
    queryKey: ["/api/training/schedule/events", range.start.toISOString(), range.end.toISOString()],
    queryFn: async () => {
      const params = new URLSearchParams({ start: range.start.toISOString(), end: range.end.toISOString() });
      const response = await fetch(`/api/training/schedule/events?${params}`, { credentials: "include" });
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    },
  });

  const saveCalendar = useMutation({
    mutationFn: async (calendar: CalendarOption) => {
      const payload: CalendarSettings = {
        calendarId: calendar.id,
        calendarName: calendar.name,
        timezone: calendar.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York",
      };
      const response = await apiRequest("PUT", "/api/training/schedule/settings", payload);
      return response.json() as Promise<CalendarSettings>;
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(["/api/training/schedule/settings"], saved);
      queryClient.invalidateQueries({ queryKey: ["/api/training/schedule/events"] });
      toast({ title: "Schedule calendar updated", description: `${saved.calendarName} is now the source for Training Schedule.` });
    },
    onError: () => toast({ title: "Calendar not updated", description: "Please try selecting the calendar again.", variant: "destructive" }),
  });

  const days = useMemo(
    () => eachDayOfInterval({ start: range.start, end: range.end }),
    [range],
  );
  const events = eventsQuery.data?.events || [];
  const eventsByDay = useMemo(() => {
    const map = new Map<string, ScheduleEvent[]>();
    events.forEach((event) => {
      const key = eventDayKey(event);
      map.set(key, [...(map.get(key) || []), event]);
    });
    return map;
  }, [events]);
  const upcoming = useMemo(
    () => events.filter((event) => new Date(event.end) >= new Date()).slice(0, 6),
    [events],
  );
  const activeCalendar = eventsQuery.data?.calendar || settings;
  const isLoading = eventsQuery.isLoading || !settings;

  return (
    <main className="min-h-full bg-[radial-gradient(circle_at_14%_0%,rgba(192,38,211,0.18),transparent_28%),radial-gradient(circle_at_88%_12%,rgba(34,211,238,0.13),transparent_24%),hsl(var(--background))] px-4 py-6 md:px-7 lg:px-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="relative overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(118deg,#19103c_0%,#241053_48%,#0b2642_100%)] px-6 py-7 shadow-2xl shadow-fuchsia-950/20 md:px-8 md:py-9">
          <div className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full bg-fuchsia-400/20 blur-3xl" />
          <div className="pointer-events-none absolute bottom-0 right-1/4 h-36 w-36 rounded-full bg-cyan-300/10 blur-2xl" />
          <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-2xl">
              <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-fuchsia-200/80">
                <Sparkles className="h-3.5 w-3.5" /> Academy events
              </div>
              <h1 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">Training Schedule</h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-indigo-100/75">
                A polished view of every live session, workshop, and Academy moment — always sourced from your Google Calendar.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="rounded-xl border border-white/10 bg-black/15 px-3 py-2 backdrop-blur">
                <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.15em] text-indigo-100/55">Schedule source</p>
                <Select
                  value={activeCalendar?.calendarId}
                  onValueChange={(id) => {
                    const calendar = calendars.find((item) => item.id === id);
                    if (calendar) saveCalendar.mutate(calendar);
                  }}
                  disabled={!calendars.length || saveCalendar.isPending}
                >
                  <SelectTrigger className="h-8 min-w-[220px] border-0 bg-transparent px-0 text-sm font-medium text-white focus:ring-0">
                    <SelectValue placeholder="Choose a Google Calendar" />
                  </SelectTrigger>
                  <SelectContent>
                    {calendars.map((calendar) => (
                      <SelectItem key={calendar.id} value={calendar.id}>
                        {calendar.name}{calendar.primary ? " · Primary" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant="outline"
                onClick={() => {
                  eventsQuery.refetch();
                  queryClient.invalidateQueries({ queryKey: ["/api/training/schedule/calendars"] });
                }}
                className="h-auto border-white/15 bg-white/10 text-white hover:bg-white/15 hover:text-white"
                data-testid="button-refresh-training-schedule"
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${eventsQuery.isFetching ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
          </div>
        </section>

        {calendarsError || eventsQuery.isError ? (
          <section className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-5 text-sm text-amber-100">
            <p className="font-semibold">Google Calendar needs attention</p>
            <p className="mt-1 text-amber-100/70">The schedule could not be loaded. Confirm the Google Calendar connection and the selected calendar, then refresh.</p>
          </section>
        ) : null}

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="overflow-hidden rounded-[24px] border border-border/70 bg-card/80 shadow-xl shadow-slate-950/5 backdrop-blur">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/70 px-5 py-4 md:px-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Calendar view</p>
                <h2 className="mt-1 text-xl font-semibold">{format(currentMonth, "MMMM yyyy")}</h2>
              </div>
              <div className="flex items-center rounded-lg border border-border bg-background/75 p-1">
                <Button variant="ghost" size="icon" onClick={() => setCurrentMonth((date) => subMonths(date, 1))} aria-label="Previous month">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="ghost" className="h-8 px-3 text-xs font-semibold" onClick={() => setCurrentMonth(startOfMonth(new Date()))}>Today</Button>
                <Button variant="ghost" size="icon" onClick={() => setCurrentMonth((date) => addMonths(date, 1))} aria-label="Next month">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-7 border-b border-border/70 bg-muted/25 px-2 md:px-3">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label) => (
                <div key={label} className="py-3 text-center text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {days.map((day) => {
                const dayEvents = eventsByDay.get(format(day, "yyyy-MM-dd")) || [];
                const inMonth = isSameMonth(day, currentMonth);
                return (
                  <div key={day.toISOString()} className={`min-h-[106px] border-b border-r border-border/60 p-1.5 sm:min-h-[124px] sm:p-2 ${inMonth ? "bg-card/35" : "bg-muted/20"}`}>
                    <div className="mb-1 flex justify-end">
                      <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${isToday(day) ? "bg-gradient-to-br from-fuchsia-500 to-violet-500 text-white shadow-md shadow-fuchsia-500/30" : inMonth ? "text-foreground" : "text-muted-foreground/45"}`}>
                        {format(day, "d")}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {isLoading ? (
                        <div className="h-5 animate-pulse rounded bg-muted/75" />
                      ) : dayEvents.slice(0, 3).map((event) => {
                        const tone = eventTone(event);
                        return (
                          <button
                            key={event.id}
                            onClick={() => setSelectedEvent(event)}
                            className={`group flex w-full items-center gap-1.5 truncate rounded-md border px-1.5 py-1 text-left text-[10px] font-semibold transition hover:-translate-y-px hover:brightness-125 sm:text-[11px] ${tone.soft} ${tone.text}`}
                            title={event.title}
                          >
                            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot}`} />
                            <span className="hidden truncate sm:inline">{event.title}</span>
                            <span className="truncate sm:hidden">{format(new Date(event.start), "h")}</span>
                          </button>
                        );
                      })}
                      {dayEvents.length > 3 && <button onClick={() => setSelectedEvent(dayEvents[3])} className="pl-1 text-[10px] font-medium text-muted-foreground hover:text-foreground">+{dayEvents.length - 3} more</button>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <aside className="space-y-5">
            <section className="overflow-hidden rounded-[22px] border border-fuchsia-400/15 bg-[linear-gradient(145deg,rgba(95,37,145,0.16),rgba(18,31,58,0.45))] p-5 shadow-lg shadow-fuchsia-950/10">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.15em] text-fuchsia-300/80">Coming up</p>
                  <h2 className="mt-1 text-lg font-semibold">Your next sessions</h2>
                </div>
                <CalendarDays className="h-5 w-5 text-fuchsia-300" />
              </div>
              <div className="mt-4 space-y-2">
                {isLoading ? Array.from({ length: 3 }).map((_, index) => <div key={index} className="h-16 animate-pulse rounded-xl bg-muted/70" />) : upcoming.length ? upcoming.map((event) => {
                  const tone = eventTone(event);
                  return (
                    <button key={event.id} onClick={() => setSelectedEvent(event)} className="flex w-full items-center gap-3 rounded-xl border border-white/5 bg-black/10 p-3 text-left transition hover:bg-white/5">
                      <div className={`flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-lg ${tone.soft}`}>
                        <span className={`text-[9px] font-bold uppercase ${tone.text}`}>{format(new Date(event.start), "MMM")}</span>
                        <span className={`text-sm font-bold leading-3 ${tone.text}`}>{event.isAllDay ? event.start.slice(8, 10) : format(new Date(event.start), "d")}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold">{event.title}</p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">{displayTime(event)}</p>
                      </div>
                    </button>
                  );
                }) : <p className="rounded-xl border border-dashed border-border/70 p-4 text-center text-xs leading-5 text-muted-foreground">Nothing scheduled in this view yet.</p>}
              </div>
            </section>

            {selectedEvent ? (
              <section className="rounded-[22px] border border-cyan-400/15 bg-card p-5 shadow-lg shadow-cyan-950/5">
                <div className="mb-3 flex items-start gap-3">
                  <div className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${eventTone(selectedEvent).dot}`} />
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Session details</p>
                    <h2 className="mt-1 text-base font-semibold leading-5">{selectedEvent.title}</h2>
                  </div>
                </div>
                <div className="space-y-3 text-xs text-muted-foreground">
                  <div className="flex gap-2"><Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-400" /><span>{displayRange(selectedEvent)}</span></div>
                  {selectedEvent.location && <div className="flex gap-2"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-400" /><span>{selectedEvent.location}</span></div>}
                  {selectedEvent.recurring && <div className="flex gap-2"><Repeat2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-400" /><span>Repeating Academy event</span></div>}
                  {selectedEvent.description && <p className="max-h-28 overflow-y-auto whitespace-pre-line rounded-lg bg-muted/50 p-3 leading-5">{selectedEvent.description}</p>}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {selectedEvent.meetingUrl && <Button size="sm" asChild className="bg-cyan-500 text-slate-950 hover:bg-cyan-400"><a href={selectedEvent.meetingUrl} target="_blank" rel="noreferrer"><Video className="mr-1.5 h-3.5 w-3.5" /> Join session</a></Button>}
                  {selectedEvent.htmlLink && <Button size="sm" variant="outline" asChild><a href={selectedEvent.htmlLink} target="_blank" rel="noreferrer"><ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Open in Google</a></Button>}
                  {!selectedEvent.meetingUrl && !selectedEvent.htmlLink && <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><Link2 className="h-3.5 w-3.5" /> No link attached</span>}
                </div>
              </section>
            ) : (
              <section className="rounded-[22px] border border-dashed border-border bg-muted/20 p-5 text-center">
                <Sparkles className="mx-auto h-5 w-5 text-fuchsia-400" />
                <p className="mt-2 text-sm font-medium">Select an event</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">Open any colorful event card to view its training details and links.</p>
              </section>
            )}
          </aside>
        </section>
      </div>
    </main>
  );
}