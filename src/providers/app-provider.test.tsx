import { describe, expect, it, jest, beforeEach } from "@jest/globals";
import { Text } from "react-native";
import { fireEvent, render } from "@testing-library/react-native";

/**
 * Spec #04 (production-app-shell) — the boot/error/retry path of AppProvider,
 * the production composition root.
 *
 * `ExpoSqliteAdapter.open` is mocked so the error path is RNTL-testable without
 * a device. The device-only ACs (boot-to-记账, splash coordination timing,
 * per-tab stack navigation) are verified on-device, not here — this test covers
 * the no-crash error + recovery contract (story 36 / AC3) that IS unit-provable.
 */
// Must be `mock`-prefixed: jest.mock() factories can only reference out-of-scope
// variables whose name starts with `mock` (case-insensitive). Typed as a function
// returning a Promise so mockRejectedValueOnce / mockResolvedValueOnce type-check.
const mockOpen = jest.fn<(name: string) => Promise<unknown>>();
jest.mock("@/data/expo-sqlite", () => ({
  ExpoSqliteAdapter: {
    // AppProvider only calls `.open(name)` and treats rejection as the error
    // state. The resolved value is handed to setupRepos (pure construction — it
    // never calls the adapter eagerly), so a bare `{}` suffices as the stub.
    open: (name: string) => mockOpen(name),
  },
}));

import { AppProvider } from "@/providers/app-provider";

function Child() {
  return <Text>app-content</Text>;
}

describe("AppProvider — boot error + retry (spec #04 AC3)", () => {
  beforeEach(() => {
    mockOpen.mockReset();
  });

  it("open rejecting renders an error screen with a 重试 control (no crash)", async () => {
    mockOpen.mockRejectedValueOnce(new Error("boom"));
    const view = await render(<AppProvider><Child /></AppProvider>);

    expect(await view.findByText("重试")).toBeTruthy();
    // The app content is NOT rendered while in the error state.
    expect(view.queryByText("app-content")).toBeNull();
  });

  it("pressing 重试 re-attempts open and recovers into the app on success", async () => {
    // First open fails, the retry succeeds.
    mockOpen.mockRejectedValueOnce(new Error("boom"));
    mockOpen.mockResolvedValueOnce({} as never);

    const view = await render(<AppProvider><Child /></AppProvider>);
    fireEvent.press(await view.findByTestId("retry"));

    // Recovered: open succeeded → setupRepos → ready → app content renders.
    expect(await view.findByText("app-content")).toBeTruthy();
    expect(mockOpen).toHaveBeenCalledTimes(2);
  });
});
