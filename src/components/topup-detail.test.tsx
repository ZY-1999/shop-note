import { afterEach, describe, expect, it } from "@jest/globals";
import type { QueryClient } from "@tanstack/react-query";
import { fireEvent } from "@testing-library/react-native";
import type { ReactElement } from "react";

import { formatDateTimeSeconds } from "@/components/date-format";
import { TopupDetail } from "@/components/topup-detail";
import { setupRepos, type Repos } from "@/data/composition";
import { InMemoryAdapter } from "@/data/in-memory";
import { cents } from "@/data/primitives";
import { flushPending, waitForSync } from "@/testing/async";
import {
  renderWithProviders,
  type RenderWithProvidersResult,
} from "@/testing/render";

/**
 * TopupDetail — look-back / void surface. Header uses prefixed labels
 * (类型：充值 / 会员：… / 时间：… / 金额：). No edit — void and re-enter.
 */

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
  const staff = await repos.staff.create({
    name: "张三",
    phone: "138",
    notes: "",
  });
  // create() takes `string | undefined`; null/empty both render as "—" in the detail.
  const note =
    opts && "note" in opts
      ? opts.note == null || opts.note === ""
        ? undefined
        : opts.note
      : "首充";
  const topup = await repos.topups.create({
    staff_id: staff.id,
    amount: cents(opts?.amount ?? 10000),
    note,
    timestamp: new Date(2026, 5, 10, 9, 15, 30).getTime(),
  });
  return { repos, staffId: staff.id, topupId: topup.id };
}

describe("TopupDetail — display", () => {
  it("shows prefixed type/member/time, amount, and note", async () => {
    const { repos, topupId } = await seedTopup();
    const { view } = await renderDetail(<TopupDetail topupId={topupId} />, {
      repos,
    });

    await waitForSync(() => view.getByText("会员：张三"));
    expect(view.getByText("类型：充值")).toBeTruthy();
    expect(
      view.getByText(
        `时间：${formatDateTimeSeconds(new Date(2026, 5, 10, 9, 15, 30).getTime())}`,
      ),
    ).toBeTruthy();
    expect(view.getByText("金额：")).toBeTruthy();
    expect(money(view.getByTestId("topup-detail-amount"))).toBe("¥100.00");
    expect(view.getByText("首充")).toBeTruthy();
  });

  it("shows — when note is empty", async () => {
    const { repos, topupId } = await seedTopup({ note: null });
    const { view } = await renderDetail(<TopupDetail topupId={topupId} />, {
      repos,
    });
    await waitForSync(() => view.getByTestId("topup-detail-note"));
    expect(view.getByTestId("topup-detail-note").props.children).toBe("—");
  });
});

describe("TopupDetail — void", () => {
  it("voiding recovers member balance and shows 已作废", async () => {
    const { repos, staffId, topupId } = await seedTopup({ amount: 10000 });
    const product = await repos.products.create({
      title: "可乐",
      purchase_price: cents(300),
      category: "饮料",
    });
    await repos.stockRecords.create({
      staff_id: staffId,
      direction: "out",
      items: [{ product_id: product.id, qty: 10 }],
    });

    const before = await repos.memberBalance.balance(staffId);
    expect(before.amount).toBe(7000);

    const { view } = await renderDetail(<TopupDetail topupId={topupId} />, {
      repos,
    });
    await waitForSync(() => view.getByText("会员：张三"));

    await fireEvent.press(view.getByTestId("void"));
    await fireEvent.press(view.getByTestId("void-confirm"));
    await waitForSync(() => view.getByText("已作废"));
    expect(() => view.getByTestId("void")).toThrow();

    const after = await repos.memberBalance.balance(staffId);
    expect(after.amount).toBe(-3000);
  });

  it("cancel at the confirm step does not void", async () => {
    const { repos, topupId } = await seedTopup();
    const { view } = await renderDetail(<TopupDetail topupId={topupId} />, {
      repos,
    });
    await waitForSync(() => view.getByText("会员：张三"));

    await fireEvent.press(view.getByTestId("void"));
    await fireEvent.press(view.getByTestId("void-cancel"));

    expect(view.getByTestId("void")).toBeTruthy();
    expect(view.queryByText("已作废")).toBeNull();
    const detail = await repos.topups.getById(topupId);
    expect(detail?.voided_at).toBeNull();
  });

  it("opens a voided topup as read-only with 已作废", async () => {
    const { repos, topupId } = await seedTopup();
    await repos.topups.void(topupId);

    const { view } = await renderDetail(<TopupDetail topupId={topupId} />, {
      repos,
    });
    await waitForSync(() => view.getByText("已作废"));
    expect(() => view.getByTestId("void")).toThrow();
  });
});
