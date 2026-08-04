# 商品选择搜索框高度对齐商品管理

Type: prd
Status: ready-for-agent

## Problem Statement

出库/补货里的商品选择组件搜索框，视觉高度与管理页「商品」段搜索框不一致（偏矮），同一应用内搜索控件观感不统一。

## Solution

把商品选择组件搜索框的垂直内边距与管理页商品搜索框对齐，使高度一致。

## User Stories

1. As an 操作员, I want 补货/出库的商品搜索框与管理·商品搜索框一样高, so that 界面密度一致、不显得一边挤一边松。
2. As an 操作员, I want 只改搜索框高度相关样式, so that 选品、chip、已选行行为不变。

## Implementation Decisions

- **对照基准**：管理页商品列表搜索框样式（`paddingVertical: 8`、`paddingHorizontal: 12`、`fontSize: 15`、`borderRadius: 8`、`borderWidth: 1`）。
- **今日差距**：商品选择组件搜索输入有水平 padding 与字号，**缺 `paddingVertical: 8`**（Android 上易显得更扁）；补上以对齐基准。
- **范围**：仅商品选择组件的商品搜索输入样式；不改 chip、已选行、步进器；不改管理页。
- **不必**抽共享 theme token（本需求是一次对齐）；若后续多处搜索框再收敛。

## Testing Decisions

- 外部行为：断言商品选择搜索框 `paddingVertical === 8`（与管理商品搜索同值）；prior art：toolbar compact / ItemsSelector line `marginTop` 样式断言。
- 不测视觉截图。

## Out of Scope

- 统一全应用所有 TextInput 高度。
- 改搜索逻辑、testID、placeholder 文案。
- 管理页搜索框改动。

## Further Notes

- 触发场景：出库/补货共用商品选择组件。
- 两端均可能使用 `product-search` testID——本 PRD 不处理 ID 冲突。

## Comments

- 2026-08-04 — /route → /to-prd；对抗评审 PASS；Gate 0 待确认。
- 2026-08-04 — Gate 0 确认；Status → ready-for-agent；进入 /sdd-flow。
- 2026-08-04 — /to-spec：单 spec（paddingVertical: 8）；待 Gate A。
- 2026-08-04 — Gate A 确认并实现；双轴自检：仅样式一行，无范围蔓延。
