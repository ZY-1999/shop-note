import type { Product } from "@/data/product";
import type { Cents } from "@/data/primitives";
import { parseYuanToCents } from "@/lib/parse-yuan-to-cents";

/** One data row from the product import sheet (header not included). */
export type ProductImportSheetRow = {
  /** 1-based spreadsheet row number (data starts at 2). */
  row: number;
  title: string;
  /** Raw 单价 cell text (元). */
  price: string;
};

export type ProductImportOk = {
  row: number;
  title: string;
  purchase_price: Cents;
};

export type ProductImportFail = {
  row: number;
  reason: string;
};

export type ProductImportPreview = {
  ok: ProductImportOk[];
  fail: ProductImportFail[];
};

/**
 * Pure product-import preview: trim titles, parse yuan→cents, dedupe against
 * existing (incl. voided) + in-file duplicates. Does not write — callers feed
 * `ok` into `useImportProducts`.
 */
export function previewProductImport(
  rows: ProductImportSheetRow[],
  existingProducts: Product[],
): ProductImportPreview {
  const ok: ProductImportOk[] = [];
  const fail: ProductImportFail[] = [];
  const seenInFile = new Set<string>();

  const byTitle = new Map<string, Product>();
  for (const p of existingProducts) {
    byTitle.set(p.title.trim(), p);
  }

  for (const raw of rows) {
    const title = raw.title.trim();
    if (!title) {
      fail.push({ row: raw.row, reason: "缺少名称" });
      continue;
    }

    const existing = byTitle.get(title);
    if (existing) {
      fail.push({
        row: raw.row,
        reason:
          existing.voided_at == null ? "已存在" : "已存在（已删除）",
      });
      continue;
    }

    if (seenInFile.has(title)) {
      fail.push({ row: raw.row, reason: "文件内重复" });
      continue;
    }

    const priceResult = parseYuanToCents(raw.price);
    if (!priceResult.ok) {
      fail.push({ row: raw.row, reason: priceResult.reason });
      continue;
    }

    seenInFile.add(title);
    ok.push({
      row: raw.row,
      title,
      purchase_price: priceResult.cents,
    });
  }

  return { ok, fail };
}
