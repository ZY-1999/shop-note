# 管理页会员 / 商品 / 补货导入

Type: prd
Status: ready-for-agent

## Problem Statement

操作员需要批量录入会员、商品，以及按进货清单批量补货。当前只能在管理页逐条新建；会员/商品已有 xlsx 导出却没有导入入口，从表格整理好的主数据/进货明细无法一次进系统（补货段今天无导出，本 feature 仍提供导入）。

## Solution

在管理·**会员**、**商品**、**补货**三段顶栏第一行右侧提供「导入」：进入导入子页 → 下载空模板 / 选择 `.xlsx` → **先预览再确认**。预览展示可导入行的表格与数量，底部列出失败行（原因可展开）。确认文案形如「确认导入 n 个会员」，写入后 toast 并返回列表。

## User Stories

1. 作为操作员，我想在管理·会员顶栏点「导入」进入子页，以便批量导入会员。
2. 作为操作员，我想在管理·商品顶栏点「导入」进入子页，以便批量导入商品。
3. 作为操作员，我想在管理·补货顶栏第一行右侧点「导入」进入子页，以便按表批量入库。
4. 作为操作员，我想在会员/商品顶栏看到「导入」在「导出」左侧（右区：导入｜导出），以便两个动作都在第一行靠右。
5. 作为操作员，我想下载对应空模板 xlsx，以便按列填好再导入。
6. 作为操作员，我想选择本地 xlsx 文件开始校验，以便不立刻改库。
7. 作为操作员，我想看到可导入行的表格与条数，以便确认写入内容。
8. 作为操作员，我想在底部看到导入失败行及原因，点开可看详情，以便改表再导。
9. 作为操作员，我想点「确认导入 n 个…」只写入可导入行，失败行永不写入。
10. 作为操作员，我想确认成功后得到提示并回到该段管理列表，以便立刻看到新数据。
11. 作为操作员，我想会员按**姓名**去重：有效或已删除同名均失败，原因写清（如已存在 / 已存在（已删除））。
12. 作为操作员，我想商品按**名称**去重，规则同会员（含已删除撞名失败）。
13. 作为操作员，我想补货按**商品名称**匹配**有效**商品；不存在或已删除 → 该行失败并写明原因。
14. 作为操作员，我想补货模板每一行对应**一笔**补货单（单商品+数量）；文件内同名商品重复行后者失败。
15. 作为操作员，我想补货模板不含备注列，而在待确认页填**整批共用备注**，写入本次确认的每一笔补货。
16. 作为操作员，我想会员模板列为：姓名、电话、备注、等级（普站/星站；空=普站）。
17. 作为操作员，我想商品模板列为：名称、单价（元，两位小数）。
18. 作为操作员，我想补货模板列为：商品名称、数量。
19. 作为操作员，我想只支持 `.xlsx`（与现有导出库一致），不要 CSV。
20. 作为操作员，我想导入只做新建，不要按表更新已有有效行。
21. 作为操作员，我不想导入把已删除行自动恢复。
22. 作为操作员，我想姓名/名称去空白后匹配；缺必填、单价/数量非法、等级非法文案 → 该行失败。
23. 作为开发者，我想模板下载复用现有 `runExport`/`useExport` 管道。
24. 作为开发者，我想解析/校验为可单测的纯逻辑；确认写入走 **MutationQueue 门控的 bulk mutation**（顺序 create、单次 invalidate、单次成功 toast），中途失败则已写入保留 + `toast.error`。
25. 作为操作员，我不想导入姓名为「管理员」或与系统管理员行同名的会员（该行失败并写明保留名原因）。

## Implementation Decisions

### 与导出的关系

- 本 feature **新建**导入能力；不改动导出列契约。manage-export 曾将「导入」列为 Out of scope，由本 PRD 承接。
- 复用 `xlsx@0.18.5` 读表；模板写出与导出相同 MIME/`encoding: 'base64'` + `useExport`。
- 金额：商品单价元 ↔ 分用既有 `formatCentsAsYuan` 的逆操作（纯函数，新建如 `parseYuanToCents`），与展示单源对称。

### UI / 导航

- 会员/商品第一行：左「包含删除」不变；右 **导入｜导出**。
- 补货：新增第一行工具条，右侧「导入」（无导出）。
- 子页：Expo Router **根 Stack 兄弟屏**（与 `record-form` / `topup-form` 同级，非 manage tab 内嵌 stack），query/`kind: staff|product|restock`；含下载模板、选文件、预览区、确认钮；补货 kind 在确认区多一个备注输入。
- 选文件：SDK 57 用 `expo-document-picker`（实施时 `npx expo install`）；取消选择不算错误。
- 失败列表：摘要一行 + 点击展开详情（行号、原因、可选原始单元格摘要）。
- 确认成功：由 **bulk import mutation** 发一次成功 `toast` → `router.back()`；确认写入中途失败：一次 `toast.error`，留在预览页（**不**复用逐条 `useCreateStaff` 等，以免 n 次「已创建」toast）。

