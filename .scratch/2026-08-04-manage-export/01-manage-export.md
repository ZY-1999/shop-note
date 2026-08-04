# 管理页会员/商品导出（含「包含删除」筛选）

Type: prd
Status: ready-for-agent

## Problem Statement

操作员需要把管理页的会员、商品主数据导出到 Excel，便于备份、外发或在电脑上编辑对照。当前没有任何真实导出入口；列表在非搜索时还**始终**带出已删除行，缺少「默认只看有效、需要时再含删除」的控制。已有「导出管道」PRD（`.scratch/2026-07-11-export-pipeline/`）批准了公共落盘+分享能力，但未实现、也未接任何业务导出。

## Solution

1. **落地导出管道**（吸收既有 export-pipeline PRD）：`ExportJob` + `runExport` + `useExport`，经系统分享面板交付文件。
2. **管理·会员 / 管理·商品** 各增加顶栏控件：左「包含删除」（默认关），右「导出」。
3. **列表与导出共用筛选**：关 = 仅有效；开 = 含已删除（可恢复）。搜索时同样尊重该开关。
4. **导出两个独立 `.xlsx` 文件**（分段各自点导出）：`会员-YYYYMMDD.xlsx` / `商品-YYYYMMDD.xlsx`；金额用元、两位小数；商品列展示词「单价」（与页面一致）。

## User Stories

1. 作为操作员，我想在管理·会员顶栏打开「包含删除」，以便看到并恢复已删除会员。
2. 作为操作员，我想「包含删除」默认关闭，以便日常列表只看有效会员/商品。
3. 作为操作员，我想在管理·商品顶栏同样有「包含删除」，行为与会员段一致。
4. 作为操作员，我想搜索时也尊重「包含删除」，以便在开/关两种集合里都能搜到目标。
5. 作为操作员，我想在会员段点「导出」得到 Excel，以便备份或外发会员主数据。
6. 作为操作员，我想在商品段点「导出」得到另一份 Excel，以便备份商品主数据。
7. 作为操作员，我想导出范围与当前「包含删除」一致，以免导出与屏幕所见不一致。
8. 作为操作员，我想会员表含姓名、电话、备注、等级；勾选包含删除时再加「状态」列（有效/已删除）。
9. 作为操作员，我想商品表含名称、单价（元）；勾选包含删除时再加「状态」列；不要编码/分类（页面未透出）。
10. 作为操作员，我想文件名带当天日期（`会员-YYYYMMDD.xlsx` / `商品-YYYYMMDD.xlsx`），以便区分多次导出。
11. 作为操作员，我想导出后弹出系统分享面板，以便存到文件/发给别人。
12. 作为操作员，我想导出中按钮不可重复点、失败有错误提示；取消分享不算错误。
13. 作为操作员，我不想导出里出现管理员 `-1`。
14. 作为开发者，我想后续其它导出（流水/库存）只写 `build` 即可挂上同一管道。

## Implementation Decisions

### 与既有导出管道 PRD 的关系

- 本 PRD **一次性交付**：① 管道（`ExportJob` / `runExport` / `useExport`）② 会员/商品 xlsx `build` ③ 管理 UI 筛选+导出。
- 既有 [export-pipeline PRD](../2026-07-11-export-pipeline/01-export-pipeline.md) 的管道设计（含测试 seam、取消分享、cacheDirectory、不主动清理）**原样吸收**为本 PRD 实施依据；不再单独先 ship 空管道。该文件 Status 在 Gate 0 后可标为被本 feature 吸收（或 Comments 互链），避免双轨实现。

### 依赖

- `expo-file-system` + `expo-sharing`（`npx expo install`，SDK 57 对齐）。
- Excel：选用可在 RN/Expo 下产出 xlsx **base64** 的库（实施时查 SDK 57 / 社区惯例锁定具体包名，如 SheetJS 社区版或等价；以「Jest 可测纯 `build` + 管道写盘分享」为准）。
- **iOS 分享 `.xlsx`**：build 阶段查 SDK 57 文档，确认是否需配置 UTI / `infoPlist`（export-pipeline 留给「第一个真实 Excel 导出」的开放项，本 PRD 承接；未确认前不假设零配置）。
- 装依赖后必须 `expo start --clear`（PROJECT_KNOWLEDGE）。
- 纯移动端：禁止 Web Blob/`<a download>`。

### 数据层：search 尊重 includeVoided

- 今日：`StaffRepository.search` / `ProductRepository.search` **只扫有效**；管理非搜索路径却 `includeVoided: true`。
- 本 feature：`search` 增加可选 `includeVoided?: boolean`（默认 false）；`list` 行为不变。
- `useStaff` / `useProducts`：有搜索文案时把当前「包含删除」传入 search；无搜索时传入 list 的 `includeVoided`。
- 列表默认 `includeVoided: false`（**行为变化**：已删除默认隐藏）。
- 会员导出/列表始终排除 `ADMIN_STAFF_ID`（`-1`）。

