import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { QueryClient } from "@tanstack/react-query";
import { fireEvent } from "@testing-library/react-native";
import { Platform } from "react-native";

import { RecordForm } from "@/components/record-form";
import { formatDateTime } from "@/components/date-format";
import { InMemoryAdapter } from "@/data/in-memory";
import { setupRepos, type Repos } from "@/data/composition";
import { cents } from "@/data/primitives";
import { renderWithProviders, type RenderWithProvidersResult } from "@/testing/render";

/**
 * Spec #06 (record-posting-form) — the form through the real data stack
 * (ADR-0006: InMemoryAdapter, no mocked Repos). Two nav/native deps ARE mocked:
 * `expo-router` (router.back on success) and `@expo/ui`'s DateTimePicker (its
 * native picker behavior is device-verified; here a stub exposes a backdate tap).
 *
 * RNTL v14 + React 19 + React Query v5 notes (see `waitForSync` below): we never
 * use RNTL's `findBy*`/`waitFor` here — their act-wrapped polling overlaps the
 * next `fireEvent`'s act (React then drops the state update → submit reads a
 * stale line) and leaks polling timers that, compounded over the 8 tests,
 * corrupt the renderer into producing empty trees. `waitForSync` polls without
 * act, and `afterEach` clears the QueryClient, so nothing leaks.
 */
const mockBack = jest.fn<() => void>();
jest.mock("expo-router", () => ({
  router: { back: () => mockBack() },
}));

// MemberInfoHeader is mocked to a lightweight stub (same rationale as the
// topup-form suites: its own correctness lives in member-info-header.test.tsx,
// and keeping its two useQuery observers out of this 15-test interaction suite
// avoids the RNTL v14 + React 19 + React Query v5 renderer corruption).
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

