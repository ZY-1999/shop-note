import type { ReactElement } from "react";
import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render } from "@testing-library/react-native";

import { SignatureModal } from "@/components/signature-modal";
import { flushPending } from "@/testing/async";

/**
 * Spec #02 (signature-modal) — SignatureModal component: full-screen controlled
 * Modal, SVG canvas + gesture capture + rasterize + base64 normalization.
 *
 * Single external seam: RNTL. `./rasterize` is jest.mock'd (the isolated
 * boundary per spec Design). `react-native-gesture-handler` is mocked so that
 * pressing the canvas synthesizes a complete pan gesture (onBegin → onUpdate →
 * onEnd) to inject strokes. `react-native-svg` renders under jest-expo's native
 * module mocks.
 *
 * `fireEvent.*` is awaited (RNTL v14 async, codemap Risk Areas).
 */

// --- Mocks ---------------------------------------------------------------

/**
 * Mock `react-native-gesture-handler`: capture the gesture-builder callbacks so
 * `GestureDetector` can invoke them. When the test presses the canvas
 * (`fireEvent.press`), the mock synthesizes a complete pan gesture with
 * two sample points → dispatches `addStroke`.
 */
jest.mock("react-native-gesture-handler", () => {
  const React = jest.requireActual("react") as typeof import("react");

  function createPanGesture() {
    const g: {
      _begin: ((e: unknown) => void) | null;
      _update: ((e: unknown) => void) | null;
      _end: ((e: unknown) => void) | null;
      onBegin(cb: (e: unknown) => void): typeof g;
      onUpdate(cb: (e: unknown) => void): typeof g;
      onEnd(cb: (e: unknown) => void): typeof g;
    } = {
      _begin: null,
      _update: null,
      _end: null,
      onBegin(cb) {
        g._begin = cb;
        return g;
      },
      onUpdate(cb) {
        g._update = cb;
        return g;
      },
      onEnd(cb) {
        g._end = cb;
        return g;
      },
    };
    return g;
  }

  const GestureDetector = ({
    gesture,
    children,
  }: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    gesture: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    children: any;
  }) =>
    React.cloneElement(children, {
      onPress: () => {
        gesture?._begin?.({ x: 10, y: 10 });
        gesture?._update?.({ x: 50, y: 50 });
        gesture?._end?.({ x: 50, y: 50 });
      },
    });

  return {
    __esModule: true,
    GestureDetector,
    Gesture: { Pan: createPanGesture },
  };
});

/**
 * Mock `./rasterize`: returns a data URI WITH prefix so the component's strip
 * logic is exercised (AC #7). The component must strip `data:image/png;base64,`
 * before calling `onConfirm`.
 */
const mockRasterize = jest.fn<(target: unknown) => Promise<string>>();
jest.mock("@/components/rasterize", () => ({
  rasterize: (...args: unknown[]) => mockRasterize(...(args as [unknown])),
}));

const FAKE_DATA_URI = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==";
const STRIPPED = "iVBORw0KGgoAAAANSUhEUg==";

// --- Harness --------------------------------------------------------------

async function renderModal(ui: ReactElement) {
  const view = await render(ui);
  return { view };
}

afterEach(() => {
  mockRasterize.mockReset();
});

// --- AC#1: visible=true renders canvas + 4 buttons -----------------------

describe("SignatureModal — spec #02 AC1: visible=true renders entry points", () => {
  it("renders the signature canvas + undo/clear/confirm/cancel buttons", async () => {
    const { view } = await renderModal(
      <SignatureModal visible={true} onConfirm={jest.fn()} onCancel={jest.fn()} />,
    );

    expect(view.getByTestId("signature-canvas")).toBeTruthy();
    expect(view.getByTestId("undo-btn")).toBeTruthy();
    expect(view.getByTestId("clear-btn")).toBeTruthy();
    expect(view.getByTestId("confirm-btn")).toBeTruthy();
    expect(view.getByTestId("cancel-btn")).toBeTruthy();
  });
});

// --- AC#2: empty → confirm disabled; non-empty → enabled ----------------

describe("SignatureModal — spec #02 AC2: empty-signature invariant", () => {
  it("disables confirm when strokes are empty (initial state)", async () => {
    const { view } = await renderModal(
      <SignatureModal visible={true} onConfirm={jest.fn()} onCancel={jest.fn()} />,
    );

    const confirmBtn = view.getByTestId("confirm-btn");
    expect(confirmBtn.props.accessibilityState?.disabled).toBe(true);
  });

  it("enables confirm after a stroke is drawn on the canvas", async () => {
    const { view } = await renderModal(
      <SignatureModal visible={true} onConfirm={jest.fn()} onCancel={jest.fn()} />,
    );

    // Pressing the canvas triggers the mocked gesture → addStroke dispatch
    await fireEvent.press(view.getByTestId("signature-canvas"));
    await flushPending();

    const confirmBtn = view.getByTestId("confirm-btn");
    expect(confirmBtn.props.accessibilityState?.disabled).toBe(false);
  });
});

