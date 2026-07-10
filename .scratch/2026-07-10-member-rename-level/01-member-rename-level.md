# 会员化改名 + 会员等级（Member Rename & Level）

Type: prd
Status: ready-for-agent

## 问题陈述

shop-note 里店铺操作对象的展示词一直是「员工」，但运营者的实际心智是「会员」——他们是在管理店铺的会员/客户，"员工"是用词不准（代码标识符沿用 `Staff` 即可，无需重构）。同时运营者需要区分**重要会员**：希望给会员打一个等级标记，目前分「普站 / 金站」两档，且金站（高等级）要在列表里排前面、一眼可见。等级不是按规则自动算的，而是运营者**手动**指定。

本次变更两件事：

1. **改名**：把全 app 用户可见的「员工」文案统一改为「会员」（仅展示词；`Staff` 代码标识符——字段名 `staff_id`、表名 `staff`、路由 `staff/[id]`、组件名、query key 等**全部不动**，复刻「出库→出单」先例）。
2. **加等级**：给 `Staff` 实体新增一个 `level` 字段（`normal`=普站 / `gold`=金站），可在管理页的会员表单里手动设置/修改；所有会员列表按等级降序（金站优先）再按创建时间升序排列；列表行与详情展示等级徽标。

数据层是 production-grade 且已覆盖（[ADR-0001](../../../docs/adr/0001-storage-port-shape.md)～[0004](../../../docs/adr/0004-adapter-verification-device-smoke.md)），加字段需走版本化迁移；真实 SQLite 的迁移由设备 smoke 验证（ADR-0004，非 Jest）。

## 解决方案

**改名**是纯展示层替换：枚举所有面向用户的「员工」串，改为「会员」；非用户可见的代码注释一并同步以免混淆。领域术语表 [CONTEXT.md](../../../CONTEXT.md) 的通用语言「员工」→「会员」（英文 `Staff` 与代码标识符保留），并在术语条目注明展示词变更与等级字段。

**等级**是一个新增的主数据属性，落在 `Staff` 实体上：

- 存储 `level: 'normal' | 'gold'`（英文码，复刻 `direction: 'in'|'out'` 先例——**改名零成本、可扩展**）；单一注册表 `STAFF_LEVELS` 提供 `code → { label: '普站'|'金站', rank }`，rank 越高等级越高（金站 > 普站）。该注册表是等级的**唯一来源**，数据层与 UI 共用。
- `StaffCreateInput.level?`（缺省 `normal`）、`StaffUpdatePatch.level?`——**不新增 mutation**，等级变更复用既有 `useUpdateStaff`（patch 加可选 `level`），失效键仍是 `qk.staff`。
- 仓储层 `list` / `listActive` / `search` 排序改为 (level rank desc, created_at asc)——一处排序，所有会员列表（记账首页、管理页）自动金站优先。
- 现有老会员迁移：DB 加列 `level TEXT NOT NULL DEFAULT 'normal'`，旧行自动得 `normal`（普站）。
- 等级变更走既有审计（与 name/phone/notes 一致）。

管理页 `StaffForm`（创建+编辑会员的地方）加一个**等级选择器**（两段式：普站/金站，默认普站，编辑时回填当前值）；列表行与 bookkeeping 会员详情头展示等级徽标（金站醒目）。

## 用户故事

改名
1. 作为操作者，我想 app 里所有写「员工」的地方都改成「会员」，以贴合我把他们当会员管理的实际说法。
2. 作为操作者，我想记账首页搜索框提示「搜索会员姓名或电话」，以便我知道在哪找会员。
3. 作为操作者，我想管理页的分段、搜索框、新增按钮都写「会员」「新增会员」。
4. 作为操作者，我想会员详情页标题写「会员详情」。
5. 作为操作者，我想没选会员就提交记账时提示「请选择会员」。

等级
6. 作为操作者，我想每个会员有一个等级（普站 / 金站），新建会员默认普站。
7. 作为操作者，我能手动把某会员改成金站、或改回普站，以便标记重要会员。
8. 作为操作者，我想会员列表里金站排在普站前面，以便优先看到重要会员。
9. 作为操作者，我想在列表行和会员详情一眼看到某会员是金站还是普站（徽标）。
10. 作为操作者，已有的老会员升级到新版后自动是普站、不丢任何数据。

