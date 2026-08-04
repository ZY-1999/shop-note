import type { ReactElement } from "react";
import { afterEach, describe, expect, it, jest } from "@jest/globals";
import type { QueryClient } from "@tanstack/react-query";
import { fireEvent, within } from "@testing-library/react-native";
import { Text, StyleSheet } from "react-native";
import * as XLSX from "xlsx";

import { ImportForm } from "@/components/import-form";
import { InMemoryAdapter } from "@/data/in-memory";
import { setupRepos, type Repos } from "@/data/composition";
import { cents } from "@/data/primitives";
import { ADMIN_STAFF_ID, type Staff } from "@/data/staff";
import type { ExportJob } from "@/export/types";
import { PRODUCT_IMPORT_TEMPLATE_FILENAME } from "@/import/build-product-import-template";
import { RESTOCK_IMPORT_TEMPLATE_FILENAME } from "@/import/build-restock-import-template";
import { STAFF_IMPORT_TEMPLATE_FILENAME } from "@/import/build-staff-import-template";
import { renderWithProviders, type RenderWithProvidersResult } from "@/testing/render";
import { flushPending, waitForSync } from "@/testing/async";

/**
 * manage-import #01 — ImportForm staff path through real InMemory (ADR-0006).
 * DocumentPicker / file-system read / runExport / router are mocked (device IO).
 */

const mockBack = jest.fn<() => void>();
jest.mock("expo-router", () => ({
  router: { back: () => mockBack() },
}));

const mockRunExport = jest.fn<(job: ExportJob) => Promise<string>>(
  async () => "file:///cache/template.xlsx",
);
jest.mock("@/export/run-export", () => ({
  writeExportFile: (job: ExportJob) => mockRunExport(job),
  shareExportFile: async () => undefined,
  runExport: (job: ExportJob) => mockRunExport(job),
}));

jest.mock("expo-sharing", () => ({
  isAvailableAsync: async () => true,
  shareAsync: async () => undefined,
}));

const mockGetDocumentAsync = jest.fn<
  (opts?: {
    type?: string | string[];
    copyToCacheDirectory?: boolean;
    multiple?: boolean;
  }) => Promise<{
    canceled: boolean;
    assets?: { uri: string; name: string; mimeType?: string }[] | null;
  }>
>();
jest.mock("expo-document-picker", () => ({
  getDocumentAsync: (opts: unknown) =>
    mockGetDocumentAsync(
      opts as {
        type?: string | string[];
        copyToCacheDirectory?: boolean;
        multiple?: boolean;
      },
    ),
}));

const mockCopyAsync = jest.fn<(opts: { from: string; to: string }) => Promise<void>>(
  async () => undefined,
);
const mockReadAsStringAsync = jest.fn<(uri: string, opts?: unknown) => Promise<string>>();
jest.mock("expo-file-system/legacy", () => ({
  EncodingType: { Base64: "base64", UTF8: "utf8" },
  cacheDirectory: "file:///cache/",
  copyAsync: (opts: { from: string; to: string }) => mockCopyAsync(opts),
  readAsStringAsync: (uri: string, opts?: unknown) =>
    mockReadAsStringAsync(uri, opts),
  writeAsStringAsync: async () => undefined,
}));

let activeQueryClient: QueryClient | null = null;

afterEach(() => {
  activeQueryClient?.clear();
  activeQueryClient = null;
  mockBack.mockReset();
  mockRunExport.mockReset().mockResolvedValue("file:///cache/template.xlsx");
  mockGetDocumentAsync.mockReset();
  mockCopyAsync.mockReset().mockResolvedValue(undefined);
  mockReadAsStringAsync.mockReset();
  jest.restoreAllMocks();
});

async function renderImport(
  ui: ReactElement,
  opts?: { repos?: Repos },
): Promise<RenderWithProvidersResult> {
  const res = await renderWithProviders(ui, opts);
  activeQueryClient = res.queryClient;
  await flushPending();
  return res;
}

function workbookBase64(rows: string[][]): string {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "会员");
  return XLSX.write(wb, { type: "base64", bookType: "xlsx" }) as string;
}