// --- AC#3: undo to empty → confirm flips disabled -----------------------

describe("SignatureModal — spec #02 AC3: undo wiring", () => {
  it("flips confirm back to disabled after undoing the last stroke", async () => {
    const { view } = await renderModal(
      <SignatureModal visible={true} onConfirm={jest.fn()} onCancel={jest.fn()} />,
    );

    // Draw a stroke → confirm enabled
    await fireEvent.press(view.getByTestId("signature-canvas"));
    await flushPending();
    expect(
      view.getByTestId("confirm-btn").props.accessibilityState?.disabled,
    ).toBe(false);

    // Undo → confirm disabled
    await fireEvent.press(view.getByTestId("undo-btn"));
    await flushPending();
    expect(
      view.getByTestId("confirm-btn").props.accessibilityState?.disabled,
    ).toBe(true);
  });
});

// --- AC#4: clear → strokes cleared, confirm disabled -------------------

describe("SignatureModal — spec #02 AC4: clear wiring", () => {
  it("clears all strokes and disables confirm", async () => {
    const { view } = await renderModal(
      <SignatureModal visible={true} onConfirm={jest.fn()} onCancel={jest.fn()} />,
    );

    // Draw two strokes
    await fireEvent.press(view.getByTestId("signature-canvas"));
    await flushPending();
    await fireEvent.press(view.getByTestId("signature-canvas"));
    await flushPending();
    expect(
      view.getByTestId("confirm-btn").props.accessibilityState?.disabled,
    ).toBe(false);

    // Clear → confirm disabled
    await fireEvent.press(view.getByTestId("clear-btn"));
    await flushPending();
    expect(
      view.getByTestId("confirm-btn").props.accessibilityState?.disabled,
    ).toBe(true);
  });
});

// --- AC#5: confirm with strokes → onConfirm called with string ----------

describe("SignatureModal — spec #02 AC5: confirm contract", () => {
  it("calls onConfirm with a string when confirm is pressed after drawing", async () => {
    mockRasterize.mockResolvedValue(FAKE_DATA_URI);
    const onConfirm = jest.fn<(base64: string) => void>();

    const { view } = await renderModal(
      <SignatureModal visible={true} onConfirm={onConfirm} onCancel={jest.fn()} />,
    );

    // Draw a stroke
    await fireEvent.press(view.getByTestId("signature-canvas"));
    await flushPending();

    // Confirm
    await fireEvent.press(view.getByTestId("confirm-btn"));
    await flushPending();

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(typeof onConfirm.mock.calls[0][0]).toBe("string");
  });
});

// --- AC#6: cancel → onCancel called, onConfirm not called ---------------

describe("SignatureModal — spec #02 AC6: cancel contract", () => {
  it("calls onCancel and does NOT call onConfirm when cancel is pressed", async () => {
    const onConfirm = jest.fn<(base64: string) => void>();
    const onCancel = jest.fn<() => void>();

    const { view } = await renderModal(
      <SignatureModal visible={true} onConfirm={onConfirm} onCancel={onCancel} />,
    );

    await fireEvent.press(view.getByTestId("cancel-btn"));
    await flushPending();

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

// --- AC#7: base64 prefix stripped in component --------------------------

describe("SignatureModal — spec #02 AC7: base64 normalization", () => {
  it("strips the data:image/png;base64, prefix before passing to onConfirm", async () => {
    mockRasterize.mockResolvedValue(FAKE_DATA_URI);
    const onConfirm = jest.fn<(base64: string) => void>();

    const { view } = await renderModal(
      <SignatureModal visible={true} onConfirm={onConfirm} onCancel={jest.fn()} />,
    );

    await fireEvent.press(view.getByTestId("signature-canvas"));
    await flushPending();

    await fireEvent.press(view.getByTestId("confirm-btn"));
    await flushPending();

    expect(onConfirm).toHaveBeenCalledWith(STRIPPED);
    expect(onConfirm.mock.calls[0][0]).not.toContain("data:");
  });
});

// --- AC#8: router-agnostic; visible=false → no canvas -------------------

describe("SignatureModal — spec #02 AC8: controlled visibility", () => {
  it("does not render the canvas area when visible=false", async () => {
    const { view } = await renderModal(
      <SignatureModal visible={false} onConfirm={jest.fn()} onCancel={jest.fn()} />,
    );

    expect(view.queryByTestId("signature-canvas")).toBeNull();
    expect(view.queryByTestId("confirm-btn")).toBeNull();
  });

  it("renders without any router or provider dependency (router-agnostic)", async () => {
    // Rendered with a bare `render` — no expo-router, no ReposProvider.
    // If this succeeds, the component is router-agnostic.
    const { view } = await renderModal(
      <SignatureModal visible={true} onConfirm={jest.fn()} onCancel={jest.fn()} />,
    );
    expect(view.getByTestId("signature-canvas")).toBeTruthy();
  });
});
