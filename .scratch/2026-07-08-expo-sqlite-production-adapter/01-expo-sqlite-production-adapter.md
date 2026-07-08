# Expo SQLite 生产适配器（expo-sqlite production adapter）

Type: prd
Status: ready-for-agent

## 问题陈述

shop-management-system 的数据层（specs #01–#07）已用纯 TypeScript + `InMemoryAdapter` 落地并通过 Jest 覆盖，但生产存储适配器 `ExpoSqliteAdapter` 仍是 compiling stub——5 个方法全部 throw（见 spec #01 验收条件 #4），`expo-sqlite` 依赖也未安装。结果是：数据层在测试里完整可用，但在真设备上没有任何东西能持久化它。spec #01 的 Scope Out 明确把"real expo-sqlite SQL execution, schema, and migrations"推迟为一项独立的非 TDD 任务。本 PRD 交付那项任务——把 stub 实现成真正跑 SQLite 的生产适配器，让数据层在设备端落地、且可验证。

## 解决方案

安装 `expo-sqlite`，为 5 张领域表写 schema（DDL）+ 一份幂等的 `PRAGMA user_version` 迁移，把 `StoragePort` 的 5 个方法（`withTransaction`/`insert`/`findById`/`update`/`find`）翻译成真 SQL，事务用显式 `BEGIN/COMMIT/ROLLBACK`。适配器按"per-table schema registry"持有每张表的列与 JSON 列声明，`audit_log.diff`（嵌套数组）以 JSON 文本列往返。不改任何已落地的 repository、不动 `InMemoryAdapter`、不引入 `join`/子表。配套一个最小、可重复的 device smoke：同一份 `behaviorScript` 分别跑在 Expo 与 InMemory 两套 repos 上，断言每步返回值深相等，作为"adapter 行为对齐 InMemory"的可执行证据。

## 用户故事

本特性是数据层内部任务（无最终用户），以下为可读的需求陈述：

1. 作为数据层维护者，我想 `ExpoSqliteAdapter` 实现完整的 `StoragePort`，以便 repository 在真设备上无需改动即可持久化。
2. 作为数据层维护者，我想 schema 与迁移在首次打开数据库时自动建表，以便用户首启即得正确结构。
3. 作为数据层维护者，我想事务在失败时完整回滚（与 `InMemoryAdapter` 同语义），以便"mutate + audit 原子"的不变量在生产同样成立。
4. 作为数据层维护者，我想 `audit_log.diff` 在读写间无损往返，以便字段级审计在生产与测试表现一致。
5. 作为数据层维护者，我想 `find` 的 null 匹配、排序、limit 与 `InMemoryAdapter` 精确一致，以便"单一 seam 证明生产行为"不漂移。
6. 作为数据层维护者，我想有一个可重复运行的 device smoke 对照 InMemory 行为，以便每次改动 adapter 后能快速回归确认未引入漂移。
7. 作为数据层维护者，我想 adapter 不引入 `InMemoryAdapter` 没有的业务约束，以便两 adapter 行为对称、device smoke 不因约束差异误报。

## 实施决策

### 范围边界

- **In**：安装 `expo-sqlite`；schema DDL（5 表）；`PRAGMA user_version` 迁移；`ExpoSqliteAdapter` 5 方法实现（含显式事务）；删除现有 stub 测试、改为纯逻辑单测；一个自包含的 device smoke（`behaviorScript` 对照 InMemory）+ dev-only 触发入口。
- **Out**：正式 composition root（不引入 `SQLiteProvider`、不向任何 screen 注入 repos）；UI；任何业务模块改动；备份/导出。

### 适配器列映射：per-table schema registry

适配器持有一份每表声明 `{ columns: string[]; jsonColumns: Set<string> }`，所有 `insert`/`update`/`find` 基于它拼 SQL：列名、占位符、JSON 列在绑参时 `stringify`、读回时 `parse`。DDL 与这份 registry 共用同一来源（避免漂移）。registry 形状：

