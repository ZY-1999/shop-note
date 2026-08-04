import type { ReactElement } from "react";
import { afterEach, describe, expect, it, jest } from "@jest/globals";
import type { QueryClient } from "@tanstack/react-query";
import { fireEvent } from "@testing-library/react-native";
import { StyleSheet, Text, View } from "react-native";
import * as XLSX from "xlsx";

import { ManageTab } from "@/components/manage-tab";
import { useShopAggregate } from "@/hooks/reads";
import { InMemoryAdapter } from "@/data/in-memory";
import { setupRepos, type Repos } from "@/data/composition";
import { ADMIN_STAFF_ID } from "@/data/staff";
import { cents } from "@/data/primitives";
import type { ExportJob } from "@/export/types";
import { staffExportFilename } from "@/export/build-staff-workbook";
import { productExportFilename } from "@/export/build-product-workbook";
import { renderWithProviders, type RenderWithProvidersResult } from "@/testing/render";
import { flushPending, waitForSync } from "@/testing/async";

/**
 * Spec #09 (manage-tab) — staff & product CRUD, through the real data stack
 * (ADR-0006: InMemoryAdapter, no mocked Repos). Async mechanics (waitForSync /
 * flushPending / QueryClient clear) live in [testing/async.ts](../testing/async.ts).
 *
 * Export IO (manage-export #03/#04): `runExport` is mocked so share/write stay
 * off-device; `useExport` stays real so pending + onError→toast wiring is exercised.
 */

const mockPush = jest.fn<(href: unknown) => void>();
jest.mock("expo-router", () => ({
  router: {
    push: (href: unknown) => mockPush(href),
    back: () => undefined,
  },
}));

