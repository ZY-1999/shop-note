# 管理页导入真机收尾（读文件 / 模板示例 / 补货顶栏）

Type: bug
Status: ready-for-agent

## Summary

真机 smoke 发现管理页导入几处未达标：Android（Expo Go）选 xlsx 曾因沙箱读失败、模板无示例、补货段「选择商品补货」与「导入」分行。读文件路径已有探针修法在工作树，仍缺回归测与其余两项收尾。

## Problem Statement

操作员在管理页做会员/商品/补货导入时：

1. **选文件报错**（Android Expo Go，诊断时）：选中合法 xlsx 后 toast 报 `Location '…/cache/DocumentPicker/….xlsx' isn't readable`，无法进入预览。
2. **模板只有表头**：下载的导入模板没有示例行，不知道各列怎么填（等级取值等）。
3. **补货顶栏换行**：「导入」单独在上栏右侧，「选择商品补货」在下一行；期望同一行（左说明、右导入）。

## Reproduction Steps

### A. 选文件不可读（Android Expo Go — 诊断基线）

在**未**采用「`content://` → 拷入体验 `cacheDirectory` → 再读」之前的行为：

1. Expo Go → 管理 → 会员 → 导入。
2. `copyToCacheDirectory: true` 直接对 DocumentPicker 返回的 `…/cache/DocumentPicker/….xlsx` 做 legacy `readAsStringAsync`。
3. 观察 toast：`Location '…' isn't readable`，无预览。

（工作树已含修法时步骤 A 可能不再复现；关闭本 bug 仍须有回归测锁住修法，并真机确认仍可预览。）

### B. 模板无示例

1. 导入子页 →「下载模板」→ 用表格 App 打开。
2. 观察是否仅有表头、无数据示例行。

### C. 补货顶栏

1. 管理 → 补货。
2. 观察「选择商品补货」与「导入」是否分行。

## Expected Behavior

1. 选中合法 xlsx 后进入预览（可导入表 + 失败区），不因 Expo Go 沙箱路径报「isn't readable」。
2. 三类导入模板均含**一行可对照的示例数据**（列与现导出/导入表头一致；等级用合法展示词「普站」/「星站」）。**刻意修订**父 PRD `01-manage-import`「仅表头，无数据行」——改为「表头 + 一行示例」。
3. 补货段第一行：左侧「选择商品补货」，右侧「导入」。

**预览长字段（UX 锁定，非本 bug 缺陷）**：预览表单元格字段超长时以**省略号截断**展示即可；此处只确认大概信息，不要求换行展全文、不要求完整可读。

## Actual Behavior

1. **诊断时**：DocumentPicker 成功（`isXlsx: true`，uri 在宿主 `…/cache/DocumentPicker/…`），legacy `readAsStringAsync` 抛 `isn't readable`。**当前工作树**：已改为 `copyToCacheDirectory: false` + 必要时 `copyAsync` 到体验 `cacheDirectory` 再读；用户真机确认可读；**尚无**针对 `content://` / 作用域外 uri 的回归测，且 `import-form` 测试 mock 未提供 `copyAsync`。
2. 三个 `build*ImportTemplate` **仍**仅写表头、无数据行（与代码一致）。
3. 补货：`filterBar` 仅右侧「导入」；其下另起一行「选择商品补货」（与代码一致）。

## Impact

- **选文件**：曾阻断 Android Expo Go 导入主路径；探针修法已恢复可用，未测回归前仍有回退风险。
- **模板/顶栏**：可用性；非数据损坏。

## Root Cause Hypothesis

1. **读文件（已确认）**：诊断路径下 DocumentPicker `copyToCacheDirectory: true` 把文件落到宿主 `cache/DocumentPicker/`；legacy FileSystem 可读沙箱是体验作用域的 `cacheDirectory`。错位 → permission 失败。`content://` 在 legacy 侧默认可读；拷入作用域 cache 后再读即可。
2. **模板**：父 PRD 原定空表头；真机要求示例 → **需求修订**，非解析 bug。
3. **补货顶栏**：说明文案未放入与「导入」同一 `filterBar` 行。