async function seed() {
  const adapter = new InMemoryAdapter();
  await adapter.insert("staff", {
    id: ADMIN_STAFF_ID,
    name: "管理员",
    phone: "",
    notes: "",
    level: "normal",
    voided_at: null,
    created_at: 0,
    updated_at: 0,
  } as Staff);
  const repos = setupRepos(adapter);
  return { repos };
}

function textOf(node: { props: { children?: unknown } }): string {
  const c = node.props.children;
  if (typeof c === "string" || typeof c === "number") return String(c);
  if (Array.isArray(c)) return c.map(String).join("");
  return String(c ?? "");
}

describe("ImportForm — staff happy path (manage-import #01 tracer)", () => {
  it("downloads template via useExport; picks xlsx → preview; confirm imports once and backs", async () => {
    const { repos } = await seed();
    const { view } = await renderImport(<ImportForm kind="staff" />, { repos });

    expect(view.getByTestId("import-form-staff")).toBeTruthy();
    expect(view.queryByTestId("import-confirm-extra")).toBeNull();
    expect(textOf(view.getByTestId("import-format-hint"))).toContain(
      "仅支持模板文件内容格式导入",
    );

    await fireEvent.press(view.getByTestId("import-download-template"));
    await waitForSync(() => expect(mockRunExport).toHaveBeenCalled());
    const job = mockRunExport.mock.calls[0]![0]!;
    expect(job.filename).toBe(STAFF_IMPORT_TEMPLATE_FILENAME);
    expect(job.encoding).toBe("base64");
    const built = await job.build();
    const wb = XLSX.read(built, { type: "base64" });
    const sheet = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], {
      header: 1,
    });
    expect(sheet).toHaveLength(2);
    expect(sheet[0]).toEqual(["姓名", "电话", "备注", "等级"]);
    expect(sheet[1]).toEqual(["张三", "13800000000", "示例备注", "普站"]);

    const base64 = workbookBase64([
      ["姓名", "电话", "备注", "等级"],
      ["张三", "138", "熟客", "星站"],
      ["李四", "", "", ""],
    ]);
    mockGetDocumentAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [
        {
          uri: "file:///cache/in.xlsx",
          name: "in.xlsx",
          mimeType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
      ],
    });
    mockReadAsStringAsync.mockResolvedValueOnce(base64);

    await fireEvent.press(view.getByTestId("import-pick-file"));
    await waitForSync(() => view.getByTestId("import-preview"));
    expect(textOf(view.getByTestId("import-ok-count"))).toContain("2");
    expect(view.getByText("确认导入 2 个会员")).toBeTruthy();
    expect(view.getByTestId("import-ok-row-2")).toBeTruthy();
    expect(view.getByTestId("import-ok-row-3")).toBeTruthy();

    // 预览：单行省略（不换行）；等级为末列（姓名/电话/备注/等级）
    const row2 = within(view.getByTestId("import-ok-row-2"));
    const nameCell = row2.getByText("张三");
    expect(nameCell.props.numberOfLines).toBe(1);
    expect(nameCell.props.ellipsizeMode).toBe("tail");
    expect(row2.getByText("星站").props.numberOfLines).toBe(1);
    expect(row2.getByText("星站").props.ellipsizeMode).toBe("tail");
    const levelStyle = StyleSheet.flatten(row2.getByText("星站").props.style);
    expect(levelStyle.flex).toBe(0);
    expect(view.getByText("等级")).toBeTruthy();

    await fireEvent.press(view.getByTestId("import-confirm"));
    await waitForSync(() => expect(mockBack).toHaveBeenCalled());
    expect(await waitForSync(() => view.getByText("已导入 2 个会员"))).toBeTruthy();

    const listed = await repos.staff.list();
    expect(listed.map((s) => s.name).sort()).toEqual(["张三", "李四"]);
    expect(listed.find((s) => s.name === "张三")?.level).toBe("gold");
    expect(listed.find((s) => s.name === "李四")?.level).toBe("normal");
    expect(view.queryAllByText("会员已创建")).toHaveLength(0);
  });
});