```
{ staff: {jsonColumns:[]}, product: {jsonColumns:[]}, stock_record: {jsonColumns:[]},
  stock_record_item: {jsonColumns:[]}, audit_log: {jsonColumns:["diff"]} }
```

理由：port 是 typed row store，`insert` 收到的 row 含 `audit_log.diff` 这类嵌套数组（`AuditProvider.logEvent` 直接 `insert("audit_log", entry)`），SQLite 无法直接存嵌套；必须有"哪些列是 JSON"的元数据才能正确往返。完全动态（按 `Object.keys(row)` 推断）在读回方向无法区分"普通字符串 vs JSON 文本"，且会让 repo 笔误静默拼出不存在的列，故取显式 registry。

### `audit_log.diff`：JSON 列

`audit_log.diff` 存为 `TEXT NOT NULL`，值为 `JSON.stringify(FieldDiff[])`。adapter 在该列往返时序列化/反序列化。**不走 `audit_log_field` 子表**——它与 ADR-0001 三重冲突：port 无 `join` 但读 audit 必须拼主表+子表；要么 adapter 识别 audit 语义去拆 diff（不再 dumb），要么改已测试覆盖的 `AuditProvider`/`InMemoryAdapter`（动摇"单一 seam 证明生产行为"）；`FieldDiff.old/new` 是 `unknown`，子表列仍要序列化。JSON 列是唯一不破坏 port 契约的选择。详见 ADR-0003。

### schema（5 表）

时间戳（`number` epoch ms）、金额（`Cents` 整数）、数量均为 `INTEGER`；字符串与可空字段为 `TEXT`；`id` 为 `TEXT PRIMARY KEY NOT NULL`。可空性镜像 TS 类型（`T | null` → 可空，其余 `NOT NULL`）。`direction`/`action` 加 `CHECK (… IN (…))` 作值域完整性（正常路径由 TS 字面量联合保证，CHECK 是运行时双保险）。**不写 `FOREIGN KEY` 子句**（见"连接级 PRAGMA"）。建表顺序：`staff` → `product` → `stock_record` → `stock_record_item` → `audit_log`。唯一索引：`stock_record_item(record_id)`（服务 `getById` 的 `where:{record_id}` 查询；注意 `loadItemsFor` 是无 where 的全表扫、不受益于该索引）；其余推迟到测得慢（对齐 ADR-0002）。

表形状（决策摘要）：

- `staff(id, name, phone, notes, voided_at?, created_at, updated_at)`
- `product(id, title, purchase_price, code?, category?, voided_at?, created_at, updated_at)`
- `stock_record(id, staff_id, direction[CHECK in/out], timestamp, note?, voided_at?, created_at, updated_at)`
- `stock_record_item(id, record_id, product_id, title, unit_price, qty, line_amount)` + `idx_item_record_id`
- `audit_log(id, actor, action[CHECK create/update/void/restore], entity_type, entity_id, timestamp, diff[JSON])`

### 连接级 PRAGMA

打开库后立即 `PRAGMA journal_mode = WAL`（官方建库推荐）。**不开 `PRAGMA foreign_keys`**——故 DDL 也不写 `FOREIGN KEY` 子句（不生效的声明是噪音）。理由：守"两 adapter 行为一致"——`InMemoryAdapter` 不做引用完整性校验（`stock_record.create` 甚至不校验 staff 存在），SQLite 也不越权加；引用完整性是 repository 层的职责。软删除不破坏任何引用（voided 行 id 仍在，对齐"no hard delete"不变量）。

### 事务：手写 BEGIN/COMMIT/ROLLBACK

`withTransaction` 用显式 `BEGIN` → `await fn()` → `COMMIT`；catch 里 `ROLLBACK` 后 rethrow。`SQLiteDatabase` 单连接，fn 内所有 async 查询同事务。

**不用 `db.withTransactionAsync`**：其 task 签名是 `() => Promise<void>`、且靠 task 抛错触发 ROLLBACK；而 port 契约是 `withTransaction<T>(fn): Promise<T>`（要返回 T，repository 靠它返回 next 状态）。两者根本冲突——为保留返回值而在 task 内 catch 会让 `withTransactionAsync` 看不到 throw 从而错误地 COMMIT。

