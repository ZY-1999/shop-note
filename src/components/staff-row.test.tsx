import { afterEach, describe, expect, it, jest } from "@jest/globals";
import type { QueryClient } from "@tanstack/react-query";
import { fireEvent } from "@testing-library/react-native";

import { StaffRow } from "@/components/staff-row";
import { InMemoryAdapter } from "@/data/in-memory";
import { setupRepos, type Repos } from "@/data/composition";
import { ADMIN_STAFF_ID } from "@/data/staff";
import { cents } from "@/data/primitives";
import { renderWithProviders, type RenderWithProvidersResult } from "@/testing/render";
import { flushPending, waitForSync } from "@/testing/async";

/**
 * StaffRow (stock-balance-refactor balance-domain): reads `useMemberBalance`
 * per-staff and renders 余额 + 欠款 badge + a [充值] affordance that posts a
 * top-up through `useCreateTopup`. Out / row-tap stay delegated callbacks.
 * Verified through the real data stack (ADR-0006: InMemoryAdapter, no mocked Repos).
 */

let activeQueryClient: QueryClient | null = null;
afterEach(() => {
  activeQueryClient?.clear();
  activeQueryClient = null;
});

async function renderRow(
  repos: Repos,
  staffId: string,
): Promise<RenderWithProvidersResult> {
  const res = await renderWithProviders(<StaffRow staff={{ id: staffId, name: "张三", phone: "", notes: "", level: "normal", voided_at: null, created_at: 0, updated_at: 0 } as never} onOut={jest.fn()} onOpen={jest.fn()} />, { repos });
  activeQueryClient = res.queryClient;
  await flushPending();
  return res;
}

describe("StaffRow — 余额 + 充值 (balance-domain)", () => {
  it("renders the member's derived 余额 (Σ topup − Σ out)", async () => {
    const repos = setupRepos(new InMemoryAdapter());
    const member = await repos.staff.create({ name: "张三", phone: "", notes: "" });
    await repos.topups.create({ staff_id: member.id, amount: cents(10000) }); // ¥100

    const { view } = await renderRow(repos, member.id);
    await waitForSync(() => view.getByTestId(`balance-${member.id}`));
    // 余额 renders via MoneyText → "¥100.00"
    expect(view.getByText("¥100.00")).toBeTruthy();
    expect(view.queryByText("欠款")).toBeNull(); // not negative
  });

  it("shows a 欠款 marker when the balance is negative (out > topup)", async () => {
    const repos = setupRepos(new InMemoryAdapter());
    const product = await repos.products.create({ title: "可乐", purchase_price: cents(500) });
    const member = await repos.staff.create({ name: "张三", phone: "", notes: "" });
    await repos.topups.create({ staff_id: member.id, amount: cents(1000) }); // ¥10.00
    await repos.stockRecords.create({
      staff_id: member.id, direction: "out", items: [{ product_id: product.id, qty: 4 }], // ¥20.00
    });

    const { view } = await renderRow(repos, member.id);
    // negative balance → MoneyText renders 「欠款 ¥10.00」 in danger (−¥10.00 欠款)
    await waitForSync(() => view.getByText(/欠款 ¥10\.00/));
  });

  it("充值 form: amount + submit → balance increases via useCreateTopup", async () => {
    const repos = setupRepos(new InMemoryAdapter());
    const member = await repos.staff.create({ name: "张三", phone: "", notes: "" });

    const { view } = await renderRow(repos, member.id);
    await waitForSync(() => view.getByTestId(`topup-${member.id}`));

    await fireEvent.press(view.getByTestId(`topup-${member.id}`));
    await waitForSync(() => view.getByTestId("topup-amount"));
    await fireEvent.changeText(view.getByTestId("topup-amount"), "50");
    await fireEvent.press(view.getByTestId("topup-submit"));

    // balance refetches via qk.balance invalidation → ¥50.00
    await waitForSync(() => view.getByText("¥50.00"));
    const [topup] = await repos.topups.list({ staff_id: member.id });
    expect(topup.amount).toBe(cents(5000));
  });

  it("充值 blocks on an invalid amount", async () => {
    const repos = setupRepos(new InMemoryAdapter());
    const member = await repos.staff.create({ name: "张三", phone: "", notes: "" });

    const { view } = await renderRow(repos, member.id);
    await fireEvent.press(view.getByTestId(`topup-${member.id}`));
    await fireEvent.changeText(view.getByTestId("topup-amount"), "abc");
    await fireEvent.press(view.getByTestId("topup-submit"));
    expect((await waitForSync(() => view.getByTestId("topup-error"))).props.children).toBe("请输入有效金额");
  });
});