### 校验与去重

- 匹配键：会员=`姓名` trim；商品=`名称` trim；补货查找商品=`商品名称` trim，且 `voided_at == null`。
- 会员撞名扫描：`StaffRepository.list({ includeVoided: true })`（该 API **恒排除** `-1`）。另：**禁止**导入姓名等于管理员保留名（与种子「管理员」或 `getById('-1').name` 相同，trim 后）→ 失败，原因如「保留名（管理员）」——避免 list 漏检导致再造可管理的「管理员」。
- 商品撞名：`ProductRepository.list({ includeVoided: true })` 全表（无管理员特例）。
- 撞名：库中同名有效或已删除 → 失败；原因区分有效 vs 已删除。
- 文件内：同名键第二次及以后 → 失败（重复行）。
- 只新建：有效同名不 update；已删除不 restore。
- 补货：一行 → 一笔 `direction: 'in'`、`staff_id: '-1'`、单条目；`timestamp = Date.now()`（确认时）；备注=确认页整批备注（可空）。

### 写入

- 新增（或等价）**bulk import mutation hooks**（如 `useImportStaff` / `useImportProducts` / `useImportRestocks`）：在 `MutationQueue.run` 内顺序调用对应 `Repository.create`；全部成功后 **一次** `invalidateQueries`（会员→`qk.staff`；商品→`qk.products`；补货→与 `useCreateStockRecord` 相同家族）+ **一次**成功 toast；中途抛错则 `toast.error`，已写入前缀保留。
- **不**在确认路径循环调用现有 `useCreateStaff` / `useCreateProduct` / `useCreateStockRecord`（它们每条成功都会 toast，且不宜在 UI 层绕开 queue 直调 repo）。
- **不**做跨行嵌套 `withTransaction`（port 不可重入）。

### 模板文件名（建议）

- `会员导入模板.xlsx` / `商品导入模板.xlsx` / `补货导入模板.xlsx`（表头 + 一行示例；2026-08-04 #02/#05 修订，原「仅表头」）。

## Testing Decisions

- 测行为不测实现细节；优先纯函数解析/校验 + RNTL 子页流程。
- **解析/校验纯函数**（data 或 `src/import/`）：合法行、缺列、撞名（有效/已删除）、文件内重复、等级非法、单价/数量非法、补货商品不存在/已删除；InMemory 造库态。
- **模板 build**：表头形状；经 `useExport` 可测 job 入参（IO mock 同导出）。
- **RNTL**：顶栏导入按钮位置（会员/商品有导入+导出；补货有导入）；选文件后预览成功表+失败区；确认文案含 n；确认后列表出现新行（真实 InMemory）；取消选文件无 toast 错。
- **真机**：DocumentPicker + 分享模板 + 真实文件预览 — 手验；Jest 不覆盖系统选文件 UI。
- Prior art：manage-export 的 xlsx/`runExport` mock、`manage-tab` RNTL、ADR-0006。

## Out of Scope

- CSV / 图片导入；会员/商品 upsert 或导入时 restore。
- 配置段、记账出库/充值导入；流水/库存导入。
- 导出列变更；Web。
- 确认前勾选子集；整批全有或全无事务 API。
- 改 void/restore 语义；清库。

## Further Notes

- Grill（2026-08-04）：预览后确认 ✓；只新建 ✓；姓名/名称去重 ✓；补货一行一单 ✓；会员/商品 xlsx 列与导出对齐、补货模板独立 ✓；补货备注在确认页 ✓；顶栏右导入｜导出、补货右导入 ✓；已删除撞名失败（不恢复）✓；确认写全部可导入行、钮文案只含数量 ✓；预览成功区表格+数量 ✓；成功回列表、模板走导出管道 ✓；顺序写入 A ✓。
- 对抗评审修正：管理员保留名显式失败；确认走 bulk mutation（queue + 单次 toast/invalidate），非循环 useCreate*。
- 展示词「单价」与导出一致；域字段仍 `purchase_price`。

## Comments

- 2026-08-04 — grill 完成。
- 2026-08-04 — 对抗评审 PASS；Status → `ready-for-human`，待 Gate 0。
- 2026-08-04 — Gate 0 通过；`/sdd-flow` 入口翻为 `ready-for-agent`。
- 2026-08-04 — 三切片落地 + Stage 4；Standards 硬伤（ManageTab router）已修；DocumentPicker 待真机。
