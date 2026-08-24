import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  addMonths,
  addDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import {
  CalendarDays,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Clock3,
  MapPin,
  Repeat2,
  Sparkles,
  Video,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import DOMPurify from "dompurify";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { formatInTz, getCommonTimezones } from "@shared/datetime";
import { fromZonedTime } from "date-fns-tz";

type CalendarSettings = {
  calendarId: string;
  calendarName: string;
  timezone: string;
  subscribeUrl: string;
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

function eventDayKey(event: ScheduleEvent, timezone: string) {
  return event.isAllDay ? event.start.slice(0, 10) : formatInTz(new Date(event.start), timezone, "yyyy-MM-dd");
}

function displayTime(event: ScheduleEvent, timezone: string) {
  if (event.isAllDay) return "All day";
  return formatInTz(new Date(event.start), timezone, "h:mm a");
}

function displayRange(event: ScheduleEvent, timezone: string) {
  if (event.isAllDay) return "All-day experience";
  const day = formatInTz(new Date(event.start), timezone, "EEEE, MMMM d");
  return `${day} · ${formatInTz(new Date(event.start), timezone, "h:mm a")} – ${formatInTz(new Date(event.end), timezone, "h:mm a")}`;
}

function displayAllDayDate(event: ScheduleEvent, timezone: string) {
  return formatInTz(new Date(`${event.start.slice(0, 10)}T12:00:00Z`), timezone, "EEEE, MMMM d");
}

function eventStartDate(event: ScheduleEvent) {
  return event.isAllDay
    ? new Date(`${event.start.slice(0, 10)}T00:00:00`)
    : new Date(event.start);
}

function countdownParts(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [
    { value: String(days), label: "days" },
    { value: String(hours).padStart(2, "0"), label: "hours" },
    { value: String(minutes).padStart(2, "0"), label: "minutes" },
    { value: String(seconds).padStart(2, "0"), label: "seconds" },
  ];
}

function sanitizeEventDescription(description: string) {
  const hasHtml = /<\s*[a-z][^>]*>/i.test(description);
  const source = hasHtml
    ? description
    : description
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br />");

  return DOMPurify.sanitize(source, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ["target", "rel"],
    FORBID_TAGS: ["style", "script", "iframe", "object", "form"],
    FORBID_ATTR: ["style", "onerror", "onclick", "onload"],
  });
}

export default function TrainingSchedulePage() {
  const { user, refetch: refetchUser } = useAuth();
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()));
  const [selectedEvent, setSelectedEvent] = useState<ScheduleEvent | null>(null);
  const [now, setNow] = useState(() => new Date());
  const timezone = user?.timezone || "America/New_York";
  const timezoneOptions = useMemo(() => getCommonTimezones(), []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const range = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 0 });
    return {
      start,
      end,
      requestStart: fromZonedTime(start, timezone),
      requestEnd: fromZonedTime(addDays(end, 1), timezone),
    };
  }, [currentMonth, timezone]);

  const updateTimezoneMutation = useMutation({
    mutationFn: async (nextTimezone: string) => {
      const response = await apiRequest("PATCH", "/api/account", { timezone: nextTimezone });
      return response.json();
    },
    onSuccess: () => refetchUser(),
  });

  const eventsQuery = useQuery<ScheduleResponse>({
    queryKey: ["/api/training/schedule/events", range.requestStart.toISOString(), range.requestEnd.toISOString(), timezone],
    queryFn: async () => {
      const params = new URLSearchParams({ start: range.requestStart.toISOString(), end: range.requestEnd.toISOString() });
      const response = await fetch(`/api/training/schedule/events?${params}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    },
    placeholderData: (previousData) => previousData,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const days = useMemo(
    () => eachDayOfInterval({ start: range.start, end: range.end }),
    [range],
  );
  const events = eventsQuery.data?.events || [];
  const eventsByDay = useMemo(() => {
    const map = new Map<string, ScheduleEvent[]>();
    events.forEach((event) => {
      const key = eventDayKey(event, timezone);
      map.set(key, [...(map.get(key) || []), event]);
    });
    return map;
  }, [events, timezone]);
  const nextEvent = useMemo(
    () => events
      .filter((event) => eventStartDate(event).getTime() >= now.getTime())
      .sort((a, b) => eventStartDate(a).getTime() - eventStartDate(b).getTime())[0] || null,
    [events, now],
  );
  const isLoading = eventsQuery.isLoading;
  const subscribeUrl = eventsQuery.data?.calendar.subscribeUrl;

  return (
    <main className="min-h-full bg-white text-slate-900 px-4 py-6 md:px-7 lg:px-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="relative overflow-hidden rounded-[28px] border border-slate-200 bg-white px-6 py-7 shadow-xl shadow-slate-200/70 md:px-8 md:py-9">
          <div className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full bg-fuchsia-100/80 blur-3xl" />
          <div className="pointer-events-none absolute bottom-0 right-1/4 h-36 w-36 rounded-full bg-cyan-100/80 blur-2xl" />
          <div className="relative flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
            <div className="max-w-2xl">
              <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-fuchsia-700">
                <CalendarDays className="h-5 w-5" /> FIA live events
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <h1 className="text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">Training Schedule</h1>
                {subscribeUrl && (
                  <a
                    href={subscribeUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-xs font-bold text-cyan-800 transition hover:border-cyan-300 hover:bg-cyan-100 hover:text-cyan-950"
                    data-testid="link-subscribe-google-calendar"
                  >
                    <CalendarPlus className="h-3.5 w-3.5" />
                    Subscribe via Google Calendar
                  </a>
                )}
              </div>
              <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">
                This is the live event calendar for Fearless Influencer Academy. It updates regularly with the latest event information.
              </p>
            </div>
            <div className="flex w-full max-w-xl flex-col sm:items-end">
              {nextEvent ? (
                <button
                  onClick={() => setSelectedEvent(nextEvent)}
                  className="w-full rounded-2xl border border-fuchsia-200 bg-gradient-to-br from-fuchsia-50 via-white to-cyan-50 p-5 text-left shadow-md shadow-fuchsia-100/70 transition hover:-translate-y-0.5 hover:shadow-lg sm:p-6"
                  data-testid="card-next-training-event"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-fuchsia-700">Next session</p>
                      <p className="mt-1 break-words text-base font-bold leading-5 text-slate-950">{nextEvent.title}</p>
                      <p className="mt-1 text-sm font-medium text-slate-600">
                        {nextEvent.isAllDay ? displayAllDayDate(nextEvent, timezone) : `${formatInTz(eventStartDate(nextEvent), timezone, "EEEE, MMMM d")} · ${displayTime(nextEvent, timezone)}`}
                      </p>
                    </div>
                    <div className="shrink-0 rounded-2xl bg-white px-4 py-3 text-center shadow-md ring-1 ring-fuchsia-100 sm:min-w-[250px]">
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Starts in</p>
                      <div className="mt-2 grid grid-cols-4 gap-2">
                        {countdownParts(eventStartDate(nextEvent).getTime() - now.getTime()).map((part) => (
                          <div key={part.label} className="min-w-0">
                            <p className="font-mono text-2xl font-black leading-none tabular-nums tracking-tight text-fuchsia-700 sm:text-3xl">{part.value}</p>
                            <p className="mt-1 truncate text-[9px] font-bold uppercase tracking-[0.08em] text-slate-500">{part.label}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </button>
              ) : (
                <div className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Next session</p>
                  <p className="mt-1 text-sm font-semibold text-slate-800">No upcoming sessions in this view</p>
                </div>
              )}
            </div>
          </div>
        </section>

        {eventsQuery.isError ? (
          <section className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-950">
            <p className="font-semibold">Google Calendar needs attention</p>
            <p className="mt-1 text-amber-900/80">The FIA Event Schedule could not be loaded. Confirm the Google Calendar connection, then reload the page.</p>
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
                      <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${format(day, "yyyy-MM-dd") === formatInTz(now, timezone, "yyyy-MM-dd") ? "bg-gradient-to-br from-fuchsia-600 to-violet-600 text-white shadow-md shadow-fuchsia-500/30" : inMonth ? "text-slate-800" : "text-slate-400"}`}>
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
                            <span className="truncate sm:hidden">{formatInTz(new Date(event.start), timezone, "h")}</span>
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
            <section className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-lg shadow-slate-200/60">
              <div className="flex items-start gap-3">
                <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-cyan-600" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Time zone</p>
                  <p className="mt-1 text-sm text-slate-600">Event times are shown in your selected time zone.</p>
                  <Select
                    value={timezone}
                    onValueChange={(value) => updateTimezoneMutation.mutate(value)}
                    disabled={updateTimezoneMutation.isPending}
                  >
                    <SelectTrigger className="mt-3 w-full" data-testid="select-training-timezone">
                      <SelectValue placeholder="Select your time zone" />
                    </SelectTrigger>
                    <SelectContent className="max-h-80">
                      {timezoneOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {updateTimezoneMutation.isError && (
                    <p className="mt-2 text-xs text-red-600">Could not save your time zone. Please try again.</p>
                  )}
                </div>
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
                  <div className="flex gap-2"><Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-400" /><span>{displayRange(selectedEvent, timezone)}</span></div>
                  {selectedEvent.location && <div className="flex gap-2"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-400" /><span>{selectedEvent.location}</span></div>}
                  {selectedEvent.recurring && <div className="flex gap-2"><Repeat2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-400" /><span>Repeating Academy event</span></div>}
                  {selectedEvent.description && (
                    <div
                      className="break-words rounded-lg bg-slate-50 p-3 leading-5 text-slate-700 [&_a]:font-semibold [&_a]:text-cyan-700 [&_a]:underline [&_a]:underline-offset-2 [&_a:hover]:text-cyan-900 [&_br]:leading-6 [&_li]:ml-4 [&_li]:list-disc [&_ol]:my-2 [&_p]:mb-2 [&_p:last-child]:mb-0 [&_strong]:font-bold [&_ul]:my-2"
                      dangerouslySetInnerHTML={{ __html: sanitizeEventDescription(selectedEvent.description) }}
                    />
                  )}
                </div>
                {selectedEvent.meetingUrl && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button size="sm" asChild className="bg-cyan-500 text-slate-950 hover:bg-cyan-400"><a href={selectedEvent.meetingUrl} target="_blank" rel="noreferrer"><Video className="mr-1.5 h-3.5 w-3.5" /> Join session</a></Button>
                  </div>
                )}
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