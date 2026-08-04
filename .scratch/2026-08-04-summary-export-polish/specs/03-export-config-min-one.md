# 导出配置：至少保留一项

Type: spec
Status: ready-for-human
Parent: #01 (01-summary-export-polish.md)
Blocked by: None — can start immediately

## Goal

汇总导出配置不能把四项 sheet 全部关掉；关最后一项时拒绝变更。

## Acceptance criteria

- [ ] 可关闭任意非最后一项，剩余选择正常持久化
- [ ] 尝试关闭最后一项时开关保持开，配置始终 ≥1 项选中
- [ ] 存在合法选择时导出按钮可用（不再能进入「四项全关」配置态）

## Scope

- **In**：summary-tab 导出配置 toggle 路径 + UI 测试。
- **Out**：ConfigRepository 强制拒绝 bitmask 0（可选不强制）；workbook「（暂无）」sheet；其它导出页。

## Context

- 今日可关全四项，导出按钮因 `anySheetSelected` 禁用。
- 既有测试：全关禁用导出 — 本 spec 改为配置层挡死全关。

## Design

- **Interface delta**
  - `toggleSheet(key, value)`：若 `value === false` 且关掉后 `Object.values(next).every(v => !v)`，则 no-op（不 mutate / 不写 config）。
  - 导出按钮逻辑可保留 `anySheetSelected` 作防御；正常路径下恒为 true。
  - **Deep-module note**：下限只在 UI toggle；仓库层仍可接受 0（历史/测试），不强制 schema 变更。
- **Internal architecture**
  - 更新/替换既有「全关禁用导出」测试为「关最后一项无效 + 仍可导出」。
- **Test seam**：`summary-tab.test.tsx` 导出配置 suite。

## Rework on failure

失败隔离在 toggle 守卫；单独重做。
