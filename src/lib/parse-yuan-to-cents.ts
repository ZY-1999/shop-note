import { cents, type Cents } from "@/data/primitives";

export type ParseYuanResult =
  | { ok: true; cents: Cents }
  | { ok: false; reason: string };

/**
 * Parse a 元 string to integer 分 — inverse of `formatCentsAsYuan`.
 * Empty → 缺少单价; non-positive / non-numeric → 单价非法.
 * Pure — shared by product import preview (manage-import #02).
 */
export function parseYuanToCents(yuan: string): ParseYuanResult {
  const text = yuan.trim();
  if (!text) {
    return { ok: false, reason: "缺少单价" };
  }
  const n = Number(text);
  if (!Number.isFinite(n) || n <= 0) {
    return { ok: false, reason: "单价非法" };
  }
  return { ok: true, cents: cents(Math.round(n * 100)) };
}