const mockRunExport = jest.fn<(job: ExportJob) => Promise<string>>(
  async () => "file:///cache/out.xlsx",
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

let activeQueryClient: QueryClient | null = null;

afterEach(() => {
  // Same isolation posture as the #07/#08 suites: clear() cancels the
  // mutation's invalidated refetch queries so nothing fires on the next test's
  // tree. (Deliberately NOT async — awaiting flushPending here yields inside the
  // test's act scope, letting React Query's notifyManager enter a second act and
  // produce "overlapping act() calls", which corrupts the next test's render.)
  activeQueryClient?.clear();
  activeQueryClient = null;
  mockRunExport.mockReset().mockResolvedValue("file:///cache/out.xlsx");
  mockPush.mockReset();
});

async function renderManage(
  ui: ReactElement,
  opts?: { repos?: Repos },
): Promise<RenderWithProvidersResult> {
  const res = await renderWithProviders(ui, opts);
  activeQueryClient = res.queryClient;
  await flushPending();
  return res;
}

async function seed() {
  const repos = setupRepos(new InMemoryAdapter());
  const staff = await repos.staff.create({ name: "张三", phone: "138", notes: "" });
  const cola = await repos.products.create({ title: "可乐", purchase_price: cents(300), code: "C001", category: "饮料" });
  return { repos, staffId: staff.id, colaId: cola.id };
}

describe("ManageTab — staff|product toggle + staff list (spec #09 AC1)", () => {
  it("toggles between the staff and product domains", async () => {
    const { repos } = await seed();
    const { view } = await renderManage(<ManageTab />, { repos });

    expect(view.getByTestId("seg-staff")).toBeTruthy();
    expect(view.getByTestId("seg-product")).toBeTruthy();
    expect(await waitForSync(() => view.getByTestId("view-staff"))).toBeTruthy();

    await fireEvent.press(view.getByTestId("seg-product"));
    await waitForSync(() => view.getByTestId("view-product"));
    expect(() => view.getByTestId("view-staff")).toThrow();
  });

  it("lists staff and narrows by search", async () => {
    const { repos, staffId } = await seed();
    const { view } = await renderManage(<ManageTab />, { repos });

    await waitForSync(() => view.getByTestId(`manage-staff-${staffId}`));
    await fireEvent.changeText(view.getByTestId("staff-search"), "张");
    await waitForSync(() => view.getByTestId(`manage-staff-${staffId}`)); // still matches

    await fireEvent.changeText(view.getByTestId("staff-search"), "不存在");
    await waitForSync(() => expect(() => view.getByTestId(`manage-staff-${staffId}`)).toThrow());
  });
});

describe("ManageTab — staff create (spec #09 AC2)", () => {
  it("creates a staff who then appears in the list", async () => {
    const { repos } = await seed();
    const { view } = await renderManage(<ManageTab />, { repos });
    await waitForSync(() => view.getByTestId("seg-staff"));

    await fireEvent.press(view.getByTestId("staff-create"));
    await waitForSync(() => view.getByTestId("staff-name-input"));
    // form fields are labeled; phone/notes are marked optional (manage UI polish)
    expect(view.getByText("姓名")).toBeTruthy();
    expect(view.getByText("电话（可选）")).toBeTruthy();
    expect(view.getByText("备注（可选）")).toBeTruthy();
    // RNTL v14's fireEvent.* are async (each wraps `await act(...)`). Awaiting
    // every one — and never chaining two bare — keeps act scopes from overlapping,
    // which is what leaked across tests and corrupted the next render (#09).
    await fireEvent.changeText(view.getByTestId("staff-name-input"), "李四");
    await fireEvent.changeText(view.getByTestId("staff-phone-input"), "139");
    await fireEvent.press(view.getByTestId("staff-submit"));

    // back to list; the new staff appears (refetched via useCreateStaff's invalidation)
    await waitForSync(() => view.getByText("李四"));
    const created = (await repos.staff.list()).find((s) => s.name === "李四");
    expect(created).toBeTruthy();
    expect(created?.phone).toBe("139");
  });

  it("blocks create when the name is empty", async () => {
    const { repos } = await seed();
    const { view } = await renderManage(<ManageTab />, { repos });
    await waitForSync(() => view.getByTestId("seg-staff"));

    await fireEvent.press(view.getByTestId("staff-create"));
    await waitForSync(() => view.getByTestId("staff-submit")); // form mounted before the next press
    await fireEvent.press(view.getByTestId("staff-submit"));
    const error = await waitForSync(() => view.getByTestId("staff-form-error"));
    expect(error.props.children).toBe("请输入姓名");
  });
});

describe("ManageTab — staff void/restore (spec #09 AC2)", () => {
  it("voids a staff then restores them; voided drops from active reads", async () => {
    const { repos, staffId } = await seed();
    const { view } = await renderManage(<ManageTab />, { repos });
    await waitForSync(() => view.getByTestId(`manage-staff-${staffId}`));

    // void via the row action — soft-delete (voided_at), never erased
    await fireEvent.press(view.getByTestId(`staff-void-${staffId}`));
    // default 「包含删除」off → voided row disappears from the list
    await waitForSync(() => expect(() => view.getByTestId(`manage-staff-${staffId}`)).toThrow());

    const voided = await repos.staff.getById(staffId);
    expect(voided?.voided_at).not.toBeNull();
    // the repo's active reads exclude voided → drops from 记账 selectors
    const active = await repos.staff.list();
    expect(active.find((s) => s.id === staffId)).toBeUndefined();

    // flip 「包含删除」→ voided row + restore affordance appear
    await fireEvent(view.getByTestId("staff-include-voided"), "valueChange", true);
    await waitForSync(() => view.getByText("已删除"));

    // restore — clears voided_at, reappears in selectors
    await fireEvent.press(view.getByTestId(`staff-restore-${staffId}`));
    await waitForSync(() => expect(() => view.getByText("已删除")).toThrow());

    const restored = await repos.staff.getById(staffId);
    expect(restored?.voided_at).toBeNull();
  });
});

describe("ManageTab — includeVoided filter (manage-export #01)", () => {
  it("staff: default hides voided; switch shows them; search respects the switch", async () => {
    const { repos, staffId } = await seed(); // 张三
    await repos.staff.void(staffId);
    const { view } = await renderManage(<ManageTab />, { repos });

    // default off — voided 张三 hidden; switch present
    expect(view.getByTestId("staff-include-voided")).toBeTruthy();
    await waitForSync(() => expect(() => view.getByTestId(`manage-staff-${staffId}`)).toThrow());

    // switch on — voided appears with restore
    await fireEvent(view.getByTestId("staff-include-voided"), "valueChange", true);
    await waitForSync(() => view.getByTestId(`manage-staff-${staffId}`));
    expect(view.getByText("已删除")).toBeTruthy();

    // search with switch on hits voided
    await fireEvent.changeText(view.getByTestId("staff-search"), "张");
    await waitForSync(() => view.getByTestId(`manage-staff-${staffId}`));

    // search with switch off excludes voided
    await fireEvent(view.getByTestId("staff-include-voided"), "valueChange", false);
    await waitForSync(() => expect(() => view.getByTestId(`manage-staff-${staffId}`)).toThrow());
  });

  it("product: default hides voided; switch + search combination mirrors staff", async () => {
    const { repos, colaId } = await seed();
    await repos.products.void(colaId);
    const { view } = await renderManage(<ManageTab />, { repos });
    await fireEvent.press(view.getByTestId("seg-product"));
    await waitForSync(() => view.getByTestId("view-product"));

    expect(view.getByTestId("product-include-voided")).toBeTruthy();
    await waitForSync(() => expect(() => view.getByTestId(`manage-product-${colaId}`)).toThrow());

    await fireEvent(view.getByTestId("product-include-voided"), "valueChange", true);
    await waitForSync(() => view.getByTestId(`manage-product-${colaId}`));
    expect(view.getByText("已删除")).toBeTruthy();

    await fireEvent.changeText(view.getByTestId("product-search"), "可乐");
    await waitForSync(() => view.getByTestId(`manage-product-${colaId}`));

    await fireEvent(view.getByTestId("product-include-voided"), "valueChange", false);
    await waitForSync(() => expect(() => view.getByTestId(`manage-product-${colaId}`)).toThrow());
  });

  it("restock / config segments have no include-voided switch", async () => {
    const { repos } = await seed();
    const { view } = await renderManage(<ManageTab />, { repos });

    await fireEvent.press(view.getByTestId("seg-restock"));
    await waitForSync(() => view.getByTestId("view-restock"));
    expect(view.queryByTestId("staff-include-voided")).toBeNull();
    expect(view.queryByTestId("product-include-voided")).toBeNull();

    await fireEvent.press(view.getByTestId("seg-config"));
    await waitForSync(() => view.getByTestId("config-price-input"));
    expect(view.queryByTestId("staff-include-voided")).toBeNull();
    expect(view.queryByTestId("product-include-voided")).toBeNull();
  });
});

describe("ManageTab — staff edit via row tap (manage UI polish)", () => {
  it("tapping a staff row opens a preloaded edit form; saving persists the change", async () => {
    const { repos, staffId } = await seed(); // 张三 / phone 138
    const { view } = await renderManage(<ManageTab />, { repos });
    await waitForSync(() => view.getByTestId(`manage-staff-${staffId}`));

    // tap the row → edit form opens, preloaded with the staff's current name
    await fireEvent.press(view.getByTestId(`manage-staff-${staffId}`));
    await waitForSync(() => view.getByTestId("staff-name-input"));
    expect(view.getByDisplayValue("张三")).toBeTruthy();

    // rename + save
    await fireEvent.changeText(view.getByTestId("staff-name-input"), "张三改");
    await fireEvent.press(view.getByTestId("staff-submit"));

    // back to list; renamed staff appears, repo reflects the update (not a new staff)
    await waitForSync(() => view.getByText("张三改"));
    const updated = await repos.staff.getById(staffId);
    expect(updated?.name).toBe("张三改");
  });
});

describe("ManageTab — staff row shows '--' when phone is empty (manage UI polish)", () => {
  it("shows '--' in place of an empty phone", async () => {
    const repos = setupRepos(new InMemoryAdapter());
    const noPhone = await repos.staff.create({ name: "无名电话", phone: "", notes: "" });
    const { view } = await renderManage(<ManageTab />, { repos });
    await waitForSync(() => view.getByTestId(`manage-staff-${noPhone.id}`));
    expect(view.getByText("--")).toBeTruthy();
  });
});

describe("ManageTab — product list + search + create (spec #09 AC1/AC3)", () => {
  it("lists products and narrows by title search", async () => {
    const { repos, colaId } = await seed();
    const { view } = await renderManage(<ManageTab />, { repos });
    await fireEvent.press(view.getByTestId("seg-product"));

    await waitForSync(() => view.getByTestId(`manage-product-${colaId}`));
    expect(view.getByText("可乐")).toBeTruthy();

    await fireEvent.changeText(view.getByTestId("product-search"), "可乐");
    await waitForSync(() => view.getByTestId(`manage-product-${colaId}`)); // still matches

    await fireEvent.changeText(view.getByTestId("product-search"), "不存在");
    await waitForSync(() => expect(() => view.getByTestId(`manage-product-${colaId}`)).toThrow());
  });

  it("creates a product (title + 元-price → Cents) who then appears in the list", async () => {
    const { repos } = await seed();
    const { view } = await renderManage(<ManageTab />, { repos });
    await fireEvent.press(view.getByTestId("seg-product"));
    await waitForSync(() => view.getByTestId("seg-product"));

    await fireEvent.press(view.getByTestId("product-create"));
    await waitForSync(() => view.getByTestId("product-title-input"));
    // code/category inputs were removed from the form (manage UI polish);
    // the data fields stay (nullable) — only title + price are user-editable.
    expect(() => view.getByTestId("product-code-input")).toThrow();
    expect(() => view.getByTestId("product-category-input")).toThrow();
    // form fields are labeled (manage UI polish)
    expect(view.getByText("名称")).toBeTruthy();
    expect(view.getByText("单价（元）")).toBeTruthy();
    await fireEvent.changeText(view.getByTestId("product-title-input"), "雪碧");
    await fireEvent.changeText(view.getByTestId("product-price-input"), "2.5");
    await fireEvent.press(view.getByTestId("product-submit"));

    await waitForSync(() => view.getByText("雪碧"));
    const created = (await repos.products.list()).find((p) => p.title === "雪碧");
    expect(created).toBeTruthy();
    expect(created?.purchase_price).toBe(cents(250)); // 2.50 元 → 250 分
    expect(created?.code).toBeNull(); // no code input → stored as null
  });

  it("blocks product create when the title is empty", async () => {
    const { repos } = await seed();
    const { view } = await renderManage(<ManageTab />, { repos });
    await fireEvent.press(view.getByTestId("seg-product"));
    await waitForSync(() => view.getByTestId("seg-product"));

    await fireEvent.press(view.getByTestId("product-create"));
    await waitForSync(() => view.getByTestId("product-submit"));
    await fireEvent.press(view.getByTestId("product-submit"));
    const error = await waitForSync(() => view.getByTestId("product-form-error"));
    expect(error.props.children).toBe("请输入名称");
  });
});

/**
 * A product price edit revalues every derived amount on the next read. Uses a
 * test-only <InventoryReader> mounted under the same queryClient as the
 * ManageTab, so the cross-entity invalidation (qk.inventory from useUpdateProduct)
 * is observable: edit the price, and the open global aggregate refetches with no
 * manual recompute. Reads `useShopAggregate` (members no longer hold stock).
 */
function InventoryReader({ productId }: { productId: string }) {
  const agg = useShopAggregate();
  const row = (agg.data ?? []).find((a) => a.product.id === productId);
  return (
    <View testID="inventory-reader">
      <Text>{row ? `qty:${row.total_qty}` : "none"}</Text>
      <Text>{row?.product.voided_at ? "voided" : "active"}</Text>
    </View>
  );
}

describe("ManageTab — product price edit revalues inventory (spec #09 AC4)", () => {
  it("editing a product's price reflows the open global aggregate on the next read", async () => {
    const { repos, colaId } = await seed(); // 可乐 @ 300¢
    // restock cola×4 via admin -1 so there's a global qty to read (4 units)
    await repos.stockRecords.create({
      staff_id: ADMIN_STAFF_ID,
      direction: "in",
      items: [{ product_id: colaId, qty: 4 }],
    });
    const { view } = await renderManage(
      <View>
        <ManageTab />
        <InventoryReader productId={colaId} />
      </View>,
      { repos },
    );
    await fireEvent.press(view.getByTestId("seg-product"));
    await waitForSync(() => view.getByTestId(`manage-product-${colaId}`));
    await waitForSync(() => view.getByText("qty:4")); // global aggregate loaded: 4 units

    // open the product's edit form via row tap, change its price 300¢ → 700¢
    await fireEvent.press(view.getByTestId(`manage-product-${colaId}`));
    await waitForSync(() => view.getByTestId("product-price-input"));
    await fireEvent.changeText(view.getByTestId("product-price-input"), "7");
    await fireEvent.press(view.getByTestId("product-submit"));

    // useUpdateProduct invalidated qk.inventory → aggregate refetches at the new price
    await waitForSync(async () => {
      const p = await repos.products.getById(colaId);
      expect(p?.purchase_price).toBe(cents(700));
    });
    // qty stays 4 (a price change revalues cost, not quantity)
    await waitForSync(() => expect(view.getByText("qty:4")).toBeTruthy());
  });
});

describe("ManageTab — product void/restore + snapshot preservation (spec #09 AC5)", () => {
  it("voiding a product refetches the open global aggregate with its voided state", async () => {
    const { repos, colaId } = await seed();
    await repos.stockRecords.create({
      staff_id: ADMIN_STAFF_ID,
      direction: "in",
      items: [{ product_id: colaId, qty: 2 }],
    });
    const { view } = await renderManage(
      <View>
        <ManageTab />
        <InventoryReader productId={colaId} />
      </View>,
      { repos },
    );
    await fireEvent.press(view.getByTestId("seg-product"));
    await waitForSync(() => view.getByTestId(`manage-product-${colaId}`));
    await waitForSync(() => view.getByText("active"));

    await fireEvent.press(view.getByTestId(`product-void-${colaId}`));

    await waitForSync(() => expect(view.getByText("voided")).toBeTruthy());
  });

  it("restoring a product refetches the open global aggregate with its active state", async () => {
    const { repos, colaId } = await seed();
    await repos.stockRecords.create({
      staff_id: ADMIN_STAFF_ID,
      direction: "in",
      items: [{ product_id: colaId, qty: 2 }],
    });
    await repos.products.void(colaId);
    const { view } = await renderManage(
      <View>
        <ManageTab />
        <InventoryReader productId={colaId} />
      </View>,
      { repos },
    );
    await fireEvent.press(view.getByTestId("seg-product"));
    await fireEvent(view.getByTestId("product-include-voided"), "valueChange", true);
    await waitForSync(() => view.getByTestId(`product-restore-${colaId}`));
    await waitForSync(() => view.getByText("voided"));

    await fireEvent.press(view.getByTestId(`product-restore-${colaId}`));

    await waitForSync(() => expect(view.getByText("active")).toBeTruthy());
  });

  it("voids a product then restores it; record snapshots stay intact", async () => {
    const { repos, colaId } = await seed();
    // restock a record so there's a snapshot to preserve across the void
    const { record } = await repos.stockRecords.create({
      staff_id: ADMIN_STAFF_ID,
      direction: "in",
      items: [{ product_id: colaId, qty: 2 }],
    });

    const { view } = await renderManage(<ManageTab />, { repos });
    await fireEvent.press(view.getByTestId("seg-product"));
    await waitForSync(() => view.getByTestId(`manage-product-${colaId}`));

    // void — soft-delete; drops from list when 「包含删除」is off
    await fireEvent.press(view.getByTestId(`product-void-${colaId}`));
    await waitForSync(() => expect(() => view.getByTestId(`manage-product-${colaId}`)).toThrow());
    const voided = await repos.products.getById(colaId);
    expect(voided?.voided_at).not.toBeNull();
    const active = await repos.products.list();
    expect(active.find((p) => p.id === colaId)).toBeUndefined();

    // the record's snapshot is untouched (title/price frozen at posting time)
    const detail = await repos.stockRecords.getById(record.id);
    expect(detail?.items[0].title).toBe("可乐");
    expect(detail?.items[0].unit_price).toBe(cents(300));

    // flip switch → restore affordance; restore — re-selectable
    await fireEvent(view.getByTestId("product-include-voided"), "valueChange", true);
    await waitForSync(() => view.getByText("已删除"));
    await fireEvent.press(view.getByTestId(`product-restore-${colaId}`));
    await waitForSync(() => expect(() => view.getByText("已删除")).toThrow());
    const restored = await repos.products.getById(colaId);
    expect(restored?.voided_at).toBeNull();
  });
});

describe("ManageTab — restock segment (stock-balance-refactor AC3)", () => {
  it("switches to the 补货 segment which lists products to pick", async () => {
    const { repos, colaId } = await seed();
    const { view } = await renderManage(<ManageTab />, { repos });
    await fireEvent.press(view.getByTestId("seg-restock"));
    await waitForSync(() => view.getByTestId("view-restock"));
    await waitForSync(() => view.getByTestId(`pick-${colaId}`));
  });

  it("blocks restock when no product is selected", async () => {
    const { repos } = await seed();
    const { view } = await renderManage(<ManageTab />, { repos });
    await fireEvent.press(view.getByTestId("seg-restock"));
    await waitForSync(() => view.getByTestId("restock-submit"));
    await fireEvent.press(view.getByTestId("restock-submit"));
    const error = await waitForSync(() => view.getByTestId("restock-error"));
    expect(error.props.children).toBe("请选择商品");
  });

  it("picking a product + qty restocks under admin -1 → shopAggregate reflects it", async () => {
    const { repos, colaId } = await seed();
    const { view } = await renderManage(<ManageTab />, { repos });
    await fireEvent.press(view.getByTestId("seg-restock"));
    await waitForSync(() => view.getByTestId(`pick-${colaId}`));

    await fireEvent.press(view.getByTestId(`pick-${colaId}`));
    await fireEvent.changeText(await waitForSync(() => view.getByTestId("qty-0")), "10");
    await fireEvent.press(view.getByTestId("restock-submit"));

    // the restock landed under admin -1 → global shopAggregate qty for 可乐 is 10.
    await waitForSync(async () => {
      const agg = (await repos.inventory.shopAggregate()).find((a) => a.product.id === colaId);
      expect(agg?.total_qty).toBe(10);
    });
    const [posted] = await repos.stockRecords.list();
    expect(posted.record.staff_id).toBe(ADMIN_STAFF_ID);
    expect(posted.record.direction).toBe("in");

    // a member out ×3 then brings the global stock to 7 (US1 + US6 data layer).
    const member = (await repos.staff.list())[0];
    await repos.stockRecords.create({
      staff_id: member.id,
      direction: "out",
      items: [{ product_id: colaId, qty: 3 }],
    });
    const agg2 = (await repos.inventory.shopAggregate()).find((a) => a.product.id === colaId);
    expect(agg2?.total_qty).toBe(7);
  });

  it("keeps ItemsSeletor line marginTop 4 under restock content gap", async () => {
    const { repos, colaId } = await seed();
    const water = await repos.products.create({
      title: "水",
      purchase_price: cents(200),
    });
    const { view } = await renderManage(<ManageTab />, { repos });
    await fireEvent.press(view.getByTestId("seg-restock"));
    await waitForSync(() => view.getByTestId(`pick-${colaId}`));
    await fireEvent.press(view.getByTestId(`pick-${colaId}`));
    await fireEvent.press(view.getByTestId(`pick-${water.id}`));
    await waitForSync(() => view.getByTestId("picked-line-1"));

    // Root View isolates lines from listContent gap:8 — same density as 出库.
    expect(view.getByTestId("items-selector")).toBeTruthy();
    expect(
      StyleSheet.flatten(view.getByTestId("picked-line-0").props.style).marginTop,
    ).toBe(4);
    expect(
      StyleSheet.flatten(view.getByTestId("picked-line-1").props.style).marginTop,
    ).toBe(4);
  });
});

describe("ManageTab — config segment (stock-balance-refactor US2)", () => {
  it("switches to the 配置 segment showing the current unit price (0 on cold start)", async () => {
    const { repos } = await seed();
    const { view } = await renderManage(<ManageTab />, { repos });
    await fireEvent.press(view.getByTestId("seg-config"));
    await waitForSync(() => view.getByTestId("config-price-input"));
    // input 直接承载当前单价 —— 冷启动 data=0 → input 显示 "0"
    await waitForSync(() =>
      expect(view.getByTestId("config-price-input").props.value).toBe("0"),
    );
  });

  it("pre-fills the input with an already-configured unit price once it loads", async () => {
    const { repos } = await seed();
    await repos.config.setUnitPrice(cents(2400)); // ¥24.00 already set
    const { view } = await renderManage(<ManageTab />, { repos });
    await fireEvent.press(view.getByTestId("seg-config"));
    await waitForSync(() => view.getByTestId("config-price-input"));
    // the input reflects the loaded price (not stuck at the pre-load "0")
    await waitForSync(() => expect(view.getByTestId("config-price-input").props.value).toBe("24"));
  });

  it("entering a unit price + save posts it via useUpdateUnitPrice", async () => {
    const { repos } = await seed();
    const { view } = await renderManage(<ManageTab />, { repos });
    await fireEvent.press(view.getByTestId("seg-config"));
    await waitForSync(() => view.getByTestId("config-price-input"));

    await fireEvent.changeText(view.getByTestId("config-price-input"), "24");
    await flushPending(); // let setPrice commit before submit reads it (stale-closure guard)
    await fireEvent.press(view.getByTestId("config-submit"));

    await waitForSync(async () => {
      expect(await repos.config.getUnitPrice()).toBe(cents(2400)); // ¥24.00
    });
    // 保存成功 → 按钮给「已保存」反馈（input 值 = 输入 = 新 DB 值，需按钮让"更新"可见）
    await waitForSync(() => expect(view.getByText("已保存")).toBeTruthy());
  });

  it("four segments toggle (会员 / 商品 / 补货 / 配置)", async () => {
    const { repos } = await seed();
    const { view } = await renderManage(<ManageTab />, { repos });
    expect(view.getByTestId("seg-staff")).toBeTruthy();
    expect(view.getByTestId("seg-product")).toBeTruthy();
    expect(view.getByTestId("seg-restock")).toBeTruthy();
    expect(view.getByTestId("seg-config")).toBeTruthy();
  });
});

describe("ManageTab — member level selector + badge (member-rename-level #03)", () => {
  it("create form has a level selector; submitting unchanged creates a 普站 member", async () => {
    const { repos } = await seed();
    const { view } = await renderManage(<ManageTab />, { repos });
    await waitForSync(() => view.getByTestId("seg-staff"));
    await fireEvent.press(view.getByTestId("staff-create"));
    await waitForSync(() => view.getByTestId("staff-name-input"));

    // two level options present
    expect(view.getByTestId("staff-level-normal")).toBeTruthy();
    expect(view.getByTestId("staff-level-gold")).toBeTruthy();

    await fireEvent.changeText(view.getByTestId("staff-name-input"), "王五");
    await fireEvent.press(view.getByTestId("staff-submit"));

    await waitForSync(() => view.getByText("王五"));
    const created = (await repos.staff.list()).find((s) => s.name === "王五");
    expect(created?.level).toBe("normal");
  });

  it("picking 星站 creates a 星站 member and shows the 星站 badge in the list", async () => {
    const { repos } = await seed();
    const { view } = await renderManage(<ManageTab />, { repos });
    await waitForSync(() => view.getByTestId("seg-staff"));
    await fireEvent.press(view.getByTestId("staff-create"));
    await waitForSync(() => view.getByTestId("staff-name-input"));

    await fireEvent.changeText(view.getByTestId("staff-name-input"), "赵六");
    await fireEvent.press(view.getByTestId("staff-level-gold"));
    await fireEvent.press(view.getByTestId("staff-submit"));

    await waitForSync(() => view.getByText("赵六"));
    const created = (await repos.staff.list()).find((s) => s.name === "赵六");
    expect(created?.level).toBe("gold");
    expect(view.getByText("星站")).toBeTruthy(); // badge rendered in the row
  });

  it("edit form preloads the member's level — a 星站 member saved untouched stays 星站", async () => {
    const repos = setupRepos(new InMemoryAdapter());
    const gold = await repos.staff.create({ name: "金一", phone: "", notes: "", level: "gold" });
    const { view } = await renderManage(<ManageTab />, { repos });
    await waitForSync(() => view.getByTestId(`manage-staff-${gold.id}`));

    await fireEvent.press(view.getByTestId(`manage-staff-${gold.id}`)); // open edit
    await waitForSync(() => view.getByTestId("staff-name-input"));
    // save without touching the selector → preloaded 星站 persists (not reset to 普站)
    await fireEvent.press(view.getByTestId("staff-submit"));
    await waitForSync(() => view.getByText("金一"));
    expect((await repos.staff.getById(gold.id))?.level).toBe("gold");
  });

  it("edit form: changing the level persists via useUpdateStaff and updates the row badge", async () => {
    const repos = setupRepos(new InMemoryAdapter());
    const gold = await repos.staff.create({ name: "金二", phone: "", notes: "", level: "gold" });
    const { view } = await renderManage(<ManageTab />, { repos });
    await waitForSync(() => view.getByTestId(`manage-staff-${gold.id}`));
    expect(view.getByText("星站")).toBeTruthy(); // row badge before edit

    await fireEvent.press(view.getByTestId(`manage-staff-${gold.id}`)); // open edit
    await waitForSync(() => view.getByTestId("staff-name-input"));
    await fireEvent.press(view.getByTestId("staff-level-normal")); // 星站 → 普站
    await fireEvent.press(view.getByTestId("staff-submit"));

    // back to list: badge gone (普站), repo reflects the change
    await waitForSync(() => expect(() => view.getByText("星站")).toThrow());
    expect((await repos.staff.getById(gold.id))?.level).toBe("normal");
  });
});

describe("ManageTab — staff export (manage-export #03)", () => {
  it("shows 导入 left of 导出 on staff; restock/config have none", async () => {
    const { repos } = await seed();
    const { view } = await renderManage(<ManageTab />, { repos });
    await waitForSync(() => view.getByTestId("view-staff"));
    expect(view.getByTestId("staff-import")).toBeTruthy();
    expect(view.getByTestId("staff-export")).toBeTruthy();

    // 导入｜导出：serialized tree keeps import testID before export
    const tree = JSON.stringify(view.toJSON());
    expect(tree.indexOf("staff-import")).toBeGreaterThan(-1);
    expect(tree.indexOf("staff-import")).toBeLessThan(tree.indexOf("staff-export"));

    await fireEvent.press(view.getByTestId("staff-import"));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/import-form",
      params: { kind: "staff" },
    });

    await fireEvent.press(view.getByTestId("seg-restock"));
    await waitForSync(() => view.getByTestId("view-restock"));
    expect(view.queryByTestId("staff-export")).toBeNull();
    expect(view.queryByTestId("staff-import")).toBeNull();
    expect(view.queryByTestId("product-export")).toBeNull();

    await fireEvent.press(view.getByTestId("seg-config"));
    await waitForSync(() => view.getByTestId("config-price-input"));
    expect(view.queryByTestId("staff-export")).toBeNull();
    expect(view.queryByTestId("staff-import")).toBeNull();
    expect(view.queryByTestId("product-export")).toBeNull();
  });

  it("export job filename is 会员-YYYYMMDD.xlsx; build rows match current list (switch+search)", async () => {
    const { repos, staffId } = await seed(); // 张三
    await repos.staff.create({ name: "李四", phone: "139", notes: "n", level: "normal" });
    await repos.staff.void(staffId); // 张三 voided
    const { view } = await renderManage(<ManageTab />, { repos });
    await waitForSync(() => view.getByTestId("staff-export"));

    // default: only 李四 visible → export that set, no status column
    await fireEvent.press(view.getByTestId("staff-export"));
    await waitForSync(() => expect(mockRunExport).toHaveBeenCalled());
    const job1 = mockRunExport.mock.calls[0]![0]!;
    expect(job1.filename).toBe(staffExportFilename());
    expect(job1.encoding).toBe("base64");
    expect(job1.mimeType).toMatch(/spreadsheetml/);
    const rows1 = sheetFromBase64(await job1.build());
    expect(rows1[0]).toEqual(["姓名", "电话", "备注", "等级"]);
    expect(rows1.slice(1).map((r) => r[0])).toEqual(["李四"]);

    mockRunExport.mockClear();
    // include voided + search 张 → only 张三, with 状态
    await fireEvent(view.getByTestId("staff-include-voided"), "valueChange", true);
    await fireEvent.changeText(view.getByTestId("staff-search"), "张");
    await waitForSync(() => view.getByTestId(`manage-staff-${staffId}`));

    await fireEvent.press(view.getByTestId("staff-export"));
    await waitForSync(() => expect(mockRunExport).toHaveBeenCalled());
    const job2 = mockRunExport.mock.calls[0]![0]!;
    const rows2 = sheetFromBase64(await job2.build());
    expect(rows2[0]).toEqual(["姓名", "电话", "备注", "等级", "状态"]);
    expect(rows2.slice(1)).toEqual([["张三", "138", "", "普站", "已删除"]]);
  });

  it("disables 导出 while pending; toast.error on failure; cancel-style success does not toast", async () => {
    const { repos } = await seed();
    const { view } = await renderManage(<ManageTab />, { repos });
    await waitForSync(() => view.getByTestId("staff-export"));

    let resolveExport!: (uri: string) => void;
    mockRunExport.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          resolveExport = resolve;
        }),
    );

    await fireEvent.press(view.getByTestId("staff-export"));
    await waitForSync(() => {
      expect(view.getByTestId("staff-export").props.accessibilityState?.disabled).toBe(true);
    });

    resolveExport("file:///cache/out.xlsx");
    await waitForSync(() => {
      expect(view.getByTestId("staff-export").props.accessibilityState?.disabled).toBeFalsy();
    });
    expect(view.queryByTestId("toast")).toBeNull();

    mockRunExport.mockRejectedValueOnce(new Error("disk full"));
    await fireEvent.press(view.getByTestId("staff-export"));
    expect(await waitForSync(() => view.getByText("disk full"))).toBeTruthy();
    expect(view.getByTestId("toast")).toBeTruthy();
  });
});

