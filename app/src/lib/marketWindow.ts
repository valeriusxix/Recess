const TZ = "America/New_York";
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export type CoverageWindow = {
  start: number;
  end: number;
  label: string;
};

type Zoned = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: string;
};

function zonedParts(date: Date): Zoned {
  const map: Record<string, string> = {};
  for (const part of new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date)) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
    weekday: map.weekday,
  };
}

/** Unix seconds for a New York civil time. */
export function unixAtNewYork(year: number, month: number, day: number, hour: number, minute: number): number {
  let guess = Date.UTC(year, month - 1, day, hour + 5, minute, 0);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const got = zonedParts(new Date(guess));
    const gotAsUtc = Date.UTC(got.year, got.month - 1, got.day, got.hour, got.minute, got.second);
    const wantAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
    guess += wantAsUtc - gotAsUtc;
  }
  return Math.floor(guess / 1000);
}

function addDays(year: number, month: number, day: number, days: number) {
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function formatEt(seconds: number): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(seconds * 1000));
}

/**
 * Next NYSE close-to-open window whose start is not more than three minutes ago.
 * The program rejects an older start, so a Saturday purchase waits for the coming Friday.
 */
export function fridayCloseToMondayOpen(nowSec: number): CoverageWindow {
  const now = zonedParts(new Date(nowSec * 1000));
  const weekday = WEEKDAYS.indexOf(now.weekday);
  const daysUntilFriday = (5 - weekday + 7) % 7;
  let friday = addDays(now.year, now.month, now.day, daysUntilFriday);
  let start = unixAtNewYork(friday.year, friday.month, friday.day, 16, 0);
  if (start < nowSec - 180) {
    friday = addDays(friday.year, friday.month, friday.day, 7);
    start = unixAtNewYork(friday.year, friday.month, friday.day, 16, 0);
  }
  const monday = addDays(friday.year, friday.month, friday.day, 3);
  const end = unixAtNewYork(monday.year, monday.month, monday.day, 9, 30);
  return {
    start,
    end,
    label: `${formatEt(start)} → ${formatEt(end)}`,
  };
}

/** The judge demo: a window that can be settled a few minutes after purchase. */
export function demoWindow(nowSec: number): CoverageWindow {
  return {
    start: nowSec - 30,
    end: nowSec + 180,
    label: "Starts now and ends in three minutes.",
  };
}
