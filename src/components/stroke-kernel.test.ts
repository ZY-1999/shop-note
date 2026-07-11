import { describe, expect, it } from "@jest/globals";

import { serializePath, strokeReducer, type Stroke } from "@/components/stroke-kernel";

const stroke = (pts: [number, number][]): Stroke => ({
  points: pts.map(([x, y]) => ({ x, y })),
});

/**
 * Spec #01 (signature-modal) — stroke kernel: pure-logic strokeReducer + serializePath.
 * Node-env Jest; no React/RN harness needed.
 */
describe("strokeReducer — spec #01 AC1: addStroke", () => {
  it("appends each addStroke to the strokes array (grows on every stroke)", () => {
    const s1 = strokeReducer([], { type: "addStroke", stroke: { points: [{ x: 0, y: 0 }] } });
    expect(s1).toHaveLength(1);
    const s2 = strokeReducer(s1, { type: "addStroke", stroke: { points: [{ x: 1, y: 1 }] } });
    expect(s2).toHaveLength(2);
  });
});

describe("strokeReducer — spec #01 AC2: undo", () => {
  it("removes the last stroke on undo", () => {
    const s = [
      stroke([[0, 0]]),
      stroke([[1, 1]]),
    ];
    expect(strokeReducer(s, { type: "undo" })).toHaveLength(1);
  });

  it("keeps an empty array empty on undo (no out-of-bounds)", () => {
    expect(strokeReducer([], { type: "undo" })).toEqual([]);
  });
});

describe("strokeReducer — spec #01 AC3: clear", () => {
  it("empties the strokes array on clear", () => {
    const s = [stroke([[0, 0]]), stroke([[1, 1]])];
    expect(strokeReducer(s, { type: "clear" })).toEqual([]);
  });
});

describe("serializePath — spec #01 AC6: empty strokes", () => {
  it("returns an empty string for empty strokes", () => {
    expect(serializePath([])).toBe("");
  });
});

describe("serializePath — spec #01 AC5: single stroke polyline", () => {
  it("starts with M then connects subsequent points with L", () => {
    const path = serializePath([stroke([[10, 20], [30, 40], [50, 60]])]);
    expect(path).toBe("M 10,20 L 30,40 L 50,60");
  });
});

describe("serializePath — spec #01 AC4: multi-stroke concatenation", () => {
  it("concatenates each stroke as a separate M sub-path separated by spaces", () => {
    const path = serializePath([
      stroke([[0, 0], [10, 10]]),
      stroke([[20, 20], [30, 30]]),
    ]);
    expect(path).toBe("M 0,0 L 10,10 M 20,20 L 30,30");
  });
});
