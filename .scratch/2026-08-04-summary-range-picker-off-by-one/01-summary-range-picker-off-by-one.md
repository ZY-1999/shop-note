# 汇总时间段：开始日弹窗选中偏一天

Type: bug
Status: ready-for-agent

## Summary

汇总页工具栏开始日显示为 D（如 07/26），点开 DateTimePicker 后选中为 D−1（如 07/25）。

## Problem Statement

操作员看「近10天」等时间段时，开始日标签正确，但点开始日弹窗日历高亮/选中却是前一天，易误改区间。

## Reproduction Steps

1. 设备时区为东八区（或任意 UTC+）。
2. 打开汇总，默认近10天（或任意 `from` 为本地 00:00 的区间）。
3. 记下工具栏开始日（如 `2026/07/26`）。
4. 点击开始日，观察日期弹窗选中日。

## Expected Behavior

弹窗选中日与工具栏开始日为同一本地日历日。

## Actual Behavior

弹窗选中为前一本地日（07/26 → 07/25）。

## Impact

对账时段易选错一天；结束日在东八区通常正常（`to` 为 23:59:59.999，UTC 日历日仍同日）。

## Root Cause Hypothesis

**已确认的数据侧事实**：区间 `from` 收束为本地日 00:00:00.000；传给 date-mode `DateTimePicker` 的 `value={new Date(from)}` 在 UTC+ 时区下，该瞬间的 **UTC 日历日 = 本地日 − 1**（例：本地 `2026-07-26 00:00+08` → ISO `2026-07-25T16:00:00.000Z`）。工具栏 `formatDate` 用本地组件，故标签仍为 26。

**与用户症状的衔接（高置信、业界常见）**：原生 date picker 对 `Date` 的日历日解释若偏向 UTC（或未显式绑定本地 `timeZoneName`），会把上述 value 画成 25。组件内部是否「默认 UTC」未在源码级钉死；但「午夜 value × UTC+」是可复现的危险构造，且与真机 off-by-one 一致。

证据（反馈环，已红）：
```
npx jest src/components/date-format.test.ts -t "off-by-one hazard" --forceExit
Expected: "2026-07-26"  Received: "2026-07-25"
```

对照：同一本地日的**正午** Date，UTC 日与本地日一致。

## Proposed Fix Direction

优先（不依赖 IANA 运行时）：date-mode 的 picker `value` 改为该 bound 的**本地正午**（或其它远离午夜的稳定本地时刻）；`onValueChange` 仍经 `normalizeDayRange` 收束日界，区间语义不变。

备选：为 picker 设置可靠的本地 `timeZoneName`（须明确 IANA 来源；SDK 57 `@expo/ui` 支持该 prop）。

回归：保留并转绿 `date-format.test.ts` 中 off-by-one 断言（picker value 的 UTC ymd 与 `formatDate(bound)` 一致）。

## Testing Decisions

Done checklist：

- [ ] 原复现步骤不再出现 D→D−1
- [ ] 回归测试在所选 seam 通过（见上 off-by-one；可补 summary-tab 打开 from-picker 时 value 与标签同日）
- [ ] 无残留 `[DEBUG-...]` / 临时 harness（当前红测即回归 seam，保留）
- [ ] 提交说明写明：本地午夜 value 在 UTC+ 下 UTC 日偏移

## Out of Scope

改 `rangeFor` / `normalizeDayRange` 日界语义；改流水过滤口径；其它页 DateTimePicker（除非同构一并修）。

## Further Notes

- `/diagnose-bug` 2026-08-04；对抗评审：勿把「UTC 日偏移」直接写成「组件已证明默认 UTC」——已改写。
- 类比社区 datetimepicker off-by-one / timezone 讨论。

## Comments

- 2026-08-04 — diagnose PASS → to-prd；Gate 0 待确认。
- 2026-08-04 — Gate 0 确认；Status → ready-for-agent；进入 /sdd-flow。
