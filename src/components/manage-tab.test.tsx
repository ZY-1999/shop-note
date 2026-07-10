import type { ReactElement } from "react";
import { afterEach, describe, expect, it, jest } from "@jest/globals";
import type { QueryClient } from "@tanstack/react-query";
import { fireEvent } from "@testing-library/react-native";
import { Text, View } from "react-native";

import { ManageTab } from "@/components/manage-tab";
import { useBalance } from "@/hooks/reads";
import { InMemoryAdapter } from "@/data/in-memory";
import { setupRepos, type Repos } from "@/data/composition";
import { cents } from "@/data/primitives";
import { renderWithProviders, type RenderWithProvidersResult } from "@/testing/render";
import { flushPending, waitForSync } from "@/testing/async";

/**
 * Spec #09 (manage-tab) — staff & product CRUD, through the real data stack
 * (ADR-0006: InMemoryAdapter, no mocked Repos). Async mechanics (waitForSync /
 * flushPending / QueryClient clear) live in [testing/async.ts](../testing/async.ts).
 */

let activeQueryClient: QueryClient | null = null;

afterEach(() => {
  // Same isolation posture as the #07/#08 suites: clear() cancels the
  // mutation's invalidated refetch queries so nothing fires on the next test's
  // tree. (Deliberately NOT async — awaiting flushPending here yields inside the
  // test's act scope, letting React Query's notifyManager enter a second act and
  // produce "overlapping act() calls", which corrupts the next test's render.)
  activeQueryClient?.clear();
  activeQueryClient = null;
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

/** Join MoneyText's two-children output into one matchable string. */
function money(el: { props: { children?: unknown } }): string {
  const c = el.props.children;
  return Array.isArray(c) ? (c as string[]).join("") : String(c ?? "");
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
    await waitForSync(() => view.getByText("已删除"));

    const voided = await repos.staff.getById(staffId);
    expect(voided?.voided_at).not.toBeNull();
    // the repo's active reads exclude voided → drops from 记账 selectors
    const active = await repos.staff.list();
    expect(active.find((s) => s.id === staffId)).toBeUndefined();

    // restore — clears voided_at, reappears in selectors
    await fireEvent.press(view.getByTestId(`staff-restore-${staffId}`));
    await waitForSync(() => expect(() => view.getByText("已删除")).toThrow());

    const restored = await repos.staff.getById(staffId);
    expect(restored?.voided_at).toBeNull();
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
 * AC4 — a product price edit revalues every derived amount on the next read.
 * Uses a test-only <InventoryReader> mounted under the same queryClient as the
 * ManageTab, so the cross-entity invalidation (qk.inventory from useUpdateProduct)
 * is observable: edit the price, and the open balance refetches at the new price
 * with no manual recompute. Mirrors #07/#08's cross-view-refresh posture.
 */
function InventoryReader({ staffId, productId }: { staffId: string; productId: string }) {
  const bal = useBalance(staffId, productId);
  return (
    <View testID="inventory-reader">
      <Text>{bal.data ? `qty:${bal.data.qty}` : "none"}</Text>
    </View>
  );
}

describe("ManageTab — product price edit revalues inventory (spec #09 AC4)", () => {
  it("editing a product's price reflows the open balance on the next read", async () => {
    const { repos, staffId, colaId } = await seed(); // 可乐 @ 300¢
    // post cola×4 so there's a balance to revalue (qty 4, cost 1200¢ at 300¢)
    await repos.stockRecords.create({
      staff_id: staffId,
      direction: "in",
      items: [{ product_id: colaId, qty: 4 }],
    });
    const { view } = await renderManage(
      <View>
        <ManageTab />
        <InventoryReader staffId={staffId} productId={colaId} />
      </View>,
      { repos },
    );
    await fireEvent.press(view.getByTestId("seg-product"));
    await waitForSync(() => view.getByTestId(`manage-product-${colaId}`));
    await waitForSync(() => view.getByText("qty:4")); // balance loaded: 4 units

    // open the product's edit form via row tap, change its price 300¢ → 700¢
    await fireEvent.press(view.getByTestId(`manage-product-${colaId}`));
    await waitForSync(() => view.getByTestId("product-price-input"));
    await fireEvent.changeText(view.getByTestId("product-price-input"), "7");
    await fireEvent.press(view.getByTestId("product-submit"));

    // useUpdateProduct invalidated qk.inventory → balance refetches at the new price
    await waitForSync(async () => {
      const p = await repos.products.getById(colaId);
      expect(p?.purchase_price).toBe(cents(700));
    });
    // qty stays 4 (a price change revalues cost, not quantity)
    await waitForSync(() => expect(view.getByText("qty:4")).toBeTruthy());
  });
});

describe("ManageTab — product void/restore + snapshot preservation (spec #09 AC5)", () => {
  it("voids a product then restores it; record snapshots stay intact", async () => {
    const { repos, staffId, colaId } = await seed();
    // post a record so there's a snapshot to preserve across the void
    const { record } = await repos.stockRecords.create({
      staff_id: staffId,
      direction: "in",
      items: [{ product_id: colaId, qty: 2 }],
    });

    const { view } = await renderManage(<ManageTab />, { repos });
    await fireEvent.press(view.getByTestId("seg-product"));
    await waitForSync(() => view.getByTestId(`manage-product-${colaId}`));

    // void — soft-delete; drops from active product reads (pickers)
    await fireEvent.press(view.getByTestId(`product-void-${colaId}`));
    await waitForSync(() => view.getByText("已删除"));
    const voided = await repos.products.getById(colaId);
    expect(voided?.voided_at).not.toBeNull();
    const active = await repos.products.list();
    expect(active.find((p) => p.id === colaId)).toBeUndefined();

    // the record's snapshot is untouched (title/price frozen at posting time)
    const detail = await repos.stockRecords.getById(record.id);
    expect(detail?.items[0].title).toBe("可乐");
    expect(detail?.items[0].unit_price).toBe(cents(300));

    // restore — re-selectable
    await fireEvent.press(view.getByTestId(`product-restore-${colaId}`));
    await waitForSync(() => expect(() => view.getByText("已删除")).toThrow());
    const restored = await repos.products.getById(colaId);
    expect(restored?.voided_at).toBeNull();
  });
});

