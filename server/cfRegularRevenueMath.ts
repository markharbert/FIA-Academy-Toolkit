export function zonedDateParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value || 0);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second"),
  };
}

export function zonedMidnight(year: number, monthIndex: number, day: number, timeZone: string): Date {
  const target = Date.UTC(year, monthIndex, day);
  let instant = target;
  for (let attempt = 0; attempt < 3; attempt++) {
    const parts = zonedDateParts(new Date(instant), timeZone);
    const represented = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    instant += target - represented;
  }
  return new Date(instant);
}

export function allocateLargestRemainder(values: number[], target: number): number[] {
  const exactCents = values.map((value) => Math.max(0, value * 100));
  const allocatedCents = exactCents.map((value) => Math.floor(value + Number.EPSILON));
  let remaining = Math.round(target * 100)
    - allocatedCents.reduce((sum, value) => sum + value, 0);
  const byLargestRemainder = exactCents
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (let index = 0; remaining > 0 && byLargestRemainder.length; index++, remaining--) {
    allocatedCents[byLargestRemainder[index % byLargestRemainder.length].index]++;
  }
  return allocatedCents.map((value) => value / 100);
}