**不支持嵌套事务**：SQLite `BEGIN` 不能嵌套（要嵌套得 `SAVEPOINT`）。已遍历 repository：`AuditProvider.logEvent` 与 `ProductRepository.getById` 均不开事务，故 `StaffRepository.mutate`/`StockRecordRepository.update` 的事务不嵌套。将"withTransaction 不可嵌套"写入 port 契约注释；`InMemoryAdapter` 的嵌套能力降级为超出契约的实现细节（不改其代码）。

### `find` 语义对齐

逐条复刻 `InMemoryAdapter.find`：`where.field` 为 null/undefined → `IS NULL`；非 null → `= ?`（值绑参，多字段 AND）；`orderBy` 用 `ORDER BY field ASC|DESC`，依赖 SQLite 默认 null 序（null 当最小值，asc 排最前、desc 排最后，与 InMemory `compare` 一致，不写 `NULLS FIRST/LAST`）；**同值行的相对顺序声明为未定义**（不加 id tiebreaker——id 含随机后缀，字典序 ≠ insert 序，加了也不与 InMemory 严格一致，仅把"未定义"换成"按 id"，收益有限）；`limit` 为非负整数 → `LIMIT ?`；无 query 返回全表；应用序 WHERE→ORDER BY→LIMIT。

### 迁移

SDK 57 文档无 `migrate()` helper，按官方示例走手写 `PRAGMA user_version`：打开库 → 读 `user_version` → 跑所有 `version > current` 的迁移（每条 DDL 用 `CREATE TABLE/INDEX IF NOT EXISTS` 幂等）→ 成功后设 `PRAGMA user_version = N`。迁移定义为独立模块的版本表（首版 v1 仅建表+索引），未来加版本只追加。迁移不包大事务（SQLite DDL 各自隐式提交，`IF NOT EXISTS` 保证重跑幂等）。

### 纯逻辑单测

把 SQL 生成与序列化从 adapter 类抽成纯函数（`buildInsert`/`buildUpdate`/`buildFind` + 行序列化/反序列化），在 Jest 单测它们：列顺序与占位符数量、JSON 列 stringify/parse 往返、`where` null→`IS NULL` 翻译、`orderBy` 方向、`limit` 拼接。**删除现有 stub 测试**（其断言"5 方法 throw"的前提随实现消失）。这是对父 PRD 测试决策的细化：父决策"adapter 不做单测"针对 **SQL 执行路径**（真跑 SQLite，仍由 device smoke 覆盖）；无副作用的纯逻辑（字符串生成/序列化）抽出单测，秒级捕获易错点。

### device smoke

- `behaviorScript(repos)`：一份共享脚本，用 repository 公共 API 跑覆盖路径——staff/product CRUD、stock-record create(快照)/update(touched 重采样、untouched 保快照)/void、audit timeline（含 `diff` 往返）、派生 balance/cost/aggregate、`where voided_at:null`、事务回滚——产出可比较的结果快照。
- `runExpoSqliteSmoke()`：用 `ExpoSqliteAdapter`（open + WAL + migrate）构造 Expo repos 跑 `behaviorScript`，再用 `InMemoryAdapter` 构造一套跑同一脚本，断言两侧每步深相等，返回 `{pass, details}`。
- 入口：Home 加 `__DEV__` 区块（按钮 + 结果），点按触发。smoke 自包含（自开库、自构造 repos、自关闭），**不引入 `SQLiteProvider`、不向 screen 暴露 repos**——守"不做正式 composition root"。入口长期保留为可重复的 dev 回归 smoke（非产品功能）。
- **已知往返坑（smoke 须覆盖）**：`FieldDiff.old/new` 为 `undefined` 时（create 场景 `before` 未传 → `old: undefined`），`JSON.stringify` 会丢键，致深相等键集合不一致。序列化前规范化（如 undefined → null）或在对照比较时按 undefined≈absent 归一，并在 smoke 中专设一个 create 审计用例验证 `diff` 往返。

