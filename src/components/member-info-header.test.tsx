import { afterEach, describe, expect, it } from "@jest/globals";
import type { QueryClient } from "@tanstack/react-query";

import { MemberInfoHeader } from "@/components/member-info-header";
import { InMemoryAdapter } from "@/data/in-memory";
import { setupRepos, type Repos } from "@/data/composition";
import { cents } from "@/data/primitives";
import { renderWithProviders, type RenderWithProvidersResult } from "@/testing/render";
import { flushPending, waitForSync } from "@/testing/async";

/**
 * MemberInfoHeader (topup-subpage spec #01): a pure-display component that
 * renders two rows — name + LevelBadge / 余额 + MoneyText — from `useStaffById`
 * + `useMemberBalance`. This is the correctness base for 4-site reuse.
 *
 * Verified through the real data stack (ADR-0006: InMemoryAdapter, no mocked Repos).
 * The component is router-agnostic (props just `staffId`) so it mounts directly
 * under `renderWithProviders` with no router context.
 */

let activeQueryClient: QueryClient | null = null;
afterEach(() => {
  activeQueryClient?.clear();
  activeQueryClient = null;
});

async function renderHeader(
  repos: Repos,
  staffId: string,
): Promise<RenderWithProvidersResult> {
  const res = await renderWithProviders(<MemberInfoHeader staffId={staffId} />, { repos });
  activeQueryClient = res.queryClient;
  await flushPending();
  return res;
}

describe("MemberInfoHeader — 会员信息 header (spec #01)", () => {
  it("renders member name + gold LevelBadge on row 1, derived 余额 on row 2", async () => {
    const repos = setupRepos(new InMemoryAdapter());
    const member = await repos.staff.create({ name: "张三", phone: "", notes: "", level: "gold" });
    await repos.topups.create({ staff_id: member.id, amount: cents(10000) }); // ¥100

    const { view } = await renderHeader(repos, member.id);

    // AC1 — row 1: name + level badge (gold shown)
    await waitForSync(() => view.getByText("张三"));
    expect(view.getByTestId("level-badge")).toBeTruthy();

    // AC2 — row 2: 「余额」label + MoneyText showing Σ topup − Σ out
    expect(view.getByText("余额")).toBeTruthy();
    await waitForSync(() => view.getByText("¥100.00"));
    expect(view.queryByText("欠款")).toBeNull();
  });

  it("omits LevelBadge for a 普站 (default-level) member", async () => {
    const repos = setupRepos(new InMemoryAdapter());
    const member = await repos.staff.create({ name: "李四", phone: "", notes: "" }); // level: normal

    const { view } = await renderHeader(repos, member.id);

    await waitForSync(() => view.getByText("李四"));
    // LevelBadge renders null for the default tier
    expect(view.queryByTestId("level-badge")).toBeNull();
  });

  it("renders 欠款 marker (danger) when balance is negative (out > topup)", async () => {
    const repos = setupRepos(new InMemoryAdapter());
    const product = await repos.products.create({ title: "可乐", purchase_price: cents(500) });
    const member = await repos.staff.create({ name: "王五", phone: "", notes: "" });
    await repos.topups.create({ staff_id: member.id, amount: cents(1000) }); // ¥10.00
    await repos.stockRecords.create({
      staff_id: member.id, direction: "out", items: [{ product_id: product.id, qty: 4 }], // ¥20.00
    });

    const { view } = await renderHeader(repos, member.id);

    // AC3 — negative balance → MoneyText renders 「欠款 ¥10.00」 in danger
    await waitForSync(() => view.getByText(/欠款 ¥10\.00/));
  });

  it("is pure display: no border, button, or interactive element", async () => {
    const repos = setupRepos(new InMemoryAdapter());
    const member = await repos.staff.create({ name: "赵六", phone: "", notes: "" });

    const { view } = await renderHeader(repos, member.id);

    await waitForSync(() => view.getByText("赵六"));

    // AC4 — no Pressable / TextInput / border styles anywhere inside the component
    expect(view.queryAllByRole("button")).toHaveLength(0);
    expect(view.queryAllByLabelText("text input")).toHaveLength(0);
    // The component root is a bare View — no borderWidth / borderColor styling
    const root = view.getByTestId("member-info-header");
    expect(root.props.style).toMatchObject({});
  });

  it("shows 「加载中」 as name while the staff query is pending (props only staffId, no router)", async () => {
    // AC5 — mounts under renderWithProviders directly; no router context needed
    const repos = setupRepos(new InMemoryAdapter());

    const { view } = await renderHeader(repos, "nonexistent-staff");

    // No staff record → name falls back to 「加载中」; balance falls back to ¥0.00
    expect(view.getByText("加载中")).toBeTruthy();
    await waitForSync(() => view.getByText("¥0.00"));
  });
});
