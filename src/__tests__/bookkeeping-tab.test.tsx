import { describe, expect, it, jest, beforeEach } from "@jest/globals";
import { fireEvent, render } from "@testing-library/react-native";

/**
 * Spec #04 (production-app-shell) AC4 — per-tab Stack navigation.
 *
 * `expo-router`'s `router` is mocked so the push can be asserted without a device
 * (the real stack push + back is confirmed on device). Pressing the bookkeeping
 * placeholder row must push `/bookkeeping/detail` — proving the tab's Stack is
 * wired for an in-tab detail/form push that #5/#6/#7 build on.
 */
const mockPush = jest.fn<(href: unknown) => void>();
jest.mock("expo-router", () => ({
  router: { push: (href: unknown) => mockPush(href) },
}));

import BookkeepingTab from "@/app/bookkeeping/index";

describe("bookkeeping tab — per-tab Stack push (spec #04 AC4)", () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  it("pressing a row pushes the detail route within the tab's stack", async () => {
    const view = await render(<BookkeepingTab />);
    fireEvent.press(await view.findByTestId("demo-row"));
    expect(mockPush).toHaveBeenCalledWith("/bookkeeping/detail");
  });
});
