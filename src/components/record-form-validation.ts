/**
 * Pure validation for the record-posting form (spec #06 AC3). Kept out of the
 * component so the rules are fast to unit-test in the node env and so the form
 * just calls this and surfaces the returned message.
 *
 * The integer->0 rule mirrors the repo's `RangeError` guard
 * ([src/data/stock-record.ts](../data/stock-record.ts) create): we tell the
 * operator *before* the throw. Structural validity only — the form deliberately
 * does NOT check stock sufficiency (an `out` over holdings is allowed; PRD).
 */
export interface DraftLine {
  productId: string;
  qty: string;
}

/**
 * @returns the first failing rule's message, or `null` when the draft is submittable.
 * Staff missing → no items → a line missing a product → a line with bad qty, in order.
 */
export function validateRecordForm(staffId: string, lines: DraftLine[]): string | null {
  if (!staffId) return "请选择会员";
  if (lines.length === 0) return "至少添加一项商品";
  for (const line of lines) {
    if (!line.productId) return "每项都需要选择商品";
    const qty = Number(line.qty);
    if (!Number.isInteger(qty) || qty <= 0) return "数量必须是正整数";
  }
  return null;
}
