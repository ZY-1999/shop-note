import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { QueryClient } from "@tanstack/react-query";
import { fireEvent } from "@testing-library/react-native";

import { TopupForm } from "@/components/topup-form";
import { InMemoryAdapter } from "@/data/in-memory";
import { setupRepos, type Repos } from "@/data/composition";
import { cents } from "@/data/primitives";
import { renderWithProviders, type RenderWithProvidersResult } from "@/testing/render";
import { waitForSync, flushPending } from "@/testing/async";

/**
 * Spec #02 (topup-subpage) — the top-up form through the real data stack
 * (ADR-0006: InMemoryAdapter, no mocked Repos).
 *
 * MemberInfoHeader is mocked to a lightweight stub — it has its own dedicated
 * test suite (spec #01 `member-info-header.test.tsx`). Mocking it avoids a
 * well-characterized RNTL v14 + React 19 + React Query v5 renderer corruption
 * where MemberInfoHeader's two extra useQuery observers accumulate notifyManager
 * timers across varied interaction tests, eventually producing empty trees.
 *
 * Remaining tests (time defaults, router.back, header, useCreateTopup path,
 * picker interactions) live in `topup-form-picker.test.tsx` to stay under the
 * renderer's accumulation threshold.
 */
jest.mock("@/components/member-info-header", () => ({
  MemberInfoHeader: ({ staffId }: { staffId: string }) => {
    const React = jest.requireActual("react") as typeof import("react");
    const { View, Text } = jest.requireActual("react-native") as typeof import("react-native");
    return React.createElement(
      View,
      { testID: "member-info-header" },
      React.createElement(Text, null, `header-stub-${staffId}`),
    );
  },
}));

const mockBack = jest.fn<() => void>();
jest.mock("expo-router", () => ({
  router: { back: () => mockBack() },
}));

jest.mock("@expo/ui/community/datetime-picker", () => {
  const React = jest.requireActual("react") as typeof import("react");
  const { View, Text, Pressable } = jest.requireActual("react-native") as typeof import("react-native");
  return {
    __esModule: true,
    default: ({ value, testID, onValueChange }: any) =>
      React.createElement(
        View,
        { testID, onValueChange } as any,
        React.createElement(Text, null, value ? new Date(value).toISOString() : ""),
        React.createElement(
          Pressable,
          { testID: `${testID}-backdate`, onPress: () => onValueChange?.({}, new Date()) },
          React.createElement(Text, null, "backdate"),
        ),
      ),
  };
});

beforeEach(() => {
  mockBack.mockClear();
});

let activeQueryClient: QueryClient | null = null;

afterEach(() => {
  activeQueryClient?.clear();
  activeQueryClient = null;
});

async function renderForm(
  ui: ReactElement,
  opts?: { repos?: Repos },
): Promise<RenderWithProvidersResult> {
  const res = await renderWithProviders(ui, opts);
  activeQueryClient = res.queryClient;
  await flushPending();
  return res;
}

async function seed(): Promise<{ repos: Repos; staffId: string }> {
  const repos = setupRepos(new InMemoryAdapter());
  const staff = await repos.staff.create({ name: "张三", phone: "138", notes: "" });
  return { repos, staffId: staff.id };
}

describe("TopupForm — amount validation (spec #02 AC1)", () => {
  it("blocks submit when amount is empty and shows 就地提示", async () => {
    const { repos, staffId } = await seed();
    const { view } = await renderForm(<TopupForm staffId={staffId} />, { repos });
    fireEvent.press(view.getByTestId("topup-submit"));
    const error = await waitForSync(() => view.getByTestId("topup-error"));
    expect(error.props.children).toBe("请输入有效金额");
    expect((await repos.topups.list()).length).toBe(0);
  });

  it("blocks submit when amount is zero, negative, or non-numeric", async () => {
    const { repos, staffId } = await seed();
    const { view } = await renderForm(<TopupForm staffId={staffId} />, { repos });

    for (const val of ["0", "-5", "abc"]) {
      fireEvent.changeText(view.getByTestId("topup-amount"), val);
      await flushPending();
      fireEvent.press(view.getByTestId("topup-submit"));
      const error = await waitForSync(() => view.getByTestId("topup-error"));
      expect(error.props.children).toBe("请输入有效金额");
    }
    expect((await repos.topups.list()).length).toBe(0);
  });
});

describe("TopupForm — valid submit converts 元→分 and writes (spec #02 AC2 + AC6)", () => {
  it("converts yuan to cents via Math.round(yuan*100) and writes correct amount", async () => {
    const { repos, staffId } = await seed();
    const { view } = await renderForm(<TopupForm staffId={staffId} />, { repos });
    fireEvent.changeText(view.getByTestId("topup-amount"), "12.34");
    await flushPending();
    fireEvent.press(view.getByTestId("topup-submit"));
    await waitForSync(async () => expect((await repos.topups.list()).length).toBe(1));
    const [posted] = await repos.topups.list();
    expect(posted.amount).toBe(cents(1234));
    expect(posted.staff_id).toBe(staffId);
  });

  it("rounds fractional cents correctly + carries note + no stock record", async () => {
    const { repos, staffId } = await seed();
    const { view } = await renderForm(<TopupForm staffId={staffId} />, { repos });
    fireEvent.changeText(view.getByTestId("topup-amount"), "0.1");
    fireEvent.changeText(view.getByTestId("topup-note"), "test");
    await flushPending();
    fireEvent.press(view.getByTestId("topup-submit"));
    await waitForSync(async () => expect((await repos.topups.list()).length).toBe(1));
    const [posted] = await repos.topups.list();
    expect(posted.amount).toBe(cents(10));
    expect(posted.note).toBe("test");
    expect((await repos.stockRecords.list()).length).toBe(0);
  });
});
