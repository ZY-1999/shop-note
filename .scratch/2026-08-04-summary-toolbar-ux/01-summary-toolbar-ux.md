# 汇总工具行：日期取消 / 快捷下拉遮挡 / 单行布局

Type: bug
Status: ready-for-human

## Summary

汇总页时间段工具行上，日期选择器取消无效（主要为 Android dialog）、快捷预设下拉被下层内容遮挡，且控件未能稳定挤在一行。

## Problem Statement

操作员在汇总页改时间段时：（1）打开起/止日选择器后点取消，选择器不关或状态不对；（2）打开「近10天/本月/…」快捷下拉时，菜单被库存卡等下层内容盖住，难以点选；（3）工具行控件换行，希望尽量单行排布。

## Reproduction Steps

1. 打开汇总 tab，点起日或止日，打开日选择器，点取消（Android）。
2. 点快捷预设触发器打开下拉，观察菜单与下方库存卡/流水的层叠。
3. 在常见手机宽度下观察工具行是否换行。

## Expected Behavior

1. 取消关闭选择器且不改区间。
2. 快捷下拉菜单画在最上层、可完整点选。
3. 起止日、快捷、导出、配置尽量同一行；**行内间距适当缩小**；快捷时间触发器**内部 padding 与整体宽度缩小**；**配置图标缩小**（相对今日尺寸）。

## Actual Behavior

1. 取消不生效（`editingBound` 不落空，选择器仍挂着）。
2. 下拉被后续兄弟视图遮挡。
3. 工具行因 `flexWrap` 等换行；行内 gap / 快捷 padding·宽度 / 配置图标偏大，挤占单行空间。

## Impact

日常对账 UX 烦恼；无数据损坏。刚落地的 summary-range-export 工具行。

## Root Cause Hypothesis

- **日期（Android）**：汇总挂载的日选择器默认 dialog；取消走 dismissed/`onDismiss` 路径，**不**触发 `onValueChange`。今日只在确认（`onValueChange` → 写区间并清 bound）时卸载，缺与记账/充值表单同型的 `onDismiss` 合同。
- **下拉**：菜单 `absolute` 叠在 toolbar 内；虽已有 zIndex/elevation，仍可能被 ListHeader 内后续库存卡等兄弟压住（嵌套 elevation / 绘制顺序）。
- **布局**：toolbar 开了 `flexWrap`；bound/preset 宽度未收紧。

## Proposed Fix Direction

- 对齐 record-form / topup-form 的 DateTimePicker 合同：确认时 `onValueChange` 写区间并卸载；取消 `onDismiss` 仅卸载、不写区间。汇总保持 tap-to-mount（不必照搬 iOS 常驻 inline）。
- 快捷菜单抬到不被后续列表内容盖住的层（提高 toolbar/菜单 elevation·zIndex，必要时改用已有 Modal 模式，保证 overflow 可画出）。
- 工具行尽量 nowrap 单行；**缩小行内 gap**；**缩小快捷触发器 padding 与宽度**（含字号/chevron 可略收）；**配置图标缩小**（今日约 20，调小一档）；起止日与「导出」文案可轻度收紧，但不改语义。

## Testing Decisions

- **Seam**：RNTL `summary-tab`（已有 day-pick / preset 套件）；对齐 `record-form` / `topup-form-picker` 的 `onDismiss` 取消测法。汇总侧 DateTimePicker mock 须转发 `onDismiss`。
- **Done checklist**：
  - [x] 原 repro 不再复现
  - [x] 回归测通过（取消不改区间；菜单可测层/可点；单行布局可观察）
  - [x] 无 `[DEBUG-…]` 残留
  - [x] 无一次性诊断脚本残留
  - [x] 正确假设写入 commit 说明

## Out of Scope

导出 sheet 内容、区间语义（近10天/对调）、会员详情白底、其它页 DateTimePicker 大改。

## Further Notes

- 同 feature 背景：`.scratch/2026-08-04-summary-range-export/`（工具行已由 #01 落地）。
- 对抗评审（2026-08-04）：veracity + feasibility PASS；润色「缺 elevation」→「已有 zIndex/elevation 仍可能被兄弟压住」。

## Comments

- 2026-08-04 — `/route`：三件明确 UI 缺陷 → bug 父单；adversarial PASS → publish `ready-for-human`（待 Gate 0）。
- 2026-08-04 — Gate 0 口径补充：行内间距缩小；快捷时间内部 padding + 宽度缩小；配置图标缩小。
- 2026-08-04 — Gate 0 PASS（user: reviewed 继续）→ `ready-for-agent`；进入 `/to-spec` → `/tdd`。
- 2026-08-04 — Spec #01 落地；Status → `ready-for-human`（待真机验收：取消 / 下拉层 / 单行收紧）。