describe("ImportForm — cancel / non-xlsx / failures / mid-fail / confirmExtra", () => {
  it("cancel pick and non-xlsx leave preview empty without error toast", async () => {
    const { repos } = await seed();
    const { view } = await renderImport(<ImportForm kind="staff" />, { repos });

    mockGetDocumentAsync.mockResolvedValueOnce({ canceled: true, assets: null });
    await fireEvent.press(view.getByTestId("import-pick-file"));
    await flushPending();
    expect(view.queryByTestId("import-preview")).toBeNull();
    expect(view.queryByTestId("toast")).toBeNull();

    mockGetDocumentAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [
        { uri: "file:///cache/a.csv", name: "a.csv", mimeType: "text/csv" },
      ],
    });
    await fireEvent.press(view.getByTestId("import-pick-file"));
    await flushPending();
    expect(view.queryByTestId("import-preview")).toBeNull();
    expect(view.queryByTestId("toast")).toBeNull();
    expect(mockReadAsStringAsync).not.toHaveBeenCalled();
  });

  it("shows expandable failures; confirmExtra slot renders when provided", async () => {
    const { repos } = await seed();
    await repos.staff.create({ name: "撞名", phone: "", notes: "" });
    const { view } = await renderImport(
      <ImportForm
        kind="staff"
        confirmExtra={<Text testID="extra-slot">整批备注</Text>}
      />,
      { repos },
    );

    const base64 = workbookBase64([
      ["姓名", "电话", "备注", "等级"],
      ["撞名", "", "", ""],
      ["新员", "", "", "金站"],
      ["好员", "1", "", "普站"],
    ]);
    mockGetDocumentAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: "file:///cache/in.xlsx", name: "in.xlsx" }],
    });
    mockReadAsStringAsync.mockResolvedValueOnce(base64);

    await fireEvent.press(view.getByTestId("import-pick-file"));
    await waitForSync(() => view.getByTestId("import-preview"));
    expect(view.getByTestId("import-confirm-extra")).toBeTruthy();
    expect(view.getByTestId("extra-slot")).toBeTruthy();
    expect(view.getByText("确认导入 1 个会员")).toBeTruthy();

    expect(view.queryByTestId("import-fail-row-2")).toBeNull();
    await fireEvent.press(view.getByTestId("import-fail-toggle"));
    await waitForSync(() => view.getByTestId("import-fail-row-2"));
    expect(view.getByText(/已存在/)).toBeTruthy();
    expect(view.getByTestId("import-fail-row-3")).toBeTruthy();
  });

  it("mid-fail: keeps already-created prefix, one toast.error, stays on page", async () => {
    const { repos } = await seed();
    const { view } = await renderImport(<ImportForm kind="staff" />, { repos });

    const base64 = workbookBase64([
      ["姓名", "电话", "备注", "等级"],
      ["甲", "", "", ""],
      ["乙", "", "", ""],
    ]);
    mockGetDocumentAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: "file:///cache/in.xlsx", name: "in.xlsx" }],
    });
    mockReadAsStringAsync.mockResolvedValueOnce(base64);
    await fireEvent.press(view.getByTestId("import-pick-file"));
    await waitForSync(() => view.getByText("确认导入 2 个会员"));

    const original = repos.staff.create.bind(repos.staff);
    let calls = 0;
    jest.spyOn(repos.staff, "create").mockImplementation(async (input) => {
      calls += 1;
      if (calls === 2) throw new Error("模拟中途失败");
      return original(input);
    });

    await fireEvent.press(view.getByTestId("import-confirm"));
    expect(await waitForSync(() => view.getByText("模拟中途失败"))).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
    expect(view.getByTestId("import-preview")).toBeTruthy();

    const listed = await repos.staff.list();
    expect(listed.map((s) => s.name)).toEqual(["甲"]);
  });
});

function productWorkbookBase64(rows: string[][]): string {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "商品");
  return XLSX.write(wb, { type: "base64", bookType: "xlsx" }) as string;
}