## 测试决策

- **好测试**：纯逻辑函数测"输入 → 生成的 SQL/参数/序列化结果"（外部行为，不测 db）；device smoke 测"同一操作序列在两 adapter 下返回值深相等"。每个不变量一条断言。
- **单一 seam 的延伸**：repository 公共 API 仍是行为 seam；adapter 的 SQL 执行行为由 device smoke 经 repository 间接验证（不直接测 adapter SQL 内部）。
- **被测**：纯逻辑（SQL 生成/序列化）；adapter 执行行为（经 smoke 对照 InMemory）。
- **不做**：`expo-sqlite` 真实 SQL 执行的 Jest 单测（原生模块、无设备跑不了）；Node 端 better-sqlite3 契约测试（第三种 SQLite 运行时，维护成本高、收益低，被纯逻辑单测 + device smoke 覆盖）；UI。
- **先例**：现有 `src/data/*.test.ts`（Jest + ts-jest，`@jest/globals`，`@/` 别名），时间相关用 `jest.useFakeTimers` + `setSystemTime`。device smoke 无先例（新增），形态见"device smoke"段。

## 范围外

- 正式 composition root（`SQLiteProvider`/`useSQLiteContext`、app 启动注入 repos）——留给首个消费数据层的 UI feature 一起定 DI 形态。
- 任何 UI / screen 消费数据层。
- 任何 repository 业务逻辑改动（adapter 是 dumb 存储，逻辑全在已交付 repo）。
- 备份/恢复、CSV 导出（父 PRD 已推迟 v2）。
- 多设备同步、鉴权（父 PRD 范围外）。
- 性能优化（额外索引、查询下推）——推迟到测得慢（ADR-0002）。
- Node 端契约测试（不做）。

## 补充说明

- **取代 spec #01 的 stub AC**：spec #01 验收条件 #4（"adapter 为 compiling stub，方法 throw not-in-unit-test"）与 Scope Out（"real expo-sqlite SQL execution/schema/migrations — later non-TDD task"）——本 PRD 即该项推迟任务；实现后 stub AC 不再成立，作为历史记录保留于 spec #01，不回改。
- **ADR-0003**：同步新增 `docs/adr/0003-expo-sqlite-adapter-shape.md`，记录"per-table registry + JSON 列、不引入 join/子表、事务不嵌套、adapter 不越权约束"及其与 ADR-0001 的关系。
- **CONTEXT.md 不动**：本特性决策属实现/架构层，非领域术语；`StoragePort`/`ExpoSqliteAdapter` 术语已存在。
- **Expo SDK 57 文档**：https://docs.expo.dev/versions/v57.0.0/ —— `expo-sqlite` API、事务、`PRAGMA`、迁移模式均以 v57 文档为准（SDK 57 文档无 `migrate()` helper，故走手写 `user_version`）。
- **父 PRD**：[.scratch/2026-07-08-shop-management-system/01-shop-management-system.md](../2026-07-08-shop-management-system/01-shop-management-system.md)。

## Comments

- 2026-07-08 — 经 /idea-to-prd 的 /grilling 逐议题确认（边界 / diff 存储 / 列映射 / find 对齐 / 事务 / 迁移 / schema / 验证），/to-prd 综合起草。
- 2026-07-08 — 对抗评审（fresh-context sub-agent，veracity first）：1 处 veracity 修复——索引理由由 `loadItemsFor` 更正为 `getById`（前者是无 where 全表扫、不受益于索引）；并纳入非阻挠建议——device smoke 须覆盖 `FieldDiff` 含 `undefined` 的 JSON 往返坑。其余事实全部对照源码核实 PASS，可行性与 ADR 对齐 PASS。待 Gate 0 评审。
- 2026-07-08 — Gate 0 通过（人审 reviewed）；状态翻 `ready-for-agent`，进入 /sdd-flow 执行。
