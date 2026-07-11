import { describe, expect, test } from "@jest/globals";
import { aggregateBundleRetail, splitBundleRetail } from "@/data/split-bundle";

describe("splitBundleRetail — pure amount→bundles+retail split", () => {
  test("exact multiple → all bundles, zero retail", () => {
    expect(splitBundleRetail(7200, 2400)).toEqual({ bundles: 3, retail: 0 });
  });

  test("non-multiple → floor bundles + remainder retail", () => {
    expect(splitBundleRetail(7000, 2400)).toEqual({ bundles: 2, retail: 2200 });
  });

  test("amount < unit price → zero bundles, full amount as retail", () => {
    expect(splitBundleRetail(1000, 2400)).toEqual({ bundles: 0, retail: 1000 });
  });

  test("zero amount → zero bundles, zero retail", () => {
    expect(splitBundleRetail(0, 2400)).toEqual({ bundles: 0, retail: 0 });
  });

  test("unit price <= 0 (cold start / unconfigured) → 0 bundles, full amount retail (no NaN)", () => {
    expect(splitBundleRetail(5000, 0)).toEqual({ bundles: 0, retail: 5000 });
    expect(splitBundleRetail(5000, -1)).toEqual({ bundles: 0, retail: 5000 });
  });

  test("large amount does not overflow Number integer precision", () => {
    // 10 billion cents (¥100M) at ¥24.00/unit → 4,166,666 bundles + ¥16 retail
    expect(splitBundleRetail(10_000_000_000, 2400)).toEqual({ bundles: 4_166_666, retail: 1600 });
  });

  test("rejects non-integer inputs (Cents are integers)", () => {
    expect(() => splitBundleRetail(72.5, 2400)).toThrow(/integer/);
    expect(() => splitBundleRetail(7200, 24.0)).not.toThrow(); // 24.0 is an integer value
  });
});

describe("aggregateBundleRetail — Σ bundles/retail over a set of records", () => {
  /** Minimal record shape the helper reads — structural, so RecordWithItems fits. */
  const rw = (
    direction: "in" | "out",
    unitPrice: number | null,
    lineAmount: number,
  ) => ({
    record: { direction, unit_price_snapshot: unitPrice },
    items: [{ line_amount: lineAmount }],
  });

  test("each 'out' record splits via its OWN snapshot, then sums bundles + retail", () => {
    // out ¥72.00 @ ¥24 → 3 bundles; out ¥70.00 @ ¥24 → 2 bundles + ¥22 retail
    const rws = [rw("out", 2400, 7200), rw("out", 2400, 7000)];
    expect(aggregateBundleRetail(rws)).toEqual({ bundles: 5, retail: 2200 });
  });

  test("'in' records (restock) contribute nothing — bundle/retail is checkout-only", () => {
    const rws = [rw("in", null, 7200), rw("out", 2400, 7200)];
    expect(aggregateBundleRetail(rws)).toEqual({ bundles: 3, retail: 0 });
  });

  test("null snapshot (cold start) → 0 bundles, full amount as retail", () => {
    expect(aggregateBundleRetail([rw("out", null, 2100)])).toEqual({
      bundles: 0,
      retail: 2100,
    });
  });

  test("empty set → zero/zero", () => {
    expect(aggregateBundleRetail([])).toEqual({ bundles: 0, retail: 0 });
  });
});
