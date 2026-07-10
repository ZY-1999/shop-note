# 会员等级数据层 — level 字段 + 注册表 + 排序 + schema/migration

Type: spec
Status: ready-for-agent
Parent: #01
Blocked by: None — can start immediately

## Goal

给 `Staff` 实体加一个会员等级字段（`level: 'normal' | 'gold'`），含单一注册表（code↔label「普站/金站」↔rank）、创建默认值、可更新、进审计、仓储列表金站优先排序，以及对应的 schema 列与版本化迁移——为 UI 层（spec #03）提供等级数据。

## Acceptance criteria

- [ ] `create({name,phone,notes})` 返回的 staff `level === 'normal'`（缺省普站）—— 证明默认值。 *(staff.test.ts)*
- [ ] `create({...,level:'gold'})` 落库 `level === 'gold'`；`getById` 回读一致 —— 证明可显式指定。 *(staff.test.ts)*
- [ ] `update(id,{level:'gold'})` 后回读 `level==='gold'`，且审计时间线该 `update` 条目的 `diff` 恰含 `{field:'level',old:'normal',new:'gold'}` —— 证明等级可手动改 + 进审计（与 name/phone/notes 一致）。 *(staff.test.ts)*
- [ ] `create` 审计条目 `after` 含 `level` 字段 —— 证明 auditable() 覆盖 level。 *(staff.test.ts)*
- [ ] 多会员 `list`/`listActive`/`search` 返回序为：金站在前、普站在后；同等级内按 `created_at` 升序 —— 证明金站优先排序（高等级排前）。 *(staff.test.ts，含跨等级 + 同等级两个用例)*
- [ ] `SCHEMA.staff.columns` 与 `COLUMNS.staff` 列名一致（drift-guard 测试仍绿，二者均含 `level`）—— 证明双源同步。 *(expo-sqlite-migration.test.ts 既有 drift-guard)*
- [ ] `createTableSql('staff')` 的快照测试更新为含 `level TEXT NOT NULL DEFAULT 'normal' CHECK (level IN ('normal','gold'))`（列位在 `notes` 与 `voided_at` 之间）—— 证明 COLUMNS 反映新列 + DEFAULT 对称（PRD 待办 e）。 *(expo-sqlite-migration.test.ts)*
- [ ] `MIGRATIONS` 有 v2；v2 语句为 `ALTER TABLE staff ADD COLUMN level TEXT NOT NULL DEFAULT 'normal' CHECK(level IN ('normal','gold'))` —— 证明老数据迁移（DEFAULT 'normal' 回填现有行为普站）。 *(expo-sqlite-migration.test.ts)*
- [ ] v1 的 staff `CREATE` 语句冻结为**不含 level 的历史字面量**（其余 v1 表仍走 `createTableSql`）；`MIGRATIONS` 长度为 2 —— 证明迁移陷阱（动态 DDL）已正确处理：全新库 = 冻结 v1 建表（无 level）→ v2 ALTER 补 level；老库 = v1 `IF NOT EXISTS` 跳过 → v2 ALTER 补 level，两路径都不冲突。 *(expo-sqlite-migration.test.ts)*
- [ ] `labelForLevel('gold')==='金站'`、`labelForLevel('normal')==='普站'`；`levelRank('gold') > levelRank('normal')` —— 证明注册表是等级展示/排序的唯一来源。 *(新纯函数单测，可并入 staff.test.ts 或独立)*
- [ ] 既有 `staff.test.ts` 行为不回归（仅新增 level 相关断言；既有 create/list/search/update/void/restore/audit 断言仍绿）—— 证明数据层非回归（PRD 故事 11）。 *(staff.test.ts)*
- [ ] **[手动 / 发布门]** 真实 SQLite 的 v2 `ALTER TABLE staff ADD COLUMN level ... DEFAULT 'normal' ...` 在设备 smoke 上 PASS（老库升级后 existing 行 `level='normal'`；全新库建表+迁移后 `level` 列存在且默认 `'normal'`）—— 承载 PRD 测试决策边界（ADR-0004，非 Jest 覆盖；/tdd 不可跑，发布前手验，对应 PRD 故事 10 的运行时验证）。 *(设备 smoke)*

## Scope

- **In**: `src/data/staff.ts`（`StaffLevel` 类型、`Staff.level`、`StaffCreateInput.level?`、`StaffUpdatePatch.level?`、`STAFF_LEVELS` 注册表 + `labelForLevel`/`levelRank`、`create` 默认值、`auditable()` 加 `level`、`list`/`listActive`/`search` 排序）；`src/data/sql-logic.ts`（`SCHEMA.staff.columns` +`level`）；`src/data/expo-sqlite-migration.ts`（`COLUMNS.staff` +`level`、冻结 v1 staff DDL、新增 v2 ALTER）；既有 `staff.test.ts` 与 `expo-sqlite-migration.test.ts` 同步更新。
- **Out**: 任何 UI（选择器/徽标 = spec #03）；「员工→会员」改名（spec #02）；CONTEXT.md / codemap 文档（sdd-flow summarize 步）；重命名任何代码标识符；新增 mutation / query key（等级复用既有 `useUpdateStaff`/`useCreateStaff`，其入参类型随本 spec 自动放宽——hook 层无代码改动，仅类型跟随）。

## Context

