/**
 * Shared date/time formatting + range helpers for the three-screen refactor
 * (spec #01). Pure, RN-free, local-calendar-day — the display twin of
 * [daily-flow.ts](../data/daily-flow.ts)'s `dayBucket` (same local-day idiom,
 * `/` separator for display, `HH:mm` for time). Kept here so every screen
 * formats identically and we kill the scattered `toLocaleString()` drift that
 * motivated this module.
 *
 * Node-runnable (no React import) → covered by the ts-jest `data` project,
 * mirroring [record-form-validation.ts](./record-form-validation.ts).
 */
export function formatDate(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}/${m}/${day}`;
}

/** Local `YYYY/MM/DD HH:mm`. */
export function formatDateTime(ms: number): string {
  return `${formatDate(ms)} ${formatTime(ms)}`;
}

/** Local `HH:mm`. */
export function formatTime(ms: number): string {
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

/** Local `HH:mm:ss`. */
export function formatTimeSeconds(ms: number): string {
  const d = new Date(ms);
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${formatTime(ms)}:${ss}`;
}

/** Local `YYYY/MM/DD HH:mm:ss`. */
export function formatDateTimeSeconds(ms: number): string {
  return `${formatDate(ms)} ${formatTimeSeconds(ms)}`;
}

export type RangePreset =
  | "last10Days"
  | "thisMonth"
  | "lastMonth"
  | "thisWeek"
  | "lastWeek";

/**
 * Local-day `[from, to]` epoch-ms window for a preset — feeds the summary
 * screen's `date_range`. `from` is the start day's 00:00:00.000, `to` the end
 * day's 23:59:59.999, both local. Weeks start Monday. `last10Days` is today
 * plus the prior 9 local calendar days (10 days inclusive). `now` defaults to
 * `Date.now()`; inject it for deterministic tests.
 */
export function rangeFor(
  preset: RangePreset,
  now: number = Date.now(),
): { from: number; to: number } {
  const ref = new Date(now);
  const year = ref.getFullYear();
  const month = ref.getMonth();
  switch (preset) {
    case "last10Days": {
      const end = new Date(year, month, ref.getDate());
      const start = addDays(end, -9);
      return {
        from: atStartOfDay(start.getFullYear(), start.getMonth(), start.getDate()),
        to: atEndOfDay(end.getFullYear(), end.getMonth(), end.getDate()),
      };
    }
    case "thisMonth":
      return { from: atStartOfDay(year, month, 1), to: atEndOfDay(year, month + 1, 0) };
    case "lastMonth":
      return { from: atStartOfDay(year, month - 1, 1), to: atEndOfDay(year, month, 0) };
    case "thisWeek":
      return weekRange(mondayOf(ref));
    case "lastWeek":
      return weekRange(addDays(mondayOf(ref), -7));
  }
}

/** Local epoch ms at 00:00:00.000 of the given calendar day. Day 0 = last day of prior month. */
function atStartOfDay(y: number, mo: number, d: number): number {
  return new Date(y, mo, d, 0, 0, 0, 0).getTime();
}

/** Local epoch ms at 23:59:59.999 of the given calendar day. */
function atEndOfDay(y: number, mo: number, d: number): number {
  return new Date(y, mo, d, 23, 59, 59, 999).getTime();
}

/** Monday 00:00:00 (local) of the week containing `d`. Week starts Monday. */
function mondayOf(d: Date): Date {
  const daysSinceMonday = (d.getDay() + 6) % 7;
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  monday.setDate(monday.getDate() - daysSinceMonday);
  return monday;
}

/** `[Monday start, Sunday end]` epoch window for the week of the given Monday. */
function weekRange(monday: Date): { from: number; to: number } {
  const sunday = addDays(monday, 6);
  return { from: monday.getTime(), to: atEndOfDay(sunday.getFullYear(), sunday.getMonth(), sunday.getDate()) };
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

const ALL_PRESETS: RangePreset[] = [
  "last10Days",
  "thisMonth",
  "lastMonth",
  "thisWeek",
  "lastWeek",
];

/**
 * If `range` exactly equals `rangeFor(preset, now)` for some preset, return it;
 * otherwise `null` (custom / unmatched window — dropdown shows no highlight).
 */
export function matchRangePreset(
  range: { from: number; to: number },
  now: number = Date.now(),
): RangePreset | null {
  for (const preset of ALL_PRESETS) {
    const p = rangeFor(preset, now);
    if (p.from === range.from && p.to === range.to) return preset;
  }
  return null;
}

/**
 * Snap both ends to local calendar-day bounds (`from` 00:00:00.000, `to`
 * 23:59:59.999). If start > end after snapping, swap them.
 */
export function normalizeDayRange(
  fromMs: number,
  toMs: number,
): { from: number; to: number } {
  const a = new Date(fromMs);
  const b = new Date(toMs);
  let from = atStartOfDay(a.getFullYear(), a.getMonth(), a.getDate());
  let to = atEndOfDay(b.getFullYear(), b.getMonth(), b.getDate());
  if (from > to) {
    const af = new Date(fromMs);
    const bt = new Date(toMs);
    from = atStartOfDay(bt.getFullYear(), bt.getMonth(), bt.getDate());
    to = atEndOfDay(af.getFullYear(), af.getMonth(), af.getDate());
  }
  return { from, to };
}
