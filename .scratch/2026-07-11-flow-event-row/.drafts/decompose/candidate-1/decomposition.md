# Decomposition — candidate-1 (acceptance-first, smallest verifiable)

Parent PRD: #01 flow-event-row  
Cut axis: **By acceptance** — smallest independently verifiable behavior first, then expand consumers.

---

## Spec 01 — Time formatting with seconds

**Goal:** Add second-precision time formatters and use them wherever this PRD requires HH:mm:ss display.

**Parent:** #01  
**Blocked by:** None — can start immediately  
**Delivers:**
- `formatTimeSeconds` (`HH:mm:ss`) and `formatDateTimeSeconds` (`YYYY/MM/DD HH:mm:ss`) in `date-format.ts`
- Unit tests in data project (same pattern as existing `formatTime` tests)
- `RecordDetail` header time switched from `toLocaleString()` drift to `formatDateTimeSeconds`

**Key acceptance behaviors:**
- [ ] `formatTimeSeconds(epochMs)` renders local `HH:mm:ss` for a fixed instant (deterministic test)
- [ ] `formatDateTimeSeconds(epochMs)` renders local `YYYY/MM/DD HH:mm:ss` for a fixed instant
- [ ] Existing `formatTime` callers unchanged (no global migration)
- [ ] `RecordDetail` shows second-precision timestamp after load (RNTL / component test)

---

## Spec 02 — FlowEventRow component

**Goal:** Ship the reusable single-event row component for checkout and top-up events with consistent layout and press handling.

**Parent:** #01  
**Blocked by:** #01 (time formatting)  
**Delivers:**
- `FlowEventRow` at `src/components/flow-event-row.tsx` (discriminated union: `kind: 'checkout' | 'topup'`)
- Checkout props: `bundles`, `retailCents`; shared: `timestamp`, `amountCents`, `onPress`, optional `testID` prefix
- Layout: time → type label (出库/充值) → amount → (checkout) 计 N 单 + 零售 → chevron-forward
- Component tests (RNTL): checkout vs topup field presence, `onPress` fires

**Key acceptance behaviors:**
- [ ] Checkout row shows `formatTimeSeconds` time, 出库 label, amount, `计 {bundles} 单`, 零售 amount, chevron
- [ ] Topup row shows time, 充值 label, amount, chevron — no bundle/retail copy
- [ ] Root `Pressable` invokes `onPress` when tapped
- [ ] `testID` prefix convention matches `FlowSummary` (no collision)

---

## Spec 03 — TopupDetail screen + route

**Goal:** Provide a router-agnostic recharge detail page with void workflow; remove inline void from list contexts (wired in later specs).

**Parent:** #01  
**Blocked by:** #01 (time formatting)  
**Delivers:**
- `TopupDetail` component (`topupId` prop, router-agnostic)
- `useTopupById(topupId)` read hook (includes voided records)
- Void via existing `useVoidTopup` with two-step confirm; no edit affordance
- Route adapter `bookkeeping/topup/[id].tsx` + stack registration in `_layout.tsx`
- Component tests: field display, void flow, voided record still viewable with 已作废 badge

**Key acceptance behaviors:**
- [ ] Loaded topup shows 充值 label, member name, `formatDateTimeSeconds` time, amount, note or 「—」
- [ ] Active topup: void confirm → success → shows 已作废, void button hidden
- [ ] Voided topup opens and remains readable with 已作废 state (no inline void on list)
- [ ] Route adapter pushes `/bookkeeping/topup/[id]` from bookkeeping stack

---

## Spec 04 — StaffDetail adopts FlowEventRow + topup navigation

**Goal:** Replace inline history rows in member detail with `FlowEventRow`; navigate to topup detail instead of inline void.

**Parent:** #01  
**Blocked by:** #02 (FlowEventRow), #03 (TopupDetail + route)  
**Delivers:**
- Day-card expanded events render via `FlowEventRow` for checkout and topup
- Checkout: parent computes `bundles`/`retailCents` via `splitBundleRetail(Σ line_amount, unit_price_snapshot)`; `onPress` → existing `onOpenRecord`
- Topup: `onPress` → new `onOpenTopup(id)` prop; route adapter wires push to `topup/[id]`
- Remove `voidingTopupId` state and inline void UI from `StaffDetail`
- Update `staff-detail.test.tsx`: no inline void; topup row navigates; checkout shows bundle/retail testIDs

**Key acceptance behaviors:**
- [ ] Expanded day shows checkout rows with 计 N 单 / 零售 (not product names)
- [ ] Expanded day shows topup rows matching checkout visual layout (time to seconds, chevron)
- [ ] Tapping checkout row calls `onOpenRecord(recordId)`
- [ ] Tapping topup row calls `onOpenTopup(topupId)` — no inline void control on row
- [ ] Timeline merge/grouping unchanged (day batch, newest first)

---

## Spec 05 — SummaryTab topup data + unified FlowEventRow drill-down

**Goal:** Align summary member drill-down with member detail: merge checkout + topup events, render with `FlowEventRow`, navigate to both detail pages.

**Parent:** #01  
**Blocked by:** #02 (FlowEventRow), #03 (TopupDetail + route), #04 (establishes `onOpenTopup` pattern on staff route — optional parallel if interface frozen)  
**Delivers:**
- `TopupRepository.list` optional `date_range` in-memory filter (mirror stock-record idiom) + data-layer test
- `useTopups` hook accepts extended filter (`staff_id`, `date_range`)
- `SummaryTab`: merge member-day checkout + topup events (timestamp desc), render `FlowEventRow`
- New `onOpenTopup?: (topupId: string) => void`; `summary/index` adapter pushes `/bookkeeping/topup/[id]`
- Remove inline `recordLine` layout and product-name display
- Update `summary-tab.test.tsx`: expanded member shows both event kinds; navigation + bundle/retail on checkout

**Key acceptance behaviors:**
- [ ] `TopupRepository.list({ date_range })` returns only topups within range (unit test)
- [ ] Expanded staff row on a day lists checkout **and** topup events in one merged, time-desc list
- [ ] Checkout rows show bundle/retail summary (no product names)
- [ ] Topup row tap invokes `onOpenTopup` → bookkeeping stack topup detail
- [ ] Checkout row tap still invokes `onOpenRecord` (cross-tab push unchanged)

---

## Dependency graph

```
01 (date-format + RecordDetail time)
 ├─→ 02 (FlowEventRow)
 └─→ 03 (TopupDetail + route)
        ↓
      04 (StaffDetail integration) ──→ 05 (SummaryTab + topup date_range)
```

Specs 02 and 03 can run in parallel after 01. Spec 05 could start data-layer work (`TopupRepository.list` date_range) in parallel with 04 once 02/03 land; full SummaryTab UI integration depends on 02 + 03.