describe("ImportForm — product happy path (manage-import #02 tracer)", () => {
  it("downloads product template via useExport; picks xlsx → preview; confirm imports once and backs", async () => {
    const { repos } = await seed();
    const { view } = await renderImport(<ImportForm kind="product" />, { repos });

    expect(view.getByTestId("import-form-product")).toBeTruthy();
    expect(view.queryByTestId("import-form-unsupported")).toBeNull();
    expect(view.queryByTestId("import-confirm-extra")).toBeNull();

    await fireEvent.press(view.getByTestId("import-download-template"));
    await waitForSync(() => expect(mockRunExport).toHaveBeenCalled());
    const job = mockRunExport.mock.calls[0]![0]!;
    expect(job.filename).toBe(PRODUCT_IMPORT_TEMPLATE_FILENAME);
    expect(job.encoding).toBe("base64");
    const built = await job.build();
    const wb = XLSX.read(built, { type: "base64" });
    const sheet = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], {
      header: 1,
    });
    expect(sheet).toHaveLength(2);
    expect(sheet[0]).toEqual(["名称", "单价"]);
    expect(sheet[1]).toEqual(["可乐", "3.00"]);

    const base64 = productWorkbookBase64([
      ["名称", "单价"],
      ["可乐", "3.00"],
      ["雪碧", "2.5"],
    ]);
    mockGetDocumentAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [
        {
          uri: "file:///cache/in.xlsx",
          name: "in.xlsx",
          mimeType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
      ],
    });
    mockReadAsStringAsync.mockResolvedValueOnce(base64);

    await fireEvent.press(view.getByTestId("import-pick-file"));
    await waitForSync(() => view.getByTestId("import-preview"));
    expect(textOf(view.getByTestId("import-ok-count"))).toContain("2");
    expect(view.getByText("确认导入 2 个商品")).toBeTruthy();
    expect(view.getByTestId("import-ok-row-2")).toBeTruthy();
    expect(view.getByTestId("import-ok-row-3")).toBeTruthy();

    await fireEvent.press(view.getByTestId("import-confirm"));
    await waitForSync(() => expect(mockBack).toHaveBeenCalled());
    expect(await waitForSync(() => view.getByText("已导入 2 个商品"))).toBeTruthy();

    const listed = await repos.products.list();
    expect(listed.map((p) => p.title).sort()).toEqual(["可乐", "雪碧"]);
    expect(listed.find((p) => p.title === "可乐")?.purchase_price).toBe(cents(300));
    expect(listed.find((p) => p.title === "雪碧")?.purchase_price).toBe(cents(250));
    expect(view.queryAllByText("商品已创建")).toHaveLength(0);
  });
});

describe("ImportForm — product failures / mid-fail", () => {
  it("shows expandable product failures for title clash and illegal price", async () => {
    const { repos } = await seed();
    await repos.products.create({ title: "撞名", purchase_price: cents(100) });
    const { view } = await renderImport(<ImportForm kind="product" />, { repos });

    const base64 = productWorkbookBase64([
      ["名称", "单价"],
      ["撞名", "1.00"],
      ["坏价", "abc"],
      ["好品", "2.00"],
    ]);
    mockGetDocumentAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: "file:///cache/in.xlsx", name: "in.xlsx" }],
    });
    mockReadAsStringAsync.mockResolvedValueOnce(base64);

    await fireEvent.press(view.getByTestId("import-pick-file"));
    await waitForSync(() => view.getByTestId("import-preview"));
    expect(view.getByText("确认导入 1 个商品")).toBeTruthy();

    await fireEvent.press(view.getByTestId("import-fail-toggle"));
    await waitForSync(() => view.getByTestId("import-fail-row-2"));
    expect(view.getByText(/已存在/)).toBeTruthy();
    expect(view.getByTestId("import-fail-row-3")).toBeTruthy();
  });

  it("mid-fail: keeps already-created product prefix, one toast.error, stays on page", async () => {
    const { repos } = await seed();
    const { view } = await renderImport(<ImportForm kind="product" />, { repos });

    const base64 = productWorkbookBase64([
      ["名称", "单价"],
      ["甲品", "1.00"],
      ["乙品", "2.00"],
    ]);
    mockGetDocumentAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: "file:///cache/in.xlsx", name: "in.xlsx" }],
    });
    mockReadAsStringAsync.mockResolvedValueOnce(base64);
    await fireEvent.press(view.getByTestId("import-pick-file"));
    await waitForSync(() => view.getByText("确认导入 2 个商品"));

    const original = repos.products.create.bind(repos.products);
    let calls = 0;
    jest.spyOn(repos.products, "create").mockImplementation(async (input) => {
      calls += 1;
      if (calls === 2) throw new Error("模拟中途失败");
      return original(input);
    });

    await fireEvent.press(view.getByTestId("import-confirm"));
    expect(await waitForSync(() => view.getByText("模拟中途失败"))).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
    expect(view.getByTestId("import-preview")).toBeTruthy();

    const listed = await repos.products.list();
    expect(listed.map((p) => p.title)).toEqual(["甲品"]);
  });
});