通用（不回归）
11. 作为操作者，改名与加等级后，既有能力（搜索、入库/出单、编辑/作废记录、欠货标识、汇总流水、审计）全部还在。
12. 作为操作者，等级变更和姓名/电话一样会被记录（审计），以便追溯。

## 实施决策

### 改名（展示词 only）
- 面向用户的「员工」串统一改「会员」，覆盖：管理页分段标签 / 搜索占位 / 新增按钮；记账首页搜索占位；会员详情 Stack 标题；记账校验提示「请选择员工」→「请选择会员」；dev tracer 的「新员工」默认名。
- 非用户可见的代码注释里「员工」一并改「会员」以避免新旧词混用。代码标识符（`Staff` / `staff_id` / `staff` 表 / `staff/[id]` 路由 / 组件名 / `qk.staff` / `useStaff*`）**全部保留**。
- 领域文档：[CONTEXT.md](../../../CONTEXT.md) 通用语言「员工 Staff」→「会员 Staff」，条目注明展示词于 2026-07-10 由「员工」改、并补 `level` 字段说明；[CodeMap](../../../docs/codemap/project.md) 里的中文展示串同步。`.scratch/` 下历史 spec/PRD **不动**（不可变历史，反映当时的用词）。

### 等级数据层（`Staff` 实体）
- 接口增量：
  - `type StaffLevel = 'normal' | 'gold'`；`Staff.level: StaffLevel`。
  - `StaffCreateInput.level?: StaffLevel`（`create` 缺省 `normal`）；`StaffUpdatePatch.level?: StaffLevel`。
  - 单一注册表 `STAFF_LEVELS: readonly { code: StaffLevel; label: '普站' | '金站'; rank: number }[]`（金站 rank 高），放数据层（与 `Direction` 同放置策略），暴露 `labelForLevel(code)` 给 UI。纯函数、node-Jest 可测。
  - `create()` 设 `level: input.level ?? 'normal'`；`auditable()` 加入 `level`（等级变更进审计 diff，与 name/phone/notes 同）。
- 排序：仓储 `list` / `listActive` / `search` 返回前按 (level rank desc, created_at asc) 稳定排序——`listActive` 当前用 `storage.find` 单字段 orderBy，改为 find 后在 JS 层重排；`list` 在现有 filter 后追加同款排序；`search` 继承 `listActive` 序。稳定排序保证同等级内仍按创建时间升序。
- Hook 层：`useUpdateStaff` / `useCreateStaff` 的入参类型随接口增量自动放宽，**不新增 mutation、不新增 query key**（等级挂在 `qk.staff` 失效族下）。记账首页 `useStaff()` + `useStaffSummaries()`（按 id join、不重排）→ 仓储排序即列表序，记账首页自动金站优先。

### 等级持久化（schema + 迁移）
- `SCHEMA.staff.columns` 与 `COLUMNS.staff` 同步新增 `level`（drift-guard 测试要求两者列名一致）。`COLUMNS` 里 `level` 为 `TEXT NOT NULL CHECK(level IN ('normal','gold'))`。
- 版本化迁移加 **v2**：`ALTER TABLE staff ADD COLUMN level TEXT NOT NULL DEFAULT 'normal' CHECK(level IN ('normal','gold'))`——`DEFAULT 'normal'` 把现有老会员行回填为普站。
- **迁移陷阱（spec 必须处理）**：本项目 DDL 由 `COLUMNS` **动态生成**（`createTableSql` 读 `COLUMNS`）。若直接把 `level` 加进 `COLUMNS`，则全新 DB 的 v1 `CREATE TABLE staff` 已含 `level`，再跑 v2 `ALTER ADD COLUMN level` 会因「duplicate column」失败；而已有 v1 DB 又必须靠 v2 ALTER 才能补列。SQLite `ALTER TABLE ADD COLUMN` **无 `IF NOT EXISTS`**。推荐解法：把 v1 的 staff `CREATE` **冻结为字面快照**（不含 `level`），其余 v1 表仍走 `createTableSql`；这样全新 DB = 冻结 v1 建表（无 level）→ v2 ALTER 补 level；已有 DB = v1 `IF NOT EXISTS` 跳过 → v2 ALTER 补 level，两条路径都不冲突。`COLUMNS`/`SCHEMA` 仍含 `level` 以满足 drift-guard；若 `expo-sqlite-migration` 测试快照了 v1 DDL 字符串，需同步更新。具体技术与测试调整 spec 锁定。
- InMemoryAdapter 不引用 `SCHEMA`（存裸对象），加字段只需接口 + `create()` 设默认值即兼容。

