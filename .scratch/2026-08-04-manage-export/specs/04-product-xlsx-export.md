# 商品 xlsx build + 管理·商品导出

Type: spec
Status: ready-for-agent
Parent: #01 (01-manage-export.md)
Blocked by: #01, #02, #03

## Goal

管理·商品顶栏「导出」产出与当前筛选一致的 `商品-YYYYMMDD.xlsx`，复用管道、金额纯函数与 #03 已锁定的 xlsx/UTI。

## Acceptance criteria

- [ ] 纯 `build`：列名称、单价（元两位小数，表头「单价」）；含删除时「状态」；无编码/分类/id —— InMemory 可测
- [ ] 导出行集与当前开关+搜索一致
- [ ] 点导出走 `useExport`；pending 禁用；失败 toast.error；取消分享非错误
- [ ] 文件名 `商品-YYYYMMDD.xlsx`
- [ ] 补货 / 配置段无导出控件
- [ ] **[手动]** 真机分享 + 打开 xlsx（可与 #03 合并一次 smoke）

## Scope

- **In**：商品 workbook `build`；管理·商品顶栏右「导出」；复用 #03 库与 UTI。
- **Out**：新选 xlsx 库；改会员导出；改筛选/管道。

## Context

- #02 `formatCentsAsYuan`；#03 已锁定库与 iOS 配置。
- 页面展示词「单价」；域字段 `purchase_price`。

## Design

- **Interface delta**
  - `buildProductWorkbook(rows: Product[], opts: { includeVoided: boolean }): string`（base64）
  - 列：名称、单价（`formatCentsAsYuan(purchase_price)`）；含删除时追加「状态」。
  - UI：商品顶栏右「导出」，文件名 `商品-${YYYYMMDD}.xlsx`；行为同会员段。
- **Deep-module note**：与会员 build 对称；单价格式单一来源 #02。
- **Internal architecture**：不重新引入库选型；不碰补货/配置。
- **Test seam**：纯 build Jest；RNTL 商品导出 + 补货/配置无按钮。

## Rework on failure

失败隔离在商品 build + 商品段 UI。会员导出与管道不动。

## Comments

- 2026-08-04 — skeleton + design from candidate-3（judge PASS）。