const mockBackdateMs = new Date("2020-01-01T00:00:00Z").getTime();
jest.mock("@expo/ui/community/datetime-picker", () => {
  const React = jest.requireActual("react") as typeof import("react");
  const { View, Text, Pressable } = jest.requireActual("react-native") as typeof import("react-native");
  return {
    __esModule: true,
    // Handlers are spread onto the View's props so tests can fireEvent them
    // directly. The Android dialog-contract suite below drives onValueChange and
    // onDismiss this way; the iOS suite still uses the `${testID}-backdate` press.
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
        // ViewProps doesn't list onValueChange/onDismiss (the picker's own props),
        // so assert — RNTL reads them off the View's props at fireEvent time.
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

beforeEach(() => {
  mockBack.mockClear();
});

/** The QueryClient backing the current render — cleared after each test for isolation. */
let activeQueryClient: QueryClient | null = null;

afterEach(() => {
  // Cancel any in-flight queries/mutations on this test's client so nothing
  // leaks into the next test's macrotask queue (ADR-0006 isolation).
  activeQueryClient?.clear();
  activeQueryClient = null;
});

/**
 * Render under the real providers, then yield once so the initial queries'
 * async queryFn results land before the first interaction. RNTL v14 doesn't flush
 * React Query inside fireEvent, so without this the product list (and thus the
 * `pick-…` buttons) wouldn't be in the tree when the test reaches for them.
 */
async function renderForm(
  ui: ReactElement,
  opts?: { repos?: Repos },
): Promise<RenderWithProvidersResult> {
  const res = await renderWithProviders(ui, opts);
  activeQueryClient = res.queryClient;
  await flushPending();
  return res;
}

/** Yield one macrotask so pending React state / React Query notifications settle. */
function flushPending(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Poll `get` (a sync RNTL query like `() => view.getByTestId(…)`, or an async
 * assertion) until it stops throwing, yielding one macrotask between tries —
 * WITHOUT wrapping each try in act. RNTL v14's `findBy*`/`waitFor` wrap every
 * poll in act, and in this suite that act both overlaps the next fireEvent's act
 * ("overlapping act()" → React drops the fireEvent's state update, so submit
 * reads a stale line) AND leaves polling timers leaked across tests, which
 * eventually corrupt the renderer (it starts producing empty trees). `get` here
 * runs unguarded: query results flush on their own setTimeout between yields (the
 * cosmetic "not wrapped in act" note from jest-setup.js applies and is harmless),
 * so a plain poll observes them with no act contention and no leaked timers.
 * Bounded so a genuinely missing element / unsatisfied assertion still fails fast.
 */
async function waitForSync<T>(get: () => T | Promise<T>, timeoutMs = 2000): Promise<Awaited<T>> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      return await get() as Awaited<T>;
    } catch {
      if (Date.now() >= deadline) return await get() as Awaited<T>; // final try — surface its error
    }
    await new Promise((r) => setTimeout(r, 0));
  }
}

/** Seed a fresh repos with one staff + one product; return them for the form props. */
async function seed(): Promise<{ repos: Repos; staffId: string; productId: string }> {
  const repos = setupRepos(new InMemoryAdapter());
  const staff = await repos.staff.create({ name: "张三", phone: "138", notes: "" });
  const product = await repos.products.create({ title: "可乐", purchase_price: cents(300), category: "饮料" });
  return { repos, staffId: staff.id, productId: product.id };
}

/**
 * Render the form with a product line picked and its qty filled in.
 *
 * `waitForSync` (not `findByTestId`) precedes each `fireEvent`: RNTL v14's
 * `findBy*` wraps every poll in act, which overlaps the next fireEvent's act and
 * makes React drop the state update — compounding across tests until the renderer
 * produces empty trees. `waitForSync` polls without act (see it above), and a
 * final `flushPending` makes sure setQty has committed before the caller submits.
 */
async function renderPicked(direction: "out", qty: string) {
  const seeded = await seed();
  const { view } = await renderForm(
    <RecordForm staffId={seeded.staffId} direction={direction} />,
    { repos: seeded.repos },
  );
  fireEvent.press(await waitForSync(() => view.getByTestId(`pick-${seeded.productId}`)));
  fireEvent.changeText(await waitForSync(() => view.getByTestId("qty-0")), qty);
  // RNTL v14 + React 19: fireEvent.changeText's act can close before the
  // setQty update flushes, leaving submit's closure reading a stale line. Yield
  // once so the pending state commits before the caller presses submit.
  await flushPending();
  return { ...seeded, view };
}

describe("RecordForm — header renders MemberInfoHeader (spec #04 AC1)", () => {
  it("renders the member-info header, no direction word in the form", async () => {
    const { repos, staffId } = await seed();
    const { view } = await renderForm(<RecordForm staffId={staffId} direction="out" />, { repos });
    expect(view.getByTestId("member-info-header")).toBeTruthy();
    // spec #04: the 出库/入库 direction word left the form header (it lives in the
    // Stack nav title now) — assert neither appears inside the form component.
    expect(view.queryByText("入库")).toBeNull();
    expect(view.queryByText("出库")).toBeNull();
  });
});

describe("RecordForm — pick a product adds a line (spec #06 AC1)", () => {
  it("picking a product adds a line", async () => {
    const { repos, staffId, productId } = await seed();
    const { view } = await renderForm(<RecordForm staffId={staffId} direction="out" />, { repos });

    // waitForSync (not findBy) before fireEvent — see renderPicked for why.
    fireEvent.press(await waitForSync(() => view.getByTestId(`pick-${productId}`)));
    expect(await waitForSync(() => view.getByText("可乐"))).toBeTruthy(); // line shows the picked product title
  });
});

describe("RecordForm — live line amount + running total (spec #06 AC2)", () => {
  it("updates the line amount and total as the operator types a qty", async () => {
    const { view } = await renderPicked("out", "4");
    // 300¢ × 4 = 1200¢ = ¥12.00 — the line amount AND the running total both show it.
    await waitForSync(() => expect(view.getAllByText("¥12.00")).toHaveLength(2));

    // editing the qty re-derives the total live (300¢ × 10 = ¥30.00). MoneyText
    // renders `¥` + the figure as two children (["¥","30.00"]), so join before matching.
    fireEvent.changeText(view.getByTestId("qty-0"), "10");
    await flushPending();
    await waitForSync(() =>
      expect((view.getByTestId("running-total").props.children as string[]).join("")).toMatch(/30\.00/),
    );
  });
});

describe("RecordForm — submit blocked with a visible message (spec #06 AC3)", () => {
  it("blocks submit with no items", async () => {
    const { repos, staffId } = await seed();
    const { view } = await renderForm(<RecordForm staffId={staffId} direction="out" />, { repos });
    fireEvent.press(view.getByTestId("submit"));
    const error = await waitForSync(() => view.getByTestId("form-error"));
    expect(error.props.children).toBe("至少添加一项商品");
  });

  it("blocks submit when a line has a non-integer qty", async () => {
    const { view } = await renderPicked("out", "1.5");
    fireEvent.press(view.getByTestId("submit"));
    const error = await waitForSync(() => view.getByTestId("form-error"));
    expect(error.props.children).toBe("数量必须是正整数");
  });
});

describe("RecordForm — valid submit creates the record (spec #06 AC4)", () => {
  it("posts the record (snapshot at current price) and navigates back", async () => {
    const { repos, staffId, view } = await renderPicked("out", "4");
    fireEvent.press(view.getByTestId("submit"));

    await waitForSync(() => expect(mockBack).toHaveBeenCalled());
    const [posted] = await repos.stockRecords.list();
    expect(posted.record.staff_id).toBe(staffId);
    expect(posted.record.direction).toBe("out");
    expect(posted.items[0].title).toBe("可乐"); // snapshot title
    expect(posted.items[0].unit_price).toBe(cents(300)); // snapshot price
    expect(posted.items[0].qty).toBe(4);
  });
});

describe("RecordForm — note + backdatable time (spec #06 AC5)", () => {
  it("defaults note to empty and time to now; carries the note on submit", async () => {
    const { repos, view } = await renderPicked("out", "2");
    fireEvent.changeText(view.getByTestId("note"), "单号A1");
    await flushPending(); // let setNote commit before submit reads it (same stale-closure guard as qty)
    fireEvent.press(view.getByTestId("submit"));

    await waitForSync(async () => expect((await repos.stockRecords.list()).length).toBe(1));
    const [posted] = await repos.stockRecords.list();
    expect(posted.record.note).toBe("单号A1");
    // time defaults to now — within a few seconds of the submit.
    expect(posted.record.timestamp).toBeGreaterThan(Date.now() - 5000);
  });

  it("lets the operator backdate the time", async () => {
    const { repos, view } = await renderPicked("out", "1");
    fireEvent.press(view.getByTestId("record-time-backdate")); // set to mockBackdateMs
    await flushPending(); // let setTimestamp commit before submit reads it
    fireEvent.press(view.getByTestId("submit"));

    await waitForSync(async () => expect((await repos.stockRecords.list()).length).toBe(1));
    const [posted] = await repos.stockRecords.list();
    expect(posted.record.timestamp).toBe(mockBackdateMs);
  });
});

describe("RecordForm — out over holdings is not blocked (spec #06 AC6)", () => {
  it("posts an out exceeding current holdings (negative / 欠货 allowed)", async () => {
    const { repos, view } = await renderPicked("out", "5");
    // no prior 'in' — balance is 0, so any out goes negative. Still submits.
    fireEvent.press(view.getByTestId("submit"));

    await waitForSync(async () => expect((await repos.stockRecords.list()).length).toBe(1));
    const [posted] = await repos.stockRecords.list();
    expect(posted.record.direction).toBe("out");
    expect(posted.items[0].qty).toBe(5);
  });
});

describe("RecordForm — Android dialog picker contract (spec #06 Android fix)", () => {
  // Android renders the picker as a mount-on-demand Material dialog (@expo/ui
  // default presentation='dialog'): tap the timestamp trigger to mount it, then
  // the caller MUST unmount on confirm (onValueChange) or cancel (onDismiss).
  // The prior code left it permanently mounted with no onDismiss, so Cancel was
  // unwired — these pin the contract so it can't regress. jest-expo defaults to
  // iOS (covered by the backdate test above); this suite flips Platform.OS.
  const originalOS = Platform.OS;
  beforeEach(() => {
    Platform.OS = "android";
  });
  afterEach(() => {
    Platform.OS = originalOS;
  });

  it("mounts the picker on tap, confirms via onValueChange, and unmounts", async () => {
    const { repos, view } = await renderPicked("out", "1");
    // dialog not mounted until the trigger is tapped
    expect(() => view.getByTestId("record-time-picker")).toThrow();
    await fireEvent.press(view.getByTestId("record-time"));
    const picker = view.getByTestId("record-time-picker");
    // OK → new timestamp + the dialog unmounts
    await fireEvent(
      picker,
      "onValueChange",
      { nativeEvent: { timestamp: mockBackdateMs, utcOffset: 0 } },
      new Date(mockBackdateMs),
    );
    expect(() => view.getByTestId("record-time-picker")).toThrow();
    await flushPending(); // let setTimestamp commit before submit reads it
    fireEvent.press(view.getByTestId("submit"));
    await waitForSync(async () => expect((await repos.stockRecords.list()).length).toBe(1));
    const posted = (await repos.stockRecords.list())[0];
    expect(posted.record.timestamp).toBe(mockBackdateMs);
  });

  it("cancel via onDismiss unmounts without writing a new time", async () => {
    const { repos, view } = await renderPicked("out", "1");
    await fireEvent.press(view.getByTestId("record-time"));
    await fireEvent(view.getByTestId("record-time-picker"), "onDismiss");
    // Cancel unmounts the dialog…
    expect(() => view.getByTestId("record-time-picker")).toThrow();
    // …and writes nothing — submit carries the default (~now), not a dialog value.
    await flushPending();
    fireEvent.press(view.getByTestId("submit"));
    await waitForSync(async () => expect((await repos.stockRecords.list()).length).toBe(1));
    const posted = (await repos.stockRecords.list())[0];
    expect(posted.record.timestamp).toBeGreaterThan(Date.now() - 5000);
  });
});

describe("RecordForm — chip pick + stepper (spec #03 AC1/AC2)", () => {
  it("picking a chip starts a line at qty 1; tapping it again adds +1 (no duplicate line)", async () => {
    const { repos, staffId, productId } = await seed();
    const { view } = await renderForm(<RecordForm staffId={staffId} direction="out" />, { repos });

    await fireEvent.press(await waitForSync(() => view.getByTestId(`pick-${productId}`)));
    await flushPending();
    expect(view.getByTestId("qty-0").props.value).toBe("1"); // chip pick starts at 1 (not empty)

    // Tapping the SAME chip again → +1 on the existing line, not a new line.
    await fireEvent.press(view.getByTestId(`pick-${productId}`));
    await flushPending();
    expect(view.getByTestId("qty-0").props.value).toBe("2");
    expect(() => view.getByTestId("qty-1")).toThrow(); // still one line — no duplicate

    // Search is deliberately NOT cleared → the chip stays for repeat taps (spec #03).
    expect(view.getByTestId(`pick-${productId}`)).toBeTruthy();
  });

  it("the stepper + increases, − clamps at 1, and 删除 removes the line", async () => {
    const { view } = await renderPicked("out", "1"); // one line, qty "1"

    // − at qty 1 clamps to 1 (never below); the operator removes a line via 删除, not −.
    await fireEvent.press(view.getByTestId("dec-0"));
    await flushPending();
    expect(view.getByTestId("qty-0").props.value).toBe("1");

    // + → 2
    await fireEvent.press(view.getByTestId("inc-0"));
    await flushPending();
    expect(view.getByTestId("qty-0").props.value).toBe("2");

    // − → back to 1
    await fireEvent.press(view.getByTestId("dec-0"));
    await flushPending();
    expect(view.getByTestId("qty-0").props.value).toBe("1");

    // 删除 removes the line entirely
    await fireEvent.press(view.getByTestId("remove-0"));
    await flushPending();
    expect(() => view.getByTestId("qty-0")).toThrow();
  });
});

describe("RecordForm — 备注 field (spec #03 AC3)", () => {
  it("renders 备注 as a label:input field", async () => {
    const { repos, staffId } = await seed();
    const { view } = await renderForm(<RecordForm staffId={staffId} direction="out" />, { repos });
    expect(await waitForSync(() => view.getByText("备注"))).toBeTruthy();
    expect(view.getByTestId("note")).toBeTruthy();
  });
});

describe("RecordForm — buttonized time affordance shows formatDateTime (spec #03 AC4)", () => {
  // The Android branch renders a Pressable affordance (inputBg + border + the
  // formatted timestamp + an icon) that mounts the dialog picker on tap. iOS keeps
  // its inline picker (its backdate path is covered by the spec #06 suite above).
  const originalOS = Platform.OS;
  beforeEach(() => {
    Platform.OS = "android";
  });
  afterEach(() => {
    Platform.OS = originalOS;
  });

  it("the time affordance reflects formatDateTime(timestamp) after a dialog backdate", async () => {
    const { repos, staffId, view } = await renderPicked("out", "1");
    // Mount the dialog, pick the known backdate.
    await fireEvent.press(view.getByTestId("record-time"));
    await fireEvent(
      view.getByTestId("record-time-picker"),
      "onValueChange",
      { nativeEvent: { timestamp: mockBackdateMs, utcOffset: 0 } },
      new Date(mockBackdateMs),
    );
    await flushPending(); // setTimestamp commits → the affordance re-renders
    // The affordance now shows the local formatDateTime of the backdated timestamp.
    expect(view.getByText(formatDateTime(mockBackdateMs))).toBeTruthy();
    void repos;
  });
});