### 等级 UI
- **管理页 `StaffForm`**（创建+编辑）：加一个**两段式等级选择器**（普站 / 金站），默认普站；编辑模式回填当前 `level`；保存随既有 `useCreateStaff` / `useUpdateStaff` 提交。控件选型 spec 定（`@expo/ui` `SegmentedControl` 或复用管理页既有的 segments 样式）。
- **管理页列表行**：会员名旁显示等级徽标（金站醒目、普站点缀或省略——spec 定）。
- **记账首页 `staff-row`**：显示等级徽标（金站优先可见）。
- **记账会员详情 `staff-detail`**：头部展示等级徽标（只读）。

## 测试决策

沿用 [ADR-0006](../../../docs/adr/0006-ui-component-testing-rntl.md)：RNTL + 真实 `InMemoryAdapter`，行为驱动、不 mock Repos；纯逻辑 node-Jest。

- **纯函数 → Jest（node）**：新增 `STAFF_LEVELS` / `labelForLevel` 单测（code↔label↔rank）；`expo-sqlite-migration` 的 drift-guard（`COLUMNS`↔`SCHEMA` 列名一致）随加列同步仍绿。
- **数据层 `staff.test.ts`（既有 seam）新增覆盖**：`create` 默认 `normal`；`create({level:'gold'})` 落库；`update(id,{level:'gold'})` 改等级并进审计 diff；`list`/`listActive`/`search` 金站排在普站前、同等级按 created_at 升序；老行（无 level 字段的 InMemory 行）容错——由 `create`/迁移兜底，不期待手补。
- **迁移 `expo-sqlite-migration.test.ts`**：v2 DDL 生成正确（含 DEFAULT + CHECK）；若采用冻结 v1 方案，对应 v1 staff DDL 快照断言同步。
- **UI（既有 seam，随行为变更更新）**：
  - `manage-tab.test`：「会员」分段/占位/新增按钮；`StaffForm` 等级选择器存在、默认普站、改金站保存后列表行显示金站徽标。
  - `staff-row.test`：等级徽标展示。
  - `staff-detail.test`：头部等级徽标（只读）。
  - `record-form-validation.test`：「请选择会员」。
  - `bookkeeping-tab.test` / `staff-list-tracer.test`：「新会员」默认名等文案同步。
- **边界（RNTL 不覆盖，ADR-0006）**：真实 SQLite 的 v2 `ALTER`（含 DEFAULT 回填）由**设备 smoke** 验证（ADR-0004）——发布前必须手跑；暗色模式 / 徽标配色 / 手感留手动。

## 范围外

- **重命名代码标识符**：`Staff`→`Member`、`staff_id`、`staff` 表、`staff/[id]` 路由、组件名、`qk.staff`、`useStaff*` 等——明确不做（本次只改展示词）。这是后续可独立的工程重构。
- **超过两档的等级**（银站 / 钻石 / 自定义）：本期仅 normal/gold；注册表可扩展但不新增其他档位。
- **等级的自动规则判定**（如按累计金额自动升级）：等级只手动设。
- **等级相关的权限 / 价格差异化 / 权益**：本期仅是标记 + 排序 + 展示。
- **`.scratch/` 历史 spec/PRD 的文案回改**：历史不可变。
- 任何非 `Staff` 实体的数据层契约变更；任何新派生读模型。
- Web 平台（本应用纯移动端，见 [PROJECT_KNOWLEDGE.md](../../../PROJECT_KNOWLEDGE.md)）。

## 补充说明

