# 汇总工具行：取消 / 下拉层 / 单行收紧

Type: spec
Status: ready-for-human
Parent: #01 (01-summary-toolbar-ux.md)
Blocked by: None — can start immediately

## Goal

汇总时间段工具行：取消日选择不改区间；快捷下拉不被遮挡；控件尽量单行且间距/快捷/配置图标按口径收紧。

## Acceptance criteria

- [x] Android 日选择器点取消：选择器卸载、区间不变（`onDismiss` 合同；mock 须转发）
- [x] 确认选日仍写区间并卸载（既有 day-pick 行为不回退）
- [x] 快捷预设菜单打开时可完整点选，不被库存卡等下层内容挡住（可观察层：Modal 或等价抬层）
- [x] 工具行尽量单行（nowrap）；行内 gap 小于今日；快捷触发器 padding 与宽度缩小；配置图标小于今日 20

## Scope

- **In**：`SummaryTab` 工具行 DateTimePicker dismiss；快捷菜单层叠；toolbar 样式收紧（gap / preset / 配置图标）。
- **Out**：导出 sheet、区间语义、其它页 picker、会员详情。

## Context

- 父 bug：`.scratch/2026-08-04-summary-toolbar-ux/01-summary-toolbar-ux.md`
- 工具行来自 summary-range-export #01；导出配置 Modal 已在同页。
- Prior art：`record-form` / `topup-form` Android `onDismiss`；RNTL `summary-tab` day-pick / preset；汇总 DateTimePicker mock 今日未转发 `onDismiss`。

## Design

- **Interface delta**
  - 日选择器：确认 → `onValueChange` → 既有 `onPickBound`（写区间 + 清 bound）；取消 → `onDismiss` → 仅 `setEditingBound(null)`，不改 `range`。保持 tap-to-mount。
  - 快捷菜单：改为与导出配置同型的透明 `Modal`（或等价全屏抬层），打开时菜单锚定在触发器下方视觉位置或卡片列表；点项/点遮罩关闭。避免 absolute 菜单被 ListHeader 后续兄弟压住。
  - 样式：`toolbar` `flexWrap: "nowrap"`（或去掉 wrap）；缩小 `gap`；`presetTrigger` 更小 padding / 可去掉 `flex:1` 改为内容宽；配置 `Ionicons` size 约 16。
  - **Deep-module note**：行为仍收在 SummaryTab；不新开模块。
- **Internal architecture**：无新数据层；Modal 菜单复用页内已有 Modal 模式。
- **Test seam**：RNTL `summary-tab` — 扩展 DateTimePicker mock 转发 `onDismiss`；测取消不改区间；测菜单经 Modal/`range-preset-menu` 仍可选预设；样式断言 gap/图标 size/nowrap（可观察 props）。

## Rework on failure

失败隔离在汇总工具行 UI；导出管道与区间 helper 不动。

## Comments

- 2026-08-04 — trivial 单切（三 AC 同屏同会话）；coverage/feasibility 对照父 bug 内联 PASS；Gate A 随「reviewed 继续」一并推进 → `ready-for-agent`。
- > **Comment** — implemented 2026-08-04; Status → ready-for-human
  > - [x] onDismiss 取消 — `summary-tab.test.tsx::onDismiss cancels day pick without changing the range`
  > - [x] 确认选日不回退 — 既有 `day pick swap…` suite
  > - [x] Modal 层快捷菜单 — `…opens preset choices in a Modal layer above the list`
  > - [x] nowrap / gap / preset padding / icon 16 — `…compacts toolbar…`
  > - Test run: `npx jest src/components/summary-tab.test.tsx --forceExit` → 23 passed, 0 failed
  > - Commit: `275b222`