describe("ManageTab — product export (manage-export #04)", () => {
  it("shows 导出 on product; restock/config have none", async () => {
    const { repos } = await seed();
    const { view } = await renderManage(<ManageTab />, { repos });

    await fireEvent.press(view.getByTestId("seg-product"));
    await waitForSync(() => view.getByTestId("view-product"));
    expect(view.getByTestId("product-export")).toBeTruthy();
    expect(view.getByText("导出")).toBeTruthy();

    await fireEvent.press(view.getByTestId("seg-restock"));
    await waitForSync(() => view.getByTestId("view-restock"));
    expect(view.queryByTestId("product-export")).toBeNull();

    await fireEvent.press(view.getByTestId("seg-config"));
    await waitForSync(() => view.getByTestId("config-price-input"));
    expect(view.queryByTestId("product-export")).toBeNull();
  });

  it("export job filename is 商品-YYYYMMDD.xlsx; build rows match current list (switch+search)", async () => {
    const { repos, colaId } = await seed(); // 可乐
    const sprite = await repos.products.create({
      title: "雪碧",
      purchase_price: cents(250),
      code: "S001",
      category: "饮料",
    });
    await repos.products.void(colaId); // 可乐 voided
    const { view } = await renderManage(<ManageTab />, { repos });
    await fireEvent.press(view.getByTestId("seg-product"));
    await waitForSync(() => view.getByTestId(`manage-product-${sprite.id}`));

    // default: only 雪碧 visible → export that set, no status column
    await fireEvent.press(view.getByTestId("product-export"));
    await waitForSync(() => expect(mockRunExport).toHaveBeenCalled());
    const job1 = mockRunExport.mock.calls[0]![0]!;
    expect(job1.filename).toBe(productExportFilename());
    expect(job1.encoding).toBe("base64");
    expect(job1.mimeType).toMatch(/spreadsheetml/);
    const rows1 = sheetFromBase64(await job1.build());
    expect(rows1[0]).toEqual(["名称", "单价"]);
    expect(rows1.slice(1)).toEqual([["雪碧", "2.50"]]);

    mockRunExport.mockClear();
    // include voided + search 可 → only 可乐, with 状态
    await fireEvent(view.getByTestId("product-include-voided"), "valueChange", true);
    await fireEvent.changeText(view.getByTestId("product-search"), "可");
    await waitForSync(() => view.getByTestId(`manage-product-${colaId}`));

    await fireEvent.press(view.getByTestId("product-export"));
    await waitForSync(() => expect(mockRunExport).toHaveBeenCalled());
    const job2 = mockRunExport.mock.calls[0]![0]!;
    const rows2 = sheetFromBase64(await job2.build());
    expect(rows2[0]).toEqual(["名称", "单价", "状态"]);
    expect(rows2.slice(1)).toEqual([["可乐", "3.00", "已删除"]]);
  });

  it("disables 导出 while pending; toast.error on failure; cancel-style success does not toast", async () => {
    const { repos } = await seed();
    const { view } = await renderManage(<ManageTab />, { repos });
    await fireEvent.press(view.getByTestId("seg-product"));
    await waitForSync(() => view.getByTestId("product-export"));

    let resolveExport!: (uri: string) => void;
    mockRunExport.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          resolveExport = resolve;
        }),
    );

    await fireEvent.press(view.getByTestId("product-export"));
    await waitForSync(() => {
      expect(view.getByTestId("product-export").props.accessibilityState?.disabled).toBe(true);
    });

    resolveExport("file:///cache/out.xlsx");
    await waitForSync(() => {
      expect(view.getByTestId("product-export").props.accessibilityState?.disabled).toBeFalsy();
    });
    expect(view.queryByTestId("toast")).toBeNull();

    mockRunExport.mockRejectedValueOnce(new Error("disk full"));
    await fireEvent.press(view.getByTestId("product-export"));
    expect(await waitForSync(() => view.getByText("disk full"))).toBeTruthy();
    expect(view.getByTestId("toast")).toBeTruthy();
  });
});

function sheetFromBase64(base64: string): unknown[][] {
  const wb = XLSX.read(base64, { type: "base64" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
}

