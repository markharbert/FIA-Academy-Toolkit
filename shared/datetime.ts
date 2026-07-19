import { formatInTimeZone, toZonedTime, fromZonedTime } from "date-fns-tz";

export const DEFAULT_TIMEZONE = "America/New_York";

export function safeTimezone(tz: string | null | undefined): string {
  if (!tz) return DEFAULT_TIMEZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

export function todayKeyInTz(tz: string, ref: Date = new Date()): string {
  return formatInTimeZone(ref, safeTimezone(tz), "yyyy-MM-dd");
}

export function addDaysToKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export function formatInTz(date: Date | string | number, tz: string, pattern: string): string {
  return formatInTimeZone(new Date(date), safeTimezone(tz), pattern);
}

export function startOfDayInTz(date: Date, tz: string): Date {
  const zoned = toZonedTime(date, safeTimezone(tz));
  zoned.setHours(0, 0, 0, 0);
  return zoned;
}

// Resolve the "calendar day" YYYY-MM-DD a due date represents:
// - If stored as UTC midnight (date-only field) -> use the picked Y/M/D as-is.
// - Otherwise (real timestamp) -> resolve in the user's time zone.
export function dueDateKey(due: Date | string | number, tz: string): string {
  const d = due instanceof Date ? due : new Date(due);
  if (
    d.getUTCHours() === 0 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 &&
    d.getUTCMilliseconds() === 0
  ) {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  return formatInTimeZone(d, safeTimezone(tz), "yyyy-MM-dd");
}

// Whole-day delta between a due date and "today in tz". Negative = overdue.
export function dayDiffInTz(due: Date | string | number, tz: string, ref: Date = new Date()): number {
  const dueKey = dueDateKey(due, tz);
  const todayKey = todayKeyInTz(tz, ref);
  const [y1, m1, d1] = dueKey.split("-").map(Number);
  const [y2, m2, d2] = todayKey.split("-").map(Number);
  return Math.round((Date.UTC(y1, m1 - 1, d1) - Date.UTC(y2, m2 - 1, d2)) / 86400000);
}

// True if the original due value carried a time-of-day (i.e. not stored at UTC midnight).
export function dueHasTime(due: Date | string | number): boolean {
  const d = due instanceof Date ? due : new Date(due);
  return !(
    d.getUTCHours() === 0 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 &&
    d.getUTCMilliseconds() === 0
  );
}

export function getCommonTimezones(): { value: string; label: string }[] {
  const commonZones = [
    "Pacific/Honolulu",
    "America/Anchorage",
    "America/Los_Angeles",
    "America/Phoenix",
    "America/Denver",
    "America/Chicago",
    "America/New_York",
    "America/Halifax",
    "America/St_Johns",
    "America/Sao_Paulo",
    "Atlantic/Azores",
    "Europe/London",
    "Europe/Paris",
    "Europe/Berlin",
    "Europe/Athens",
    "Europe/Moscow",
    "Asia/Dubai",
    "Asia/Karachi",
    "Asia/Kolkata",
    "Asia/Bangkok",
    "Asia/Singapore",
    "Asia/Hong_Kong",
    "Asia/Tokyo",
    "Australia/Perth",
    "Australia/Adelaide",
    "Australia/Sydney",
    "Pacific/Auckland",
    "UTC",
  ];
  let allZones: string[] = commonZones;
  try {
    const supported = (Intl as any).supportedValuesOf?.("timeZone") as string[] | undefined;
    if (supported && supported.length > 0) {
      const set = new Set([...commonZones, ...supported]);
      allZones = Array.from(set).sort();
    }
  } catch {
    /* fall through to commonZones */
  }
  return allZones.map((z) => ({ value: z, label: prettyTimezoneLabel(z) }));
}

export function prettyTimezoneLabel(tz: string): string {
  try {
    const now = new Date();
    const offset = formatInTimeZone(now, tz, "XXX");
    const city = tz.split("/").slice(1).join(" / ").replace(/_/g, " ") || tz;
    const region = tz.split("/")[0];
    return `(GMT${offset}) ${city}${region && region !== city ? ` — ${region}` : ""}`;
  } catch {
    return tz;
  }
}

/**
 * Given a YYYY-MM-DD key + hours + minutes in a specific IANA timezone, return the UTC ISO string.
 * Use this when saving a date+time that the user picked in their profile timezone.
 */
export function localDateTimeToUTC(dateKey: string, hours: number, minutes: number, tz: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const localDate = new Date(y, m - 1, d, hours, minutes, 0, 0);
  return fromZonedTime(localDate, safeTimezone(tz)).toISOString();
}
