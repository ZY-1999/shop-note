import { describe, expect, jest, test } from "@jest/globals";
import { cents, type Cents, id, now } from "@/data/primitives";

describe("money primitive", () => {
  test("cents() accepts integer cents", () => {
    expect(cents(1995)).toBe(1995);
    expect(cents(0)).toBe(0);
  });

  test("cents() rejects non-integer money (floats carry rounding risk)", () => {
    expect(() => cents(19.95)).toThrow(RangeError);
    expect(() => cents(10.5)).toThrow(RangeError);
  });

  test("a raw number is not assignable to Cents (compile-time brand)", () => {
    // @ts-expect-error — a raw number lacks the Cents brand; only cents() mints it
    const rejected: Cents = 19;
    // Branding is erased at runtime; the guard is the compile-time check above.
    expect(rejected).toBe(19);
    // The blessed path compiles without error:
    const blessed: Cents = cents(19);
    expect(blessed).toBe(19);
  });
});

describe("id primitive", () => {
  test("id() is unique across many calls", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i += 1) ids.add(id());
    expect(ids.size).toBe(1000);
  });
});

describe("now primitive", () => {
  test("now() returns the current wall-clock milliseconds", () => {
    const fixed = Date.parse("2026-01-01T00:00:00Z");
    jest.useFakeTimers();
    jest.setSystemTime(fixed);
    try {
      expect(now()).toBe(fixed);
    } finally {
      jest.useRealTimers();
    }
  });
});