- **关联先例**：「出库→出单」（[页面重构 PRD](../2026-07-10-page-refactor/01-page-refactor.md)）确立了"展示词可改、数据层 enum/标识符不动"的模式——本任务改名部分与之同构。
- **关联 ADR**：[ADR-0001](../../../docs/adr/0001-storage-port-shape.md)（StoragePort）、[ADR-0003](../../../docs/adr/0003-expo-sqlite-adapter-shape.md)（adapter shape / SCHEMA 单源）、[ADR-0004](../../../docs/adr/0004-adapter-verification-device-smoke.md)（真实 SQL 仅 device smoke）、[ADR-0006](../../../docs/adr/0006-ui-component-testing-rntl.md)（UI 测试）。
- **Expo SDK 57**：若等级选择器用 `@expo/ui` `SegmentedControl`，先查 https://docs.expo.dev/versions/v57.0.0/ 。
- **React Compiler 已开启**：等级选择器的受控 `state` 遵循 rules-of-react（一个状态一个 hook）。
- **spec 阶段待定（非阻塞）**：(a) 选择器控件选型（`@expo/ui` SegmentedControl vs 复用管理页 segments）；(b) 普站是否显示徽标（建议金站醒目、普站点缀或省略）；(c) 记账 `staff-row` 是否显示徽标（建议显示，与排序语义一致）；(d) 迁移解法（建议冻结 v1 staff DDL + v2 ALTER）与对应迁移测试调整；(e) **`level` DEFAULT 对称性**——`ColDef` 当前无 `default` 字段、`colSql` 不发 DEFAULT，故 COLUMNS 里 `level`（`NOT NULL`、无 DEFAULT）与 v2 ALTER 的 `level ... DEFAULT 'normal'` 不对称；建议给 `ColDef` 加 `default?: string` 并让 `colSql` 发出，使 `createTableSql` 能产出带 DEFAULT 的列、与 ALTER 一致，冻结的 v1 staff 字面量则注明为有意分歧。spec 锁定。

## Comments

- 2026-07-10 — drafted via `/route` → `/to-prd`。需求为用户一句话：全局「员工」→「会员」+ 加会员等级（普站/金站，金站排前，手动修改）。路由阶段确认 3 个范围决策：只改文案不改标识符、加 level 字段、手动修改入口；随后 `to-prd` 探索代码库后给出 5 个设计决定（D1 存英文码+展示标签 / D2 仓储层排序 / D3 入口在管理表单 / D4 文档同步 CONTEXT+codemap、历史不动 / D5 等级进审计），用户确认全采纳。
- 2026-07-10 — 对抗性评审 **PASS**（fresh-context general-purpose 子代理，veracity first：12 条对现有代码的断言全部 ✅ 核验通过——`Staff` 字段集、`SCHEMA`↔`COLUMNS` drift-guard 测试、DDL 由 `COLUMNS` 动态生成 + `MIGRATIONS` 仅 v1 + 版本门控、`colSql` 无 DEFAULT、迁移陷阱推理成立、`InMemoryAdapter` 不引用 SCHEMA、记账列表序 = useStaff → repo（summaries 按 id join 不重排）、`StaffForm` 唯一编辑面 / staff-detail 只读、`useCreateStaff`/`useUpdateStaff` 签名、`auditable()` 覆盖范围、「出库→出单」先例、`src/` 内「员工」串清单完整）。可行性：迁移/排序/UI 方案可构建、符合 ADR-0001/0002/0004/0006，对 ADR-0003 仅轻度影响（drift-guard 不变量保持）。据评审 fold 入一处非阻塞 spec 待办：`ColDef` 无 `default` 导致 COLUMNS 的 `level` 与 v2 ALTER 的 `DEFAULT 'normal'` 不对称（见「spec 阶段待定 (e)」），spec 需解决 + 同步 2 个既有迁移快照测试。状态 `ready-for-human`，待 Gate 0。
- 2026-07-10 — Gate 0 通过（用户 reviewed PRD）。状态 `ready-for-human` → `ready-for-agent`，进入 /sdd-flow 执行；下一步 /to-spec 拆分 specs。
- 2026-07-10 — **Shipped** via /sdd-flow：3 specs 全部实现（#01 数据层 `35bdb9f` / #02 改名 `a027a65` / #03 UI `bc0847b`），Stage 3 双轴评审 Standards + Spec 均 PASS（2 处测试证据缺口已补 `7ce960b`），CONTEXT/codemap 同步 `41346e0`。218 tests green、tsc clean。**发布前待办（手动）**：设备 smoke 验真实 v2 ALTER（ADR-0004）；暗色模式/徽标配色手验。
