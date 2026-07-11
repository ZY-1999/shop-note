import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import type { QueryClient } from "@tanstack/react-query";
import { fireEvent } from "@testing-library/react-native";

import { formatDateTimeSeconds } from "@/components/date-format";
import { TopupDetail } from "@/components/topup-detail";
import { InMemoryAdapter } from "@/data/in-memory";
import { setupRepos, type Repos } from "@/data/composition";
import { cents } from "@/data/primitives";
import { renderWithProviders, type RenderWithProvidersResult } from "@/testing/render";
import { flushPending, waitForSync } from "@/testing/async";

let activeQueryClient: QueryClient | null = null;

afterEach(() => {
  activeQueryClient?.clear();
  activeQueryClient = null;
});

async function renderDetail(
  ui: ReactElement,
  opts?: { repos?: Repos },
): Promise<RenderWithProvidersResult> {
  const res = await renderWithProviders(ui, opts);
  activeQueryClient = res.queryClient;
  await flushPending();
  return res;
}

function money(el: { props: { children?: unknown } }): string {
  const c = el.props.children;
  return Array.isArray(c) ? (c as string[]).join("") : String(c ?? "");
}

async function seedTopup(opts?: { note?: string | null; amount?: number }) {
  const repos = setupRepos(new InMemoryAdapter());
  const staff = await repos.staff.create({ name: "张三", phone: "138", notes: "" });
  const note = opts && "note" in opts ? (opts.note ?? null) : "首充";
  const topup = await repos.topups.create({
    staff_id: staff.id,
    amount: cents(opts?.amount ?? 10000),
    note,
    timestamp: new Date(2026, 5, 10, 9, 15, 30).getTime(),
  });
  return { repos, staffId: staff.id, topupId: topup.id };
}

describe("TopupDetail — display", () => {
  it("shows member name, amount, second-precision time, and note", async () => {
    const { repos, topupId } = await seedTopup();
    const { view } = await renderDetail(<TopupDetail topupId={topupId} />, { repos });

    await waitForSync(() => view.getByText("张三"));
    expect(view.getByText("充值")).toBeTruthy();
    expect(view.getByText(formatDateTimeSeconds(new Date(2026, 5, 10, 9, 15, 30).getTime()))).toBeTruthy();
    expect(money(view.getByTestId("topup-detail-amount"))).toBe("¥100.00");
    expect(view.getByText("首充")).toBeTruthy();
  });

  it("shows — when note is empty", async () => {
    const { repos, topupId } = await seedTopup({ note: null });
    const { view } = await renderDetail(<TopupDetail topupId={topupId} />, { repos });
    await waitForSync(() => view.getByTestId("topup-detail-note"));
    expect(view.getByTestId("topup-detail-note").props.children).toBe("—");
  });
});

describe("TopupDetail — void", () => {
  it("voiding recovers member balance and shows 已作废", async () => {
    const { repos, staffId, topupId } = await seedTopup({ amount: 10000 });
    const product = await repos.products.create({ title: "可乐", purchase_price: cents(300), category: "饮料" });
    await repos.stockRecords.create({
      staff_id: staffId,
      direction: "out",
      items: [{ product_id: product.id, qty: 10 }],
    });

    const before = await repos.memberBalance.balance(staffId);
    expect(before.amount).toBe(7000);

    const { view } = await renderDetail(<TopupDetail topupId={topupId} />, { repos });
    await waitForSync(() => view.getByText("张三"));

    await fireEvent.press(view.getByTestId("void"));
    await fireEvent.press(view.getByTestId("void-confirm"));
    await waitForSync(() => view.getByText("已作废"));
    expect(() => view.getByTestId("void")).toThrow();

    const after = await repos.memberBalance.balance(staffId);
    expect(after.amount).toBe(-3000);
  });

  it("opens a voided topup as read-only with 已作废", async () => {
    const { repos, topupId } = await seedTopup();
    await repos.topups.void(topupId);

    const { view } = await renderDetail(<TopupDetail topupId={topupId} />, { repos });
    await waitForSync(() => view.getByText("已作废"));
    expect(() => view.getByTestId("void")).toThrow();
  });
});
