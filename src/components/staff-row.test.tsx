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
 * StaffRow (topup-subpage spec #03): the member-info display (name + tier badge
 * + 余额 + 欠款 marker) is now the shared `<MemberInfoHeader>`, and [充值] is a
 * navigation callback (`onTopup`) mirroring [出库] — the inline top-up form is
 * gone. Out / row-tap stay delegated callbacks. Verified through the real data
 * stack (ADR-0006: InMemoryAdapter, no mocked Repos).
 */

let activeQueryClient: QueryClient | null = null;
afterEach(() => {
  activeQueryClient?.clear();
  activeQueryClient = null;
});

async function renderRow(
  repos: Repos,
  staffId: string,
  overrides: { onTopup?: (id: string) => void } = {},
): Promise<RenderWithProvidersResult> {
  const res = await renderWithProviders(
    <StaffRow
      staff={{ id: staffId, name: "张三", phone: "", notes: "", level: "normal", voided_at: null, created_at: 0, updated_at: 0 } as never}
      onTopup={overrides.onTopup ?? jest.fn()}
      onOut={jest.fn()}
      onOpen={jest.fn()}
    />,
    { repos },
  );
  activeQueryClient = res.queryClient;
  await flushPending();
  return res;
}

describe("StaffRow — 余额展示 + 充值导航 (balance-domain)", () => {
  it("renders the member's derived 余额 via MemberInfoHeader (Σ topup − Σ out)", async () => {
    const repos = setupRepos(new InMemoryAdapter());
    const member = await repos.staff.create({ name: "张三", phone: "", notes: "" });
    await repos.topups.create({ staff_id: member.id, amount: cents(10000) }); // ¥100

    const { view } = await renderRow(repos, member.id);
    // MemberInfoHeader renders the balance via MoneyText → "¥100.00"
    await waitForSync(() => view.getByText("¥100.00"));
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

  it("[充值] press delegates to onTopup(staffId) — navigation, not an inline form", async () => {
    const repos = setupRepos(new InMemoryAdapter());
    const member = await repos.staff.create({ name: "张三", phone: "", notes: "" });
    const onTopup = jest.fn();

    const { view } = await renderRow(repos, member.id, { onTopup });
    await waitForSync(() => view.getByTestId(`topup-${member.id}`));

    await fireEvent.press(view.getByTestId(`topup-${member.id}`));
    expect(onTopup).toHaveBeenCalledWith(member.id);
    // the inline top-up form is gone (spec 03): [充值] navigates now, never expands
    expect(view.queryByTestId(`topup-form-${member.id}`)).toBeNull();
    expect(view.queryByTestId("topup-amount")).toBeNull();
  });
});
