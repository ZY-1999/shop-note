# 商品 xlsx build + 管理·商品导出

Type: spec
Status: ready-for-human
Parent: #01 (01-manage-export.md)
Blocked by: #01, #02, #03

## Goal

管理·商品顶栏「导出」产出与当前筛选一致的 `商品-YYYYMMDD.xlsx`，复用管道、金额纯函数与 #03 已锁定的 xlsx/UTI。

## Acceptance criteria

- [x] 纯 `build`：列名称、单价（元两位小数，表头「单价」）；含删除时「状态」；无编码/分类/id —— InMemory 可测
- [x] 导出行集与当前开关+搜索一致
- [x] 点导出走 `useExport`；pending 禁用；失败 toast.error；取消分享非错误
- [x] 文件名 `商品-YYYYMMDD.xlsx`
- [x] 补货 / 配置段无导出控件
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
- 2026-08-04 — implemented via `/tdd`；Status → `ready-for-human`；复用 #03 `xlsx@0.18.5`（未新选库；出站分享不改 `app.json`）
  - [x] 列名称/单价/状态/无编码·分类·id — `build-product-workbook.test.ts::emits 名称/单价…` + `::appends 状态…` + `::never emits 编码/分类/id…`
  - [x] 行集与开关+搜索一致 — `manage-tab.test.tsx::export job filename is 商品-YYYYMMDD.xlsx; build rows match current list (switch+search)`
  - [x] useExport / pending / toast.error / 取消不 toast — `manage-tab.test.tsx::disables 导出 while pending…`（product export describe）
  - [x] 文件名 — `build-product-workbook.test.ts::names the file 商品-YYYYMMDD.xlsx…` + 上条 manage-tab（`productExportFilename()`）
  - [x] 补货/配置无导出 — `manage-tab.test.tsx::shows 导出 on product; restock/config have none`（+ staff describe 同断言）
  - [ ] 手动真机 — 待真机（可与 #03 合并 smoke；UTI 决策同 #03）
  - Test run: `npx jest src/export/build-product-workbook.test.ts src/export/build-staff-workbook.test.ts src/export/run-export.test.ts src/lib/format-cents-as-yuan.test.ts src/components/manage-tab.test.tsx --forceExit` → 48 passed, 0 failed
  - Lib: `xlsx@0.18.5`（reused from #03）
  - Commit: `b491362`
