const NEW_YORK = "America/New_York";

function nyParts(date) {
  const bag = {};
  for (const part of new Intl.DateTimeFormat("en-US", {
    timeZone: NEW_YORK,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date)) {
    if (part.type !== "literal") bag[part.type] = part.value;
  }
  return bag;
}

function nyDateTime(year, month, day, hour, minute) {
  let utc = Date.UTC(year, month - 1, day, hour, minute, 0);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = nyParts(new Date(utc));
    const seen = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    const wanted = Date.UTC(year, month - 1, day, hour, minute, 0);
    if (seen === wanted) break;
    utc += wanted - seen;
  }
  return new Date(utc);
}

export function nextWeekendWindow(now = new Date()) {
  const today = nyParts(now);
  const cursor = Date.UTC(Number(today.year), Number(today.month) - 1, Number(today.day));
  for (let offset = 0; offset < 14; offset += 1) {
    const day = new Date(cursor + offset * 86_400_000);
    const start = nyDateTime(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), 16, 0);
    if (nyParts(start).weekday !== "Fri" || start.getTime() <= now.getTime()) continue;
    const monday = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate() + 3));
    const end = nyDateTime(monday.getUTCFullYear(), monday.getUTCMonth() + 1, monday.getUTCDate(), 9, 30);
    return { id: "weekend", label: "Next weekend", start, end };
  }
  throw new Error("Could not find the next weekend window.");
}

export function hourWindow(now = new Date()) {
  const start = new Date(now.getTime() - 60_000);
  const end = new Date(start.getTime() + 3_600_000);
  return { id: "hour", label: "Next hour", start, end };
}
