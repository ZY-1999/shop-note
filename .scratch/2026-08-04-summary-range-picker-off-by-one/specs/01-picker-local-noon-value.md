# 汇总区间 date picker：日历日稳定的 value

Type: spec
Status: ready-for-human
Parent: #01 (01-summary-range-picker-off-by-one.md)
Blocked by: None — can start immediately

## Goal

汇总时间段 date-mode DateTimePicker 的选中日与工具栏标签为同一本地日历日（UTC+8 下不再出现 D→D−1）。

## Acceptance criteria

- [ ] 纯函数：由 bound ms 得到的 picker `Date`，其 **UTC ymd** 等于 `formatDate(ms)` 的 y-m-d（`Date.UTC(本地Y,M,D,12)` 构造保证；转绿既有 off-by-one 红测）
- [ ] **必做** summary-tab：打开 `range-from-picker` / `range-to-picker` 时，传入的 `value` 的本地年/月/日与对应工具栏标签一致（UTC+8 目标环境）
- [ ] 选日后仍经 `normalizeDayRange`；`from` 00:00 / `to` 23:59:59.999 语义不变
- [ ] 不改 `rangeFor` / 流水过滤口径
- [ ] Gate 关闭前：东八区设备按父 bug 复现步骤确认弹窗选中日正确（人工 smoke，记入 evidence）

## Scope

- **In**：`date-format` 纯函数构造 picker Date；summary-tab from/to date picker `value` 接线；上述自动化测试。
- **Out**：依赖 `timeZoneName`（SDK 57 非全平台可靠）；改日界语义；其它页 DateTimePicker（helper 可复用，非本 spec 必改）。

## Context

- 父 bug：`.scratch/2026-08-04-summary-range-picker-off-by-one/01-summary-range-picker-off-by-one.md`（症状确认于 UTC+8）。
- 今日：`value={new Date(range.from|to)}`；`from` 本地午夜 → UTC+ 下 UTC 日为前一天。
- 红测：`date-format.test.ts` — `off-by-one hazard`。

## Design

- **Interface delta**
  - `dateForPickerValue(ms: number): Date`：取 `ms` 的本地 `Y/M/D`，返回 `Date.UTC(Y, M, D, 12, 0, 0)` 对应的 `Date`。这样 **UTC 日历日恒等于本地标签日**（满足红测契约，且在 UTC+8 下本地读组件亦为同日）。
  - 汇总 date picker：`value={dateForPickerValue(boundMs)}`；`onPickBound` / `normalizeDayRange` 不变。
  - **Deep-module note**：TZ 规避藏在 date-format。
- **Internal architecture**
  - from 与 to 统一走 helper。
  - 目标验证环境：UTC+8（荣耀等）；极端 ±12h 以外时区不在本 bug 承诺范围。
- **Test seam**：转绿 off-by-one（对 helper）；summary-tab mock 暴露 `value`，断言 from/to 打开时本地 YMD === 标签。

## Rework on failure

失败隔离在 helper + summary-tab value 接线；单独重做。

## Comments

- 2026-08-04 — Evidence:
  - AC1: `src/components/date-format.test.ts` — `dateForPickerValue's UTC ymd matches the local toolbar label`
  - AC2: `src/components/summary-tab.test.tsx` — `passes from/to picker values with the same UTC calendar date as their toolbar labels`
  - AC3: `src/components/date-format.test.ts` — `snaps to local day bounds and swaps when start > end`；`summary-tab` 的 `onPickBound` 保持 `normalizeDayRange` 调用不变。
  - AC4: `rangeFor` 与流水过滤口径未改。
  - AC5: 东八区真机按父 bug 步骤确认弹窗选中日正确（人工 smoke，未在自动化中执行）。
  - PASS: `source "$HOME/.bashrc" && npx jest src/components/date-format.test.ts --colors=false && npx jest src/components/summary-tab.test.tsx --colors=false --forceExit > /tmp/summary-tab-full.txt 2>&1` — 2 suites / 47 tests
  - Commit: 本条关闭提交
