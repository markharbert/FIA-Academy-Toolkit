import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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

type CalendarSettings = {
  calendarId: string;
  calendarName: string;
  timezone: string;
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
  { dot: "bg-fuchsia-600", soft: "bg-fuchsia-100 border-fuchsia-200", text: "text-fuchsia-800" },
  { dot: "bg-cyan-600", soft: "bg-cyan-100 border-cyan-200", text: "text-cyan-800" },
  { dot: "bg-amber-500", soft: "bg-amber-100 border-amber-200", text: "text-amber-900" },
  { dot: "bg-emerald-600", soft: "bg-emerald-100 border-emerald-200", text: "text-emerald-800" },
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
  const eventsQuery = useQuery<ScheduleResponse>({
    queryKey: ["/api/training/schedule/events", range.start.toISOString(), range.end.toISOString()],
    queryFn: async () => {
      const params = new URLSearchParams({ start: range.start.toISOString(), end: range.end.toISOString() });
      const response = await fetch(`/api/training/schedule/events?${params}`, { credentials: "include" });
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    },
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
  const isLoading = eventsQuery.isLoading || !settings;

  return (
    <main className="min-h-full bg-white text-slate-900 px-4 py-6 md:px-7 lg:px-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="relative overflow-hidden rounded-[28px] border border-slate-200 bg-white px-6 py-7 shadow-xl shadow-slate-200/70 md:px-8 md:py-9">
          <div className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full bg-fuchsia-100/80 blur-3xl" />
          <div className="pointer-events-none absolute bottom-0 right-1/4 h-36 w-36 rounded-full bg-cyan-100/80 blur-2xl" />
          <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-2xl">
              <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-fuchsia-700">
                <Sparkles className="h-3.5 w-3.5" /> Academy events
              </div>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">Training Schedule</h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">
                A polished view of every live session, workshop, and Academy moment — always sourced from your Google Calendar.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">Schedule source</p>
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.45)]" />
                  FIA Event Schedule
                </div>
              </div>
              <Button
                variant="outline"
                onClick={() => {
                  eventsQuery.refetch();
                }}
                className="h-auto border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-50 hover:text-slate-950"
                data-testid="button-refresh-training-schedule"
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${eventsQuery.isFetching ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
          </div>
        </section>

        {eventsQuery.isError ? (
          <section className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-950">
            <p className="font-semibold">Google Calendar needs attention</p>
            <p className="mt-1 text-amber-900/80">The FIA Event Schedule could not be loaded. Confirm the Google Calendar connection, then refresh.</p>
          </section>
        ) : null}

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-xl shadow-slate-200/70">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-slate-50/80 px-5 py-4 md:px-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Calendar view</p>
                <h2 className="mt-1 text-xl font-semibold text-slate-950">{format(currentMonth, "MMMM yyyy")}</h2>
              </div>
              <div className="flex items-center rounded-lg border border-slate-200 bg-white p-1">
                <Button variant="ghost" size="icon" className="text-slate-600 hover:bg-slate-100 hover:text-slate-950" onClick={() => setCurrentMonth((date) => subMonths(date, 1))} aria-label="Previous month">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="ghost" className="h-8 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-950" onClick={() => setCurrentMonth(startOfMonth(new Date()))}>Today</Button>
                <Button variant="ghost" size="icon" className="text-slate-600 hover:bg-slate-100 hover:text-slate-950" onClick={() => setCurrentMonth((date) => addMonths(date, 1))} aria-label="Next month">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-100/80 px-2 md:px-3">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label) => (
                <div key={label} className="py-3 text-center text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{label}</div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {days.map((day) => {
                const dayEvents = eventsByDay.get(format(day, "yyyy-MM-dd")) || [];
                const inMonth = isSameMonth(day, currentMonth);
                return (
                  <div key={day.toISOString()} className={`min-h-[106px] border-b border-r border-slate-200 p-1.5 sm:min-h-[124px] sm:p-2 ${inMonth ? "bg-white" : "bg-slate-50"}`}>
                    <div className="mb-1 flex justify-end">
                      <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${isToday(day) ? "bg-gradient-to-br from-fuchsia-600 to-violet-600 text-white shadow-md shadow-fuchsia-500/30" : inMonth ? "text-slate-800" : "text-slate-400"}`}>
                        {format(day, "d")}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {isLoading ? (
                        <div className="h-5 animate-pulse rounded bg-slate-200" />
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
                      {dayEvents.length > 3 && <button onClick={() => setSelectedEvent(dayEvents[3])} className="pl-1 text-[10px] font-medium text-slate-600 hover:text-slate-950">+{dayEvents.length - 3} more</button>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <aside className="space-y-5">
            <section className="overflow-hidden rounded-[22px] border border-fuchsia-200 bg-[linear-gradient(145deg,#fff7ff,#f8fafc)] p-5 shadow-lg shadow-fuchsia-100">
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
                    <button key={event.id} onClick={() => setSelectedEvent(event)} className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-fuchsia-200 hover:bg-fuchsia-50/40">
                      <div className={`flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-lg ${tone.soft}`}>
                        <span className={`text-[9px] font-bold uppercase ${tone.text}`}>{format(new Date(event.start), "MMM")}</span>
                        <span className={`text-sm font-bold leading-3 ${tone.text}`}>{event.isAllDay ? event.start.slice(8, 10) : format(new Date(event.start), "d")}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-slate-900">{event.title}</p>
                        <p className="mt-0.5 text-[11px] text-slate-600">{displayTime(event)}</p>
                      </div>
                    </button>
                  );
                }) : <p className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-xs leading-5 text-slate-600">Nothing scheduled in this view yet.</p>}
              </div>
            </section>

            {selectedEvent ? (
              <section className="rounded-[22px] border border-cyan-200 bg-white p-5 shadow-lg shadow-cyan-100">
                <div className="mb-3 flex items-start gap-3">
                  <div className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${eventTone(selectedEvent).dot}`} />
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Session details</p>
                    <h2 className="mt-1 text-base font-semibold leading-5 text-slate-950">{selectedEvent.title}</h2>
                  </div>
                </div>
                <div className="space-y-3 text-xs text-slate-700">
                  <div className="flex gap-2"><Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-400" /><span>{displayRange(selectedEvent)}</span></div>
                  {selectedEvent.location && <div className="flex gap-2"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-400" /><span>{selectedEvent.location}</span></div>}
                  {selectedEvent.recurring && <div className="flex gap-2"><Repeat2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-400" /><span>Repeating Academy event</span></div>}
                  {selectedEvent.description && <p className="max-h-28 overflow-y-auto whitespace-pre-line rounded-lg bg-slate-50 p-3 leading-5 text-slate-700">{selectedEvent.description}</p>}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {selectedEvent.meetingUrl && <Button size="sm" asChild className="bg-cyan-500 text-slate-950 hover:bg-cyan-400"><a href={selectedEvent.meetingUrl} target="_blank" rel="noreferrer"><Video className="mr-1.5 h-3.5 w-3.5" /> Join session</a></Button>}
                  {selectedEvent.htmlLink && <Button size="sm" variant="outline" asChild><a href={selectedEvent.htmlLink} target="_blank" rel="noreferrer"><ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Open in Google</a></Button>}
                  {!selectedEvent.meetingUrl && !selectedEvent.htmlLink && <span className="inline-flex items-center gap-1.5 text-xs text-slate-600"><Link2 className="h-3.5 w-3.5" /> No link attached</span>}
                </div>
              </section>
            ) : (
              <section className="rounded-[22px] border border-dashed border-slate-300 bg-slate-50 p-5 text-center">
                <Sparkles className="mx-auto h-5 w-5 text-fuchsia-400" />
                <p className="mt-2 text-sm font-medium text-slate-900">Select an event</p>
                <p className="mt-1 text-xs leading-5 text-slate-600">Open any colorful event card to view its training details and links.</p>
              </section>
            )}
          </aside>
        </section>
      </div>
    </main>
  );
}