import {
  DEFAULT_STAFF_LEVEL,
  STAFF_LEVELS,
  type Staff,
  type StaffLevel,
} from "@/data/staff";

/** One data row from the staff import sheet (header not included). */
export type StaffImportSheetRow = {
  /** 1-based spreadsheet row number (data starts at 2). */
  row: number;
  name: string;
  phone: string;
  notes: string;
  /** Raw 等级 cell text (empty → 普站). */
  level: string;
};

export type StaffImportOk = {
  row: number;
  name: string;
  phone: string;
  notes: string;
  level: StaffLevel;
};

export type StaffImportFail = {
  row: number;
  reason: string;
};

export type StaffImportPreview = {
  ok: StaffImportOk[];
  fail: StaffImportFail[];
};

/**
 * Pure staff-import preview: trim names, resolve level labels, dedupe against
 * existing (incl. voided) + admin reserved name + in-file duplicates.
 * Does not write — callers feed `ok` into `useImportStaff`.
 */
export function previewStaffImport(
  rows: StaffImportSheetRow[],
  existingStaff: Staff[],
  adminName: string,
): StaffImportPreview {
  const ok: StaffImportOk[] = [];
  const fail: StaffImportFail[] = [];
  const seenInFile = new Set<string>();
  const adminKey = adminName.trim();

  const byName = new Map<string, Staff>();
  for (const s of existingStaff) {
    byName.set(s.name.trim(), s);
  }

  for (const raw of rows) {
    const name = raw.name.trim();
    if (!name) {
      fail.push({ row: raw.row, reason: "缺少姓名" });
      continue;
    }

    if (name === adminKey) {
      fail.push({ row: raw.row, reason: "保留名（管理员）" });
      continue;
    }

    const existing = byName.get(name);
    if (existing) {
      fail.push({
        row: raw.row,
        reason:
          existing.voided_at == null ? "已存在" : "已存在（已删除）",
      });
      continue;
    }

    if (seenInFile.has(name)) {
      fail.push({ row: raw.row, reason: "文件内重复" });
      continue;
    }

    const levelResult = parseLevelCell(raw.level);
    if (!levelResult.ok) {
      fail.push({ row: raw.row, reason: levelResult.reason });
      continue;
    }

    seenInFile.add(name);
    ok.push({
      row: raw.row,
      name,
      phone: raw.phone.trim(),
      notes: raw.notes.trim(),
      level: levelResult.level,
    });
  }

  return { ok, fail };
}

function parseLevelCell(
  raw: string,
): { ok: true; level: StaffLevel } | { ok: false; reason: string } {
  const text = raw.trim();
  if (!text) {
    return { ok: true, level: DEFAULT_STAFF_LEVEL };
  }
  const def = STAFF_LEVELS.find((l) => l.label === text);
  if (!def) {
    return { ok: false, reason: `等级非法（${text}）` };
  }
  return { ok: true, level: def.code };
}
