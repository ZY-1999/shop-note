import { describe, expect, it } from "@jest/globals";
import * as XLSX from "xlsx";

import { ADMIN_STAFF_ID, type Staff } from "@/data/staff";
import {
  buildStaffWorkbook,
  staffExportFilename,
} from "@/export/build-staff-workbook";

function staff(overrides: Partial<Staff> & Pick<Staff, "name">): Staff {
  return {
    id: overrides.id ?? "s1",
    name: overrides.name,
    phone: overrides.phone ?? "",
    notes: overrides.notes ?? "",
    level: overrides.level ?? "normal",
    voided_at: overrides.voided_at ?? null,
    created_at: overrides.created_at ?? 1,
    updated_at: overrides.updated_at ?? 1,
  };
}

/** Decode a base64 workbook into row arrays (header + data). */
function sheetRows(base64: string): unknown[][] {
  const wb = XLSX.read(base64, { type: "base64" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
}

describe("buildStaffWorkbook", () => {
  it("emits 姓名/电话/备注/等级 columns without status when includeVoided is false", () => {
    const base64 = buildStaffWorkbook(
      [
        staff({
          name: "张三",
          phone: "138",
          notes: "熟客",
          level: "gold",
        }),
      ],
      { includeVoided: false },
    );

    expect(typeof base64).toBe("string");
    expect(base64.length).toBeGreaterThan(0);
    expect(sheetRows(base64)).toEqual([
      ["姓名", "电话", "备注", "等级"],
      ["张三", "138", "熟客", "星站"],
    ]);
  });

  it("appends 状态 (有效/已删除) only when includeVoided is true", () => {
    const base64 = buildStaffWorkbook(
      [
        staff({ name: "有效员", phone: "1", level: "normal" }),
        staff({
          id: "s2",
          name: "已删员",
          phone: "2",
          level: "gold",
          voided_at: 99,
        }),
      ],
      { includeVoided: true },
    );

    expect(sheetRows(base64)).toEqual([
      ["姓名", "电话", "备注", "等级", "状态"],
      ["有效员", "1", "", "普站", "有效"],
      ["已删员", "2", "", "星站", "已删除"],
    ]);
  });

  it("excludes ADMIN_STAFF_ID (-1) even if rows somehow include it; never emits id or timestamps", () => {
    const base64 = buildStaffWorkbook(
      [
        staff({
          id: ADMIN_STAFF_ID,
          name: "管理员",
          phone: "000",
          notes: "virtual",
          level: "normal",
        }),
        staff({
          id: "real",
          name: "李四",
          phone: "139",
          notes: "ok",
          level: "normal",
          created_at: 111,
          updated_at: 222,
        }),
      ],
      { includeVoided: false },
    );

    const rows = sheetRows(base64);
    expect(rows).toEqual([
      ["姓名", "电话", "备注", "等级"],
      ["李四", "139", "ok", "普站"],
    ]);
    // No id / created_at / updated_at / voided_at cells anywhere.
    const flat = rows.flat().map(String);
    expect(flat).not.toContain(ADMIN_STAFF_ID);
    expect(flat).not.toContain("real");
    expect(flat).not.toContain("111");
    expect(flat).not.toContain("222");
  });

  it("names the file 会员-YYYYMMDD.xlsx from the local device day", () => {
    // 2026-08-04 15:30 local — pad month/day.
    expect(staffExportFilename(new Date(2026, 7, 4, 15, 30).getTime())).toBe(
      "会员-20260804.xlsx",
    );
    expect(staffExportFilename(new Date(2026, 0, 9, 0, 0).getTime())).toBe(
      "会员-20260109.xlsx",
    );
  });
});
