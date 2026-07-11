import { describe, expect, it } from "@jest/globals";

import { formatDate, formatDateTime, formatTime, formatDateTimeSeconds, formatTimeSeconds, rangeFor } from "@/components/date-format";

/**
 * Spec #01 — pure date/time formatting + range helpers. Local calendar day
 * (same idiom as daily-flow.ts's dayBucket). Each test builds inputs from the
 * local Date constructor so expected values are timezone-independent.
 */
describe("formatDate — spec #01", () => {
  it("formats an epoch-ms timestamp as local YYYY/MM/DD with zero-padding", () => {
    // 2026-06-09 14:30 local
    const ms = new Date(2026, 5, 9, 14, 30).getTime();
    expect(formatDate(ms)).toBe("2026/06/09");
  });
});

describe("formatTime — spec #01", () => {
  it("formats as local HH:mm with zero-padding", () => {
    expect(formatTime(new Date(2026, 5, 9, 9, 5).getTime())).toBe("09:05");
    expect(formatTime(new Date(2026, 5, 9, 14, 30).getTime())).toBe("14:30");
  });
});

describe("formatTimeSeconds — flow-event-row spec #01", () => {
  it("formats as local HH:mm:ss with zero-padding", () => {
    expect(formatTimeSeconds(new Date(2026, 5, 9, 14, 30, 7).getTime())).toBe("14:30:07");
    expect(formatTimeSeconds(new Date(2026, 5, 9, 9, 5, 0).getTime())).toBe("09:05:00");
  });
});

describe("formatDateTimeSeconds — flow-event-row spec #01", () => {
  it("formats as local YYYY/MM/DD HH:mm:ss", () => {
    expect(formatDateTimeSeconds(new Date(2026, 5, 9, 14, 30, 7).getTime())).toBe(
      "2026/06/09 14:30:07",
    );
  });
});

describe("formatDateTime — spec #01", () => {
  it("formats as local YYYY/MM/DD HH:mm", () => {
    expect(formatDateTime(new Date(2026, 5, 9, 14, 30).getTime())).toBe("2026/06/09 14:30");
  });

  it("rolls the year/month boundary on local calendar day (story 4)", () => {
    // Dec 31 23:59 → stays in the old year; Jan 1 00:05 → new year, zero-padded month/day
    expect(formatDate(new Date(2025, 11, 31, 23, 59).getTime())).toBe("2025/12/31");
    expect(formatDateTime(new Date(2026, 0, 1, 0, 5).getTime())).toBe("2026/01/01 00:05");
  });
});

describe("rangeFor — spec #01 (story 13)", () => {
  // Thursday 2026-06-11 12:00 local — its week's Monday is 2026-06-08.
  const thursday = new Date(2026, 5, 11, 12, 0).getTime();

  it("thisMonth spans local 1st 00:00:00.000 → last day 23:59:59.999", () => {
    const r = rangeFor("thisMonth", thursday);
    expect(r.from).toBe(new Date(2026, 5, 1, 0, 0, 0, 0).getTime());
    expect(r.to).toBe(new Date(2026, 5, 30, 23, 59, 59, 999).getTime());
  });

  it("lastMonth spans the whole previous local month", () => {
    const r = rangeFor("lastMonth", thursday);
    expect(r.from).toBe(new Date(2026, 4, 1, 0, 0, 0, 0).getTime()); // May 1
    expect(r.to).toBe(new Date(2026, 4, 31, 23, 59, 59, 999).getTime()); // May 31
  });

  it("lastMonth rolls into the previous year when `now` is in January", () => {
    const jan = new Date(2026, 0, 15, 12, 0).getTime();
    const r = rangeFor("lastMonth", jan);
    expect(r.from).toBe(new Date(2025, 11, 1, 0, 0, 0, 0).getTime()); // Dec 1 2025
    expect(r.to).toBe(new Date(2025, 11, 31, 23, 59, 59, 999).getTime()); // Dec 31 2025
  });

  it("thisWeek starts on Monday (Thursday → prior Monday), ending Sunday 23:59:59.999", () => {
    const r = rangeFor("thisWeek", thursday);
    expect(r.from).toBe(new Date(2026, 5, 8, 0, 0, 0, 0).getTime()); // Mon Jun 8
    expect(r.to).toBe(new Date(2026, 5, 14, 23, 59, 59, 999).getTime()); // Sun Jun 14
  });

  it("thisWeek treats Sunday as the end, not the start, of the week (Monday-first)", () => {
    const sunday = new Date(2026, 5, 14, 22, 0).getTime(); // Sun Jun 14
    const r = rangeFor("thisWeek", sunday);
    expect(r.from).toBe(new Date(2026, 5, 8, 0, 0, 0, 0).getTime()); // same week's Monday, not Jun 15
  });

  it("lastWeek spans the Monday→Sunday before `now`'s week", () => {
    const r = rangeFor("lastWeek", thursday);
    expect(r.from).toBe(new Date(2026, 5, 1, 0, 0, 0, 0).getTime()); // Mon Jun 1
    expect(r.to).toBe(new Date(2026, 5, 7, 23, 59, 59, 999).getTime()); // Sun Jun 7
  });

  it("output is driven by the injected `now`, not the wall clock (deterministic)", () => {
    // Two different `now` values in different months → different `from`; proves injectability.
    const a = rangeFor("thisMonth", new Date(2026, 5, 11).getTime()).from;
    const b = rangeFor("thisMonth", new Date(2026, 6, 11).getTime()).from;
    expect(a).toBe(new Date(2026, 5, 1).getTime());
    expect(b).toBe(new Date(2026, 6, 1).getTime());
    expect(a).not.toBe(b);
  });
});