### Excel 内容

- **会员列**：姓名、电话、备注、等级（展示词走 `labelForLevel`，如星站/普站）。含删除时追加「状态」：`有效` / `已删除`（由 `voided_at` 派生）。
- **商品列**：名称、单价。单价 = `purchase_price` 转元、两位小数（展示词「单价」，非「进价」）。含删除时追加「状态」。
- **不含**：内部 id、编码、分类、创建/作废时间戳。
- **行集**：与当前列表同一筛选结果（同一 `includeVoided` + 当前搜索文案）；导出不另开第二套过滤。
- **工作簿**：每文件一 sheet 即可；两个独立文件，非双 sheet 合一。

### 金额纯函数

- 抽出 `cents → 元字符串/数字` 的纯函数（供 `build` 与可选地给 `MoneyText` 后续共用）；本 PRD 至少让导出 `build` 使用该纯函数，避免在 build 里手写 `/100`。

### UI（管理·会员 / 管理·商品）

- 列表顶栏同一行：左「包含删除」开关（默认关），右「导出」按钮。
- 不进入创建/编辑表单；补货/配置段无此控件。
- 导出：`useExport().mutate(ExportJob)`；`isPending` 时禁用导出钮；失败走 **`toast.error`**（与 `mutations.ts` 管理页 void/restore 等一致）。**不用** `Alert`（全库无此模式）。表单校验仍用行内 `Text` error，与导出失败通道分开。
- 文件名：`会员-${YYYYMMDD}.xlsx` / `商品-${YYYYMMDD}.xlsx`（设备本地日）。

### 管道契约（自 export-pipeline 吸收，摘要）

```
ExportJob {
  filename, mimeType, encoding: 'base64' | 'utf8',
  build: () => string | Promise<string>,
  dialogTitle?: string
}
```

- xlsx 用 `encoding: 'base64'` + 对应 spreadsheet MIME。
- 用户取消分享不 throw；分享不可用 / build / 写盘失败 throw 给 UI。

## Testing Decisions

- **行为测，不测实现细节**（ADR-0006 / 管道 PRD）。
- **管道 `runExport`**：data project + `jest.mock` expo-file-system / expo-sharing（mock 写在 import 前）；覆盖正常路径、用户取消、真错误、分享不可用、build 抛错（承接 export-pipeline 测试决策）。
- **xlsx build 纯函数**：InMemory 造会员/商品（含 voided、排除 `-1`、等级标签、单价元格式、状态列有无）；不 mock IO。
- **管理 UI（RNTL + 真实 InMemory）**：默认不含已删除；打开开关列表出现已删除+恢复；搜索+开关组合；点导出触发 mutation（可 mock `runExport`/`useExport` 的 IO 边界，或断言 build 入参行集——以最少新 seam 为准）；补货/配置无导出控件。
- Prior art：export-pipeline PRD 测试节；`manage-tab.test.tsx`；`staff.test.ts` search/list。
- **真机**：分享面板弹起 + 打开 xlsx 可读 —— device smoke / 手验（ADR-0004），Jest 不覆盖。

## Out of Scope

- 流水 / 库存 / 汇总 / 充值导出（后续挂同一管道）。
- CSV、图片导出。
- 会员/商品导入、Excel 往返编辑写回。
- 编码/分类列、审计时间列。
- 改变作废/恢复业务规则；不清库。
- Web。
- 主动清理 cache 文件；错误类型细分。

## Further Notes

- Grill（2026-08-04）：Excel ✓；两独立文件 ✓；「包含删除」默认关、列表+导出+搜索共用 ✓；会员列姓名/电话/备注/等级+可选状态 ✓；商品列名称/单价+可选状态、无编码分类 ✓；顶栏左筛右导 ✓；金额元两位小数 ✓；文件名带日期 ✓；接受默认隐藏已删除的行为变化 ✓。
- 展示词「单价」vs 域词进价/`purchase_price`：导出表头用「单价」；标识符不改。
- 等级展示跟 `STAFF_LEVELS`（当前「星站」）。

## Comments

- 2026-08-04 — grill 完成。
- 2026-08-04 — 对抗评审：修正「Alert」→ toast；承接 iOS xlsx UTI 核对项。PASS 后 Status `ready-for-human`，待 Gate 0。
- 2026-08-04 — Gate 0 通过；`/sdd-flow` 入口翻为 `ready-for-agent`。
- 2026-08-04 — 四条 spec 落地 + Stage 4；真机 smoke（分享 + 打开 xlsx）用户确认 PASS。