describe("ImportForm — restock happy path (manage-import #03 tracer)", () => {
  async function seedRestock() {
    const adapter = new InMemoryAdapter();
    await adapter.insert("staff", {
      id: ADMIN_STAFF_ID,
      name: "管理员",
      phone: "",
      notes: "",
      level: "normal",
      voided_at: null,
      created_at: 0,
      updated_at: 0,
    } as Staff);
    const repos = setupRepos(adapter);
    // Own product seed — must NOT depend on product-import (#02).
    await repos.products.create({
      title: "可乐",
      purchase_price: cents(300),
    });
    await repos.products.create({
      title: "薯片",
      purchase_price: cents(500),
    });
    return { repos };
  }

  function restockWorkbook(rows: string[][]): string {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "补货");
    return XLSX.write(wb, { type: "base64", bookType: "xlsx" }) as string;
  }

  it("downloads restock template; confirm with batch note writes one in/-1 record per row", async () => {
    const { repos } = await seedRestock();
    const { view } = await renderImport(<ImportForm kind="restock" />, {
      repos,
    });

    expect(view.getByTestId("import-form-restock")).toBeTruthy();

    await fireEvent.press(view.getByTestId("import-download-template"));
    await waitForSync(() => expect(mockRunExport).toHaveBeenCalled());
    const job = mockRunExport.mock.calls[0]![0]!;
    expect(job.filename).toBe(RESTOCK_IMPORT_TEMPLATE_FILENAME);
    expect(job.encoding).toBe("base64");
    const built = await job.build();
    const wb = XLSX.read(built, { type: "base64" });
    const sheet = XLSX.utils.sheet_to_json<unknown[]>(
      wb.Sheets[wb.SheetNames[0]],
      { header: 1 },
    );
    expect(sheet).toHaveLength(2);
    expect(sheet[0]).toEqual(["商品名称", "数量"]);
    expect(String(sheet[1]![0])).toMatch(/示例/);

    const base64 = restockWorkbook([
      ["商品名称", "数量"],
      ["可乐", "10"],
      ["薯片", "2"],
    ]);
    mockGetDocumentAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [
        {
          uri: "file:///cache/restock.xlsx",
          name: "restock.xlsx",
          mimeType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
      ],
    });
    mockReadAsStringAsync.mockResolvedValueOnce(base64);

    await fireEvent.press(view.getByTestId("import-pick-file"));
    await waitForSync(() => view.getByTestId("import-preview"));
    expect(textOf(view.getByTestId("import-ok-count"))).toContain("2");
    expect(view.getByText("确认导入 2 笔补货")).toBeTruthy();
    expect(view.getByTestId("import-confirm-extra")).toBeTruthy();
    expect(view.getByTestId("import-batch-note")).toBeTruthy();

    await fireEvent.changeText(view.getByTestId("import-batch-note"), "进货单A");
    await fireEvent.press(view.getByTestId("import-confirm"));
    await waitForSync(() => expect(mockBack).toHaveBeenCalled());
    expect(
      await waitForSync(() => view.getByText("已导入 2 笔补货")),
    ).toBeTruthy();

    const records = await repos.stockRecords.list({ direction: "in" });
    expect(records).toHaveLength(2);
    for (const { record, items } of records) {
      expect(record.staff_id).toBe(ADMIN_STAFF_ID);
      expect(record.direction).toBe("in");
      expect(record.note).toBe("进货单A");
      expect(items).toHaveLength(1);
    }
    const qtys = records
      .map((r) => r.items[0]!.qty)
      .sort((a, b) => a - b);
    expect(qtys).toEqual([2, 10]);
    expect(view.queryAllByText("记录已保存")).toHaveLength(0);
  });
});