## Proposed Fix Direction

1. **读文件**：固化探针修法——不依赖 DocumentPicker 自带 cache 路径做 legacy 读；保留 `content://`（或作用域外 uri），`copyAsync` 到体验 `cacheDirectory` 临时文件，再 base64 进入现有 parse/preview。导出管道不变。补齐 mock + 回归测；确认无 `[DEBUG-…]`。
2. **模板（修订父 PRD）**：三个 `build*ImportTemplate` 增加一行示例。
   - **会员**：姓名/电话/备注/等级（展示词）；示例可被 `parseStaffImportWorkbook` + preview 走出 ok 或明确 fail 均可，但列值必须示范合法等级词。
   - **商品**：名称/单价（元）；示例可被 parse；预览 ok 与否不强求（空库时 ok）。
   - **补货**：商品名称/数量。静态示例**通常无法**匹配库内商品 → 下载即预览会进**失败区**（「商品不存在」类原因）是可接受的教学效果；**不要**为此改 preview 去静默跳过示例行。模板备注/文件名说明「示例请改成库内已有商品名或删除」。
3. **补货顶栏**：同一 `filterBar`：左「选择商品补货」、右「导入」。
4. **预览（若顺手）**：可显式 `numberOfLines={1}` + `ellipsizeMode="tail"`，与「省略确认大概」锁定一致；**不要**改成换行展全文。非必须项——现有布局已省略亦可不动。

## Testing Decisions

回归缝：

- **读文件**：扩展 `ImportForm` 测试的 `expo-file-system/legacy` mock，增加 `copyAsync`；用 `content://…`（或不在 mock `cacheDirectory` 前缀下的 uri）断言：先 `copyAsync({ from, to: scoped… })`，再对拷贝目标 `readAsStringAsync`；预览出现。现有「uri 已在 `file:///cache/` 下」用例应**不**调用 `copyAsync`（或等价短路）。
- **模板**：`build-*-import-template` 单测断言表头 + ≥1 行示例；会员/商品示例可被对应 parse 读出；补货示例 parse 出一行即可（不要求 preview ok）。
- **补货顶栏**：restock 视图断言「选择商品补货」与 `restock-import` 同处第一行顶栏。

Done checklist：

- [ ] 真机：选文件可预览；B–C 符合 Expected
- [ ] 上述回归测通过（含 `copyAsync` mock）
- [ ] 无残留 `[DEBUG-…]`
- [ ] 提交说明写明沙箱错位 RCA；Comments/父 PRD 注明模板「表头+示例」修订

## Out of Scope

- 改导出列格式或导入去重/写入语义
- 支持非 xlsx
- 为补货示例自动匹配/创建商品
- 预览单元格换行展全文 / 完整可读长字段（已锁定为省略即可）
- iOS 上未复现的其它选取器问题（另开 bug）

## Further Notes

- 诊断：`/diagnose-bug`；日志 `stage=read`；用户确认探针成功。
- 父特性：`01-manage-import.md`（Stage 4）；本 issue 为真机收尾父 bug。
- **父 PRD 修订点**：`### 模板文件名`「仅表头，无数据行」→「表头 + 一行示例」；User Story「空模板」语义改为「带示例的模板」。
- **预览 UX 锁定（2026-08-04）**：字段超长 → 省略展示；预览只确认大概信息，不展全文。

## Comments

- 2026-08-04 — 真机 smoke + diagnose-bug；对抗评审后修订：区分诊断基线 vs 工作树修法、补货示例允许进 fail 区、标明对父 PRD 模板条款的修订、测试计划补 `copyAsync` mock。
- 2026-08-04 — 对抗评审 PASS；Status → `ready-for-human`，待 Gate 0。
- 2026-08-04 — 更正：预览长字段**应为省略**（确认大概即可），非展全文；从缺陷项中移除，写入 Expected/Out of Scope 锁定。
- 2026-08-04 — Gate 0 通过；`/sdd-flow` 入口翻为 `ready-for-agent`。
