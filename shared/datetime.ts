import { formatInTimeZone, toZonedTime } from "date-fns-tz";

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