describe("ImportForm — Android sandbox read path (manage-import #04)", () => {
  it("copies content:// into scoped cache before read; preview shows without isn't readable toast", async () => {
    const { repos } = await seed();
    const { view } = await renderImport(<ImportForm kind="staff" />, { repos });

    const base64 = workbookBase64([
      ["姓名", "电话", "备注", "等级"],
      ["沙箱员", "139", "", "普站"],
    ]);
    const contentUri = "content://com.android.providers.media.documents/document/123.xlsx";
    mockGetDocumentAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [
        {
          uri: contentUri,
          name: "in.xlsx",
          mimeType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
      ],
    });
    mockReadAsStringAsync.mockImplementation(async (uri) => {
      if (uri.startsWith("content://")) {
        throw new Error(`Location '${uri}' isn't readable`);
      }
      return base64;
    });

    await fireEvent.press(view.getByTestId("import-pick-file"));
    await waitForSync(() => view.getByTestId("import-preview"));

    expect(mockGetDocumentAsync).toHaveBeenCalledWith(
      expect.objectContaining({ copyToCacheDirectory: false }),
    );
    expect(mockCopyAsync).toHaveBeenCalledTimes(1);
    const copyArg = mockCopyAsync.mock.calls[0]![0]!;
    expect(copyArg.from).toBe(contentUri);
    expect(copyArg.to).toMatch(/^file:\/\/\/cache\/import-\d+\.xlsx$/);
    expect(mockReadAsStringAsync).toHaveBeenCalledWith(copyArg.to, {
      encoding: "base64",
    });
    expect(textOf(view.getByTestId("import-ok-count"))).toContain("1");
    expect(view.queryByText(/isn't readable/)).toBeNull();
  });

  it("copies out-of-scope file uri into scoped cache before read", async () => {
    const { repos } = await seed();
    const { view } = await renderImport(<ImportForm kind="staff" />, { repos });

    const base64 = workbookBase64([
      ["姓名", "电话", "备注", "等级"],
      ["外域员", "", "", ""],
    ]);
    const hostUri =
      "file:///data/user/0/host.exp.exponent/cache/DocumentPicker/host.xlsx";
    mockGetDocumentAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: hostUri, name: "host.xlsx" }],
    });
    mockReadAsStringAsync.mockResolvedValueOnce(base64);

    await fireEvent.press(view.getByTestId("import-pick-file"));
    await waitForSync(() => view.getByTestId("import-preview"));

    expect(mockCopyAsync).toHaveBeenCalledTimes(1);
    const copyArg = mockCopyAsync.mock.calls[0]![0]!;
    expect(copyArg.from).toBe(hostUri);
    expect(copyArg.to).toMatch(/^file:\/\/\/cache\/import-\d+\.xlsx$/);
    expect(mockReadAsStringAsync).toHaveBeenCalledWith(copyArg.to, {
      encoding: "base64",
    });
  });

  it("skips copyAsync when uri is already under experience cacheDirectory", async () => {
    const { repos } = await seed();
    const { view } = await renderImport(<ImportForm kind="staff" />, { repos });

    const base64 = workbookBase64([
      ["姓名", "电话", "备注", "等级"],
      ["短路员", "", "", ""],
    ]);
    const scopedUri = "file:///cache/already-scoped.xlsx";
    mockGetDocumentAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: scopedUri, name: "already-scoped.xlsx" }],
    });
    mockReadAsStringAsync.mockResolvedValueOnce(base64);

    await fireEvent.press(view.getByTestId("import-pick-file"));
    await waitForSync(() => view.getByTestId("import-preview"));

    expect(mockCopyAsync).not.toHaveBeenCalled();
    expect(mockReadAsStringAsync).toHaveBeenCalledWith(scopedUri, {
      encoding: "base64",
    });
    expect(textOf(view.getByTestId("import-ok-count"))).toContain("1");
  });
});
