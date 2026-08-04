# 商品选择搜索框补 paddingVertical

Type: spec
Status: ready-for-human
Parent: #01 (01-items-selector-search-height.md)
Blocked by: None — can start immediately

## Goal

商品选择组件搜索框垂直内边距与管理·商品搜索框一致（`paddingVertical: 8`）。

## Acceptance criteria

- [x] 商品选择搜索输入样式 `paddingVertical === 8`
- [x] 不改变 chip / 已选行 / 步进器样式与选品行为

## Scope

- **In**：商品选择组件搜索 `TextInput` 的垂直 padding。
- **Out**：管理页；共享 theme token；testID / placeholder / 搜索逻辑。

## Context

- 父 PRD：`.scratch/2026-08-04-items-selector-search-height/01-items-selector-search-height.md`
- 基准：管理页 `searchInput.paddingVertical: 8`
- 今日：选择器 `input` 无 `paddingVertical`
- Prior art：ItemsSelector `marginTop` / toolbar compact 样式断言

## Design

- **Interface delta**
  - 选择器搜索输入样式增加 `paddingVertical: 8`（与管理商品搜索对齐）；其余边框/字号/水平 padding 保持。
  - **Deep-module note**：单点样式，无新 API。
- **Internal architecture**：无。
- **Test seam**：组件测试 `StyleSheet.flatten(product-search style).paddingVertical === 8`（出库或补货入口渲染均可）。

## Rework on failure

失败隔离在该样式一行；单独重做。

## Comments

- 2026-08-04 — Evidence:
  - AC1–AC2: `src/components/record-form.test.tsx` — `ItemsSeletor — search input height / matches manage product search paddingVertical 8`（line density 回归仍绿）
  - PASS: `npx jest src/components/record-form.test.tsx -t "search input height|selected line density" --forceExit` — 2 passed
  - Commit: 本条关闭提交
