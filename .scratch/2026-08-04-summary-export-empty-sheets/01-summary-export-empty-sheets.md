# 汇总导出：后两 sheet 无数据行 / 导出中可取消

Type: bug
Status: ready-for-human

## Summary

全选导出时「充值出库」「充值出库明细」无会员数据行（或仅表头+合计，首条内容落在第 2 行）；「导出中…」覆盖系统分享框，取消分享易被当成取消导出。

## Problem Statement

操作员全选 sheet 导出后，后两个会员 sheet 看不到充值/出库数据行；同时导出按钮长时间停在「导出中…」，期间取消分享框行为含混。

## Reproduction Steps

1. 汇总页选有会员充值/出库的时段（页面「出库」或「充值」合计 > 0）。
2. 导出配置四 sheet 全选 → 点导出 → 用表格 App 打开。
3. 查看「充值出库」「充值出库明细」：无会员数据行；合计在第 2 行。
4. 导出过程中点系统分享框取消。

## Expected Behavior

1. 与页面同窗：有会员充值/出库则两 sheet 有对应数据行，表头在第 1 行。
2. 「导出中…」仅覆盖 build+写文件；分享框打开后不再占用「导出中」语义（取消分享 ≠ 导出失败/截断）。

## Actual Behavior

1. 后两 sheet 无数据行（或仅表头+合计）。
2. isPending 贯穿分享框，取消分享时按钮仍像在「导出中」。

## Impact

对账导出不可用/易误判；无数据损坏。

## Root Cause Hypothesis

1. 会员 sheet 数据与页面流水同窗对齐不够硬（build 另查 ledger）；空窗时仅表头+合计，合计落在 Excel 第 2 行，被描述为「行号不是 1」。
2. `runExport` 把 share 算进同一 mutation pending，分享取消与导出完成语义缠在一起。

## Proposed Fix Direction

1. 导出走与页面相同的 range 快照（优先已加载的 records/topups/staff；必要时再 list），会员 sheet 与 `out`/`topup` 合计交叉校验（页面有金额但行空则失败 toast）。
2. `runExport`：build+write 完成后结束 pending，再调 share；取消分享仍不 toast 失败。

## Testing Decisions

- `run-export`：write 完成后即返回 uri；share 取消仍吞掉。
- `summary-tab`：有会员出库时全选导出，后两 sheet 含数据行且 `!ref` 以 A1 起；页面有出库合计则不得导出空会员 sheet。

## Out of Scope

改 sheet 列口径、改文件名规则、其它页导出。

## Comments

- 2026-08-04 — 用户补充：全选时后两 sheet 无数据行，且第一行行号不是 1。
- 2026-08-04 — implemented: 导出与页面同窗快照；页面有金额但明细空则 toast；`useExport` pending 仅 build+write，分享异步不占「导出中」。
- Test run: `npx jest src/export/run-export.test.ts src/components/summary-tab.test.tsx src/components/manage-tab.test.tsx -t "export|…" --forceExit` → 23 passed
- Commit: `af217bd`
