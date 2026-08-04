import { describe, expect, it } from "@jest/globals";

import type { Staff } from "@/data/staff";
import {
  previewStaffImport,
  type StaffImportSheetRow,
} from "@/import/preview-staff-import";

function sheetRow(
  overrides: Partial<StaffImportSheetRow> & Pick<StaffImportSheetRow, "row" | "name">,
): StaffImportSheetRow {
  return {
    phone: "",
    notes: "",
    level: "",
    ...overrides,
  };
}

function existing(
  overrides: Partial<Staff> & Pick<Staff, "name">,
): Staff {
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

describe("previewStaffImport — happy path (manage-import #01 tracer)", () => {
  it("accepts valid rows: trim name, empty level → 普站, phone/notes pass through", () => {
    const result = previewStaffImport(
      [
        sheetRow({ row: 2, name: " 张三 ", phone: "138", notes: "熟客", level: "" }),
        sheetRow({ row: 3, name: "李四", phone: "", notes: "", level: "星站" }),
      ],
      [],
      "管理员",
    );

    expect(result.fail).toEqual([]);
    expect(result.ok).toEqual([
      {
        row: 2,
        name: "张三",
        phone: "138",
        notes: "熟客",
        level: "normal",
      },
      {
        row: 3,
        name: "李四",
        phone: "",
        notes: "",
        level: "gold",
      },
    ]);
  });
});

describe("previewStaffImport — validation failures (manage-import #01)", () => {
  it("fails missing name, illegal level, admin reserved name", () => {
    const result = previewStaffImport(
      [
        sheetRow({ row: 2, name: "  ", level: "普站" }),
        sheetRow({ row: 3, name: "王五", level: "金站" }),
        sheetRow({ row: 4, name: " 管理员 ", level: "" }),
      ],
      [],
      "管理员",
    );
    expect(result.ok).toEqual([]);
    expect(result.fail).toEqual([
      { row: 2, reason: "缺少姓名" },
      { row: 3, reason: "等级非法（金站）" },
      { row: 4, reason: "保留名（管理员）" },
    ]);
  });

  it("distinguishes active vs voided name clashes; in-file duplicate fails later row", () => {
    const result = previewStaffImport(
      [
        sheetRow({ row: 2, name: "张三" }),
        sheetRow({ row: 3, name: "已删员" }),
        sheetRow({ row: 4, name: "新员" }),
        sheetRow({ row: 5, name: " 新员 " }),
      ],
      [
        existing({ name: "张三", voided_at: null }),
        existing({ id: "s2", name: "已删员", voided_at: 99 }),
      ],
      "管理员",
    );
    expect(result.ok).toEqual([
      { row: 4, name: "新员", phone: "", notes: "", level: "normal" },
    ]);
    expect(result.fail).toEqual([
      { row: 2, reason: "已存在" },
      { row: 3, reason: "已存在（已删除）" },
      { row: 5, reason: "文件内重复" },
    ]);
  });
});
