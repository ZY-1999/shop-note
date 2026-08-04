# 管理·补货导入

Type: spec
Status: ready-for-human
Parent: #01 (01-manage-import.md)
Blocked by: #01（导入壳含确认区扩展点 + bulk/toast 约定；不 Blocked-by #02）

## Goal

在已有壳与 bulk 约定上增加 `kind=restock`：补货顶栏导入、一行一单、确认页整批备注后 bulk 入库。

## Acceptance criteria

- [x] 补货第一行工具条右侧仅「导入」；进入 `kind=restock` — 入口
- [x] 模板 `补货导入模板.xlsx` 列：商品名称、数量（无备注列）；经同一 `useExport`/`runExport` 管道 — 模板
- [x] 经 #01 确认区扩展点注入整批备注（可空）写入本次每一笔补货；确认文案「确认导入 n 个…」含可导入条数 — 备注与确认
- [x] 商品名称 trim 匹配**有效**商品；不存在/已删除失败；数量非法失败；文件内同名后者失败；一行一笔 `in`/`-1`/单条目 — 校验与语义
- [x] 确认只写可导入行；`useImportRestocks` 同 #01 bulk 约定；invalidate 与 `useCreateStockRecord` 同家族；成功 toast + 回列表 — 写入
- [x] 测试用 InMemory **自备有效商品 seed**（不依赖 #02 先导入）— fixture

## Scope

- **In**：补货顶栏导入；`kind=restock`；补货模板；校验；经壳扩展点接确认备注；`useImportRestocks`；测试。
- **Out**：重写壳（扩展点已由 #01 提供）；商品/会员导入；补货导出；多商品合成一单。

## Context

- 依赖 #01 壳（含 `confirmExtra` 扩展点）与 bulk 约定；**不**依赖 #02。
- 补货 UI 今日无 filterBar；`RestockManage` + `ADMIN_STAFF_ID`；`StockRecordRepository.create` `direction:'in'`。
- 匹配仅 `voided_at == null` 商品。

## Design

- **Interface delta**
  - 壳注册 `kind=restock`：经 #01 **`confirmExtra`** 注入整批备注输入；确认时 `timestamp=Date.now()`；备注灌入每笔 create。不重写壳其它结构。
  - `buildRestockImportTemplate(): string`；`previewRestockImport(rows, activeProducts[])`。
  - `useImportRestocks()` — **同 #01 bulk 约定**；每行 create `{ staff_id:'-1', direction:'in', items:[{product_id, qty}], note? }`。
- **Deep-module note**：一行一单失败隔离；备注在确认页非整表列。
- **Internal architecture**：fixture 自备商品；不循环 `useCreateStockRecord`。
- **Test seam**：预览匹配/失败 Jest；**模板 build 表头 + useExport job 入参**；RNTL 补货入口 + 备注写入 + 确认文案含 n。

## Rework on failure

失败隔离在补货 kind。壳与商品切片不动。

## Comments

- 2026-08-04 — skeleton + design from candidate-2（judge R2 PASS）；接 #01 confirmExtra 扩展点。
- 2026-08-04 — implemented via `/tdd`；Status → `ready-for-human`
  - [x] 入口 — `manage-tab.test.tsx::toolbar 导入 opens import-form with kind=restock…` + staff-export suite restock 导入断言
  - [x] 模板 — `build-restock-import-template.test.ts` + `import-form.test.tsx::downloads restock template…`（`补货导入模板.xlsx` / useExport）
  - [x] 备注与确认 — `import-form.test.tsx::downloads restock template…`（`import-batch-note` → 每笔 note；文案「确认导入 2 笔补货」）
  - [x] 校验与语义 — `preview-restock-import.test.ts` happy + validation；confirm 写入 `in`/`-1`/单条目
  - [x] 写入 — `useImportRestocks`（同家族 invalidate）；单次 toast「已导入 n 笔补货」+ back；无 n 次「记录已保存」
  - [x] fixture — restock RNTL seed 自备 `products.create`（不依赖 #02）
  - Test run: `npx jest src/import/preview-restock-import.test.ts src/import/build-restock-import-template.test.ts src/import/parse-restock-import-workbook.test.ts src/components/import-form.test.tsx src/components/manage-tab.test.tsx --forceExit` → 46 passed, 0 failed
  - Commit: *(filled on close)*
  - **待真机**：DocumentPicker 选补货表 + 模板分享手验