- 领域术语见 [CONTEXT.md](../../../../CONTEXT.md)（`Staff` 主数据实体，soft-delete via `voided_at`）。本 spec 给 `Staff` 加一个主数据属性 `level`，与 name/phone/notes 同层。
- [ADR-0001](../../../../docs/adr/0001-storage-port-shape.md)（StoragePort 单测试 seam）、[ADR-0003](../../../../docs/adr/0003-expo-sqlite-adapter-shape.md)（DDL 与 registry 共用单源、无 FK/UNIQUE、CHECK 约束）、[ADR-0004](../../../../docs/adr/0004-adapter-verification-device-smoke.md)（真实 SQLite 仅设备 smoke 验证）。
- `SCHEMA`（[sql-logic.ts](../../../../src/data/sql-logic.ts)）与 `COLUMNS`（[expo-sqlite-migration.ts](../../../../src/data/expo-sqlite-migration.ts)）是 staff 列的双源，drift-guard 测试绑定列名；DDL 由 `COLUMNS` 经 `createTableSql` **动态生成**，`MIGRATIONS` 版本化（现仅 v1），`runMigrations` 按 `version > user_version` 应用。
- [InMemoryAdapter](../../../../src/data/in-memory.ts) 存裸对象、不引用 SCHEMA → 加字段只需接口 + `create()` 默认值。
- 既有 `StaffRepository`（[staff.ts](../../../../src/data/staff.ts)）：`create`/`getById`/`list`/`listActive`/`search`/`update`/`void`/`restore`，共享 `mutate()` 模板（read→compute→persist→audit，单事务）。`auditable()` 现 cover name/phone/notes/voided_at。
- 先例：`direction: 'in'|'out'` 存英文码、UI 渲染中文标签（CONTEXT「出库→出单」）—— `level` 同构（存英文码 `normal`/`gold`，渲染「普站」「金站」）。

## Design

- **Interface delta** — 数据层公共面（本 spec 后）：
  - `type StaffLevel = 'normal' | 'gold'`。
  - `Staff` 增 `level: StaffLevel`（列序随接口：`id, name, phone, notes, level, voided_at, created_at, updated_at`）。
  - `StaffCreateInput.level?: StaffLevel`（缺省 `normal`）；`StaffUpdatePatch.level?: StaffLevel`。
  - 单一注册表 `STAFF_LEVELS: readonly { code: StaffLevel; label: '普站'|'金站'; rank: number }[]`，金站 rank 高；导出 `labelForLevel(code)`、`levelRank(code)`、`DEFAULT_STAFF_LEVEL = 'normal'`。放 `staff.ts`（与 `Direction` 同放置策略：数据层拥有 enum + 标签，UI import）。纯函数、node-Jest 可测。
  - `staffRepo.create` 设 `level: input.level ?? DEFAULT_STAFF_LEVEL`；`auditable()` 加入 `level`（等级变更进审计 diff）。
  - `list`/`listActive`/`search` 返回前按 `(levelRank desc, created_at asc)` 稳定排序——`list` 在现有 voided 过滤后追加排序；`listActive` 把 `storage.find` 的单字段 orderBy 换为 find 后 JS 层重排；`search` 继承 `listActive` 序。
  - schema：`SCHEMA.staff.columns` 与 `COLUMNS.staff` 同步加 `level`（`TEXT NOT NULL`，`CHECK(level IN ('normal','gold'))`，列位随接口序）。给 `ColDef` 增可选 `default?: string`、`colSql` 在设置时发出 `DEFAULT <v>`（仅对设了 default 的列生效，既有列无 default 故其 DDL 不变），`COLUMNS.staff.level` 设 `default: 'normal'`——使 `createTableSql('staff')` 产出的 level 列带 `DEFAULT 'normal'`，与 v2 ALTER 一致（采纳 PRD 待办 (e) 的对称性解法：唯一"无 DEFAULT"的 staff DDL 是冻结的 v1 历史快照，因其早于该列，属有意分歧、注明）。
  - 迁移：`MIGRATIONS` 增 v2（单条 `ALTER TABLE staff ADD COLUMN level TEXT NOT NULL DEFAULT 'normal' CHECK(level IN ('normal','gold'))`）；v1 的 staff `CREATE` 改为**冻结的历史字面量**（提取为命名常量，如 `V1_STAFF_DDL`，不含 `level`），其余 v1 表仍 `createTableSql(...)`。
- **Deep-module note** — `staff.ts` 仍是薄主数据模块（深度在 audit provider 与 port）；`STAFF_LEVELS` 注册表是一个小而有意义的聚合（标签 + 排序秩的单源），不需 DEEPENING——它正是把"等级"这个概念的展示与排序集中到一处，避免散落。合理。
- **Internal architecture** — 无新模块边界；排序与注册表都在 `staff.ts` 内。迁移陷阱的解法（冻结 v1 staff 字面量 + v2 ALTER）是本 spec 的关键结构决策：保证全新库与老库两条路径都得到带 `level` 的 staff 表而不冲突（SQLite `ALTER ADD COLUMN` 无 `IF NOT EXISTS`，且 DDL 动态生成会使全新库 v1 CREATE 已含 level → 与 v2 ALTER 冲突；冻结 v1 staff 规避之）。

## Rework on failure

失败隔离在数据层。若迁移解法（冻结 v1 + v2 ALTER）在设备 smoke 上不成立（如 SQLite 拒绝带 CHECK+DEFAULT 的 ALTER），改的是 v2 语句形式或解法本身（如给 `runMigrations` 加列存在性 guard），仅重做本 spec；UI（#03）与改名（#02）不受影响。
