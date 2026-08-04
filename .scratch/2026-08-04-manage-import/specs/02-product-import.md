# 管理·商品导入

Type: spec
Status: ready-for-human
Parent: #01 (01-manage-import.md)
Blocked by: #01（导入壳 + bulk/toast 约定 + useExport 模板模式；不依赖会员去重规则）

## Goal

在已有导入壳与 bulk 约定上增加 `kind=product`：顶栏入口、商品模板与校验、bulk 新建商品。

## Acceptance criteria

- [x] 商品顶栏「导入」在「导出」左侧；进入 `kind=product` — 入口
- [x] 模板 `商品导入模板.xlsx` 仅名称、单价；经同一 `useExport`/`runExport` 管道 — 模板
- [x] 名称 trim：有效/已删除撞名失败（原因区分）；文件内重复失败；只新建不 restore — 去重
- [x] 单价非法/缺必填失败；合法元→分写入 `purchase_price`（与 `formatCentsAsYuan` 对称的 `parseYuanToCents`）— 金额
- [x] 预览/确认「确认导入 n 个商品」/成功回列表 UX 同壳；`useImportProducts` 遵守 Spec #01 bulk 约定（queue、单次 toast/invalidate `qk.products`）— 写入

## Scope

- **In**：商品顶栏导入；`kind=product` 接线；商品模板；`parseYuanToCents`；商品校验；`useImportProducts`；测试。
- **Out**：重写导入壳；会员/补货；改导出。

## Context

- 依赖 #01 壳契约与 bulk 约定。
- 商品导出列：名称、单价（`buildProductWorkbook`）；`ProductRepository.list({ includeVoided: true })`。
- `formatCentsAsYuan` 已在 `src/lib/`。

## Design

- **Interface delta**
  - 壳注册 `kind=product`（列配置、模板 build、preview、confirm label「确认导入 n 个商品」）。
  - `buildProductImportTemplate(): string`；`parseYuanToCents(yuan: string): Cents | error`。
  - `previewProductImport(...)`；`useImportProducts()` — **同 #01 bulk 约定**；invalidate `qk.products`。
- **Deep-module note**：金额逆变换单源；壳不重写。
- **Internal architecture**：不改会员校验；不循环 `useCreateProduct`。
- **Test seam**：`parseYuanToCents` + 商品预览 Jest；**模板 build 表头 + useExport job 入参**；RNTL 商品入口与确认；金额对称断言。

## Rework on failure

失败隔离在商品 kind + 金额 parse。壳与会员不动。

## Comments

- 2026-08-04 — skeleton + design from candidate-2（judge R2 PASS）。
- 2026-08-04 — implemented via `/tdd`；Status → `ready-for-human`
  - [x] 入口 — `manage-tab.test.tsx::shows 导入 left of 导出 on product…`（`kind=product`）
  - [x] 模板 — `build-product-import-template.test.ts::emits header-only…` + `import-form.test.tsx::downloads product template via useExport…`（`商品导入模板.xlsx`）
  - [x] 去重 — `preview-product-import.test.ts` happy + validation failures（有效/已删除/文件内重复）
  - [x] 金额 — `parse-yuan-to-cents.test.ts`（合法 / 对称 `formatCentsAsYuan` / 缺必填与非法）+ preview 写入 `purchase_price`
  - [x] 写入 — `import-form.test.tsx::downloads product template…`（单次 toast / back / 无「商品已创建」）+ `::mid-fail…`（前缀保留 + toast.error）；`useImportProducts` → `qk.products`
  - Test run: `npx jest src/lib/parse-yuan-to-cents.test.ts src/import/build-product-import-template.test.ts src/import/preview-product-import.test.ts src/import/parse-product-import-workbook.test.ts src/components/import-form.test.tsx src/components/manage-tab.test.tsx --forceExit` → 53 passed, 0 failed（含 #01/#03 回归）
  - Commit: _(filled after commit)_
  - **待真机**：DocumentPicker 选文件 + 模板分享手验
