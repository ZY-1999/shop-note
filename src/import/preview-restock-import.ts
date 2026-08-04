import type { Product } from "@/data/product";

/** One data row from the restock import sheet (header not included). */
export type RestockImportSheetRow = {
  /** 1-based spreadsheet row number (data starts at 2). */
  row: number;
  title: string;
  qty: string;
};

export type RestockImportOk = {
  row: number;
  title: string;
  product_id: string;
  qty: number;
};

export type RestockImportFail = {
  row: number;
  reason: string;
};

export type RestockImportPreview = {
  ok: RestockImportOk[];
  fail: RestockImportFail[];
};

/**
 * Pure restock-import preview: trim product title, match against products
 * (include voided so reasons distinguish 不存在 vs 已删除), parse positive
 * integer qty, reject in-file duplicate titles. Does not write — callers feed
 * `ok` into `useImportRestocks`.
 */
export function previewRestockImport(
  rows: RestockImportSheetRow[],
  products: Product[],
): RestockImportPreview {
  const ok: RestockImportOk[] = [];
  const fail: RestockImportFail[] = [];
  const seenInFile = new Set<string>();

  const byTitle = new Map<string, Product>();
  for (const p of products) {
    byTitle.set(p.title.trim(), p);
  }

  for (const raw of rows) {
    const title = raw.title.trim();
    if (!title) {
      fail.push({ row: raw.row, reason: "缺少商品名称" });
      continue;
    }

    const existing = byTitle.get(title);
    if (!existing) {
      fail.push({ row: raw.row, reason: "商品不存在" });
      continue;
    }
    if (existing.voided_at != null) {
      fail.push({ row: raw.row, reason: "商品已删除" });
      continue;
    }

    if (seenInFile.has(title)) {
      fail.push({ row: raw.row, reason: "文件内重复" });
      continue;
    }

    const qtyText = raw.qty.trim();
    const qty = Number(qtyText);
    if (!qtyText || !Number.isInteger(qty) || qty <= 0) {
      fail.push({ row: raw.row, reason: "数量必须是正整数" });
      continue;
    }

    seenInFile.add(title);
    ok.push({
      row: raw.row,
      title,
      product_id: existing.id,
      qty,
    });
  }

  return { ok, fail };
}
