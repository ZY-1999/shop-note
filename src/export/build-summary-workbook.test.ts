import { describe, expect, it } from "@jest/globals";
import * as XLSX from "xlsx";

import {
  buildSummaryWorkbook,
  summaryExportFilename,
  type SummaryWorkbookInput,
} from "@/export/build-summary-workbook";
import type { Aggregate } from "@/data/inventory";
import { cents } from "@/data/primitives";

function sheetsOf(base64: string): string[] {
  const wb = XLSX.read(base64, { type: "base64" });
  return wb.SheetNames;
}

function sheetRows(base64: string, name: string): unknown[][] {
  const wb = XLSX.read(base64, { type: "base64" });
  const sheet = wb.Sheets[name];
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
}

function agg(
  title: string,
  qty: number,
  purchasePrice: number,
): Aggregate {
  return {
    product: {
      id: title,
      title,
      purchase_price: cents(purchasePrice),
      code: "",
      category: "",
      voided_at: null,
      created_at: 0,
      updated_at: 0,
    },
    total_qty: qty,
    total_cost: purchasePrice * qty,
  };
}

const ALL_SHEETS = {
  inventory: true,
  inbound: true,
  topupCheckout: true,
  topupCheckoutDetail: true,
};

describe("summaryExportFilename — summary-range-export #02", () => {
  it("names 汇总-YYYYMMDD-YYYYMMDD.xlsx from local from/to days", () => {
    const from = new Date(2026, 6, 26, 0, 0, 0, 0).getTime();
    const to = new Date(2026, 7, 4, 23, 59, 59, 999).getTime();
    expect(summaryExportFilename(from, to)).toBe("汇总-20260726-20260804.xlsx");
  });
});

describe("buildSummaryWorkbook — inventory sheet (#02)", () => {
  it("emits 库存 with non-zero rows, yuan amounts, and a total row", () => {
    const input: SummaryWorkbookInput = {
      sheets: ALL_SHEETS,
      inventory: [agg("可乐", 3, 300), agg("水", 0, 500), agg("茶", 2, 400)],
    };
    const b64 = buildSummaryWorkbook(input);
    expect(sheetsOf(b64)).toEqual(["库存"]);
    expect(sheetRows(b64, "库存")).toEqual([
      ["商品", "件数", "金额"],
      ["可乐", 3, "9.00"],
      ["茶", 2, "8.00"],
      ["合计", 5, "17.00"],
    ]);
  });

  it("omits 库存 when inventory sheet is unchecked", () => {
    const b64 = buildSummaryWorkbook({
      sheets: { ...ALL_SHEETS, inventory: false },
      inventory: [agg("可乐", 1, 300)],
    });
    expect(sheetsOf(b64)).not.toContain("库存");
  });
});
