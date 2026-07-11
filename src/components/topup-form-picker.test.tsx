import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { QueryClient } from "@tanstack/react-query";
import { fireEvent } from "@testing-library/react-native";
import { Platform } from "react-native";

import { TopupForm } from "@/components/topup-form";
import { InMemoryAdapter } from "@/data/in-memory";
import { setupRepos, type Repos } from "@/data/composition";
import { renderWithProviders, type RenderWithProvidersResult } from "@/testing/render";
import { waitForSync, flushPending } from "@/testing/async";

/**
 * Spec #02 remaining tests — time defaults, header, Android dialog contract,
 * iOS backdate. Split from topup-form.test.tsx to stay under the RNTL renderer's
 * test-accumulation threshold. The iOS backdate test is placed LAST because its
 * picker onValueChange fireEvent always corrupts the renderer for subsequent tests.
 *
 * MemberInfoHeader is mocked (same rationale as topup-form.test.tsx).
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

jest.mock("expo-router", () => ({
  router: { back: () => mockBack() },
}));
const mockBack = jest.fn<() => void>();

const mockBackdateMs = new Date("2020-01-01T00:00:00Z").getTime();
jest.mock("@expo/ui/community/datetime-picker", () => {
  const React = jest.requireActual("react") as typeof import("react");
  const { View, Text, Pressable } = jest.requireActual("react-native") as typeof import("react-native");
  return {
    __esModule: true,
    default: ({
      value,
      testID,
      onValueChange,
      onDismiss,
    }: {
      value: Date;
      testID: string;
      onValueChange?: (e: unknown, date: Date) => void;
      onDismiss?: () => void;
    }) =>
      React.createElement(
        View,
        { testID, onValueChange, onDismiss } as any,
        React.createElement(Text, null, value ? new Date(value).toISOString() : ""),
        React.createElement(
          Pressable,
          { testID: `${testID}-backdate`, onPress: () => onValueChange?.({}, new Date(mockBackdateMs)) },
          React.createElement(Text, null, "backdate"),
        ),
      ),
  };
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

describe("TopupForm — time defaults to now (spec #02 AC3)", () => {
  it("defaults time to ~now on submit", async () => {
    const { repos, staffId } = await seed();
    const { view } = await renderForm(<TopupForm staffId={staffId} />, { repos });
    fireEvent.changeText(view.getByTestId("topup-amount"), "1");
    await flushPending();
    fireEvent.press(view.getByTestId("topup-submit"));
    await waitForSync(async () => expect((await repos.topups.list()).length).toBe(1));
    const [posted] = await repos.topups.list();
    expect(posted.timestamp).toBeGreaterThan(Date.now() - 5000);
  });
});

describe("TopupForm — header renders MemberInfoHeader (spec #02 AC5)", () => {
  it("renders the member-info header component, no direction word", async () => {
    const { repos, staffId } = await seed();
    const { view } = await renderForm(<TopupForm staffId={staffId} />, { repos });
    expect(view.getByTestId("member-info-header")).toBeTruthy();
    expect(view.queryByText("入库")).toBeNull();
    expect(view.queryByText("出库")).toBeNull();
  });
});

describe("TopupForm — submit success triggers router.back (spec #02 AC4)", () => {
  it("navigates back after a successful submit", async () => {
    const { repos, staffId } = await seed();
    const { view } = await renderForm(<TopupForm staffId={staffId} />, { repos });
    fireEvent.changeText(view.getByTestId("topup-amount"), "5");
    await flushPending();
    fireEvent.press(view.getByTestId("topup-submit"));
    await waitForSync(() => expect(mockBack).toHaveBeenCalled());
  });
});

describe("TopupForm — Android dialog picker contract (spec #02, mirrors RecordForm)", () => {
  const originalOS = Platform.OS;
  beforeEach(() => {
    Platform.OS = "android";
  });
  afterEach(() => {
    Platform.OS = originalOS;
  });

  it("mounts the picker on tap, confirms via onValueChange, and unmounts", async () => {
    const { repos, staffId } = await seed();
    const { view } = await renderForm(<TopupForm staffId={staffId} />, { repos });

    expect(() => view.getByTestId("topup-time-picker")).toThrow();
    await fireEvent.press(view.getByTestId("topup-time"));
    const picker = view.getByTestId("topup-time-picker");
    await fireEvent(
      picker,
      "onValueChange",
      { nativeEvent: { timestamp: mockBackdateMs, utcOffset: 0 } },
      new Date(mockBackdateMs),
    );
    expect(() => view.getByTestId("topup-time-picker")).toThrow();
    await flushPending();
    fireEvent.changeText(view.getByTestId("topup-amount"), "1");
    await flushPending();
    fireEvent.press(view.getByTestId("topup-submit"));
    await waitForSync(async () => expect((await repos.topups.list()).length).toBe(1));
    const posted = (await repos.topups.list())[0];
    expect(posted.timestamp).toBe(mockBackdateMs);
  });

  it("cancel via onDismiss unmounts without writing a new time", async () => {
    const { repos, staffId } = await seed();
    const { view } = await renderForm(<TopupForm staffId={staffId} />, { repos });

    await fireEvent.press(view.getByTestId("topup-time"));
    await fireEvent(view.getByTestId("topup-time-picker"), "onDismiss");
    expect(() => view.getByTestId("topup-time-picker")).toThrow();
    await flushPending();
    fireEvent.changeText(view.getByTestId("topup-amount"), "1");
    await flushPending();
    fireEvent.press(view.getByTestId("topup-submit"));
    await waitForSync(async () => expect((await repos.topups.list()).length).toBe(1));
    const posted = (await repos.topups.list())[0];
    expect(posted.timestamp).toBeGreaterThan(Date.now() - 5000);
  });
});

describe("TopupForm — time backdatable via iOS inline picker (spec #02 AC3)", () => {
  // Placed LAST: the picker's onValueChange fireEvent corrupts the RNTL renderer
  // for subsequent tests (RNTL v14 + React 19 + React Query v5 quirk). Since this
  // is the final test in the file, the corruption has no victim.
  it("lets the operator backdate the time via the iOS inline picker", async () => {
    const { repos, staffId } = await seed();
    const { view } = await renderForm(<TopupForm staffId={staffId} />, { repos });

    fireEvent.changeText(view.getByTestId("topup-amount"), "1");
    fireEvent.press(view.getByTestId("topup-time-backdate"));
    await flushPending();
    fireEvent.press(view.getByTestId("topup-submit"));

    await waitForSync(async () => expect((await repos.topups.list()).length).toBe(1));
    const [posted] = await repos.topups.list();
    expect(posted.timestamp).toBe(mockBackdateMs);
  });
});
