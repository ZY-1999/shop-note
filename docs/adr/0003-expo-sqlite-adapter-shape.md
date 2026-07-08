# ADR-0003: expo-sqlite adapter — per-table schema registry + JSON column, no joins/sub-tables

- Status: **Accepted** (2026-07-08)
- Scope: shop-management-system production storage adapter

## Context

数据层（specs #01–#07）已落地，生产适配器 `ExpoSqliteAdapter` 需从 compiling stub 实现成真 SQLite。`StoragePort`（[ADR-0001](0001-storage-port-shape.md)）是 dumb typed row store：`insert` 收到的 row 形状由 repository 决定，adapter 不含业务逻辑。但 `AuditProvider.logEvent` 直接 `insert("audit_log", entry)`，而 `entry.diff` 是嵌套的 `FieldDiff[]` 数组——`InMemoryAdapter` 能原样存，SQLite 不能存嵌套。如何在不破坏 ADR-0001（无 join、adapter dumb、两 adapter 行为一致）的前提下落地真 SQL，是这层最关键、最难逆转的决策。

## Decision

`ExpoSqliteAdapter` 采用 **per-table schema registry + JSON 列**：

1. **per-table schema registry** —— adapter 持有每表声明 `{ columns, jsonColumns }`，所有 `insert`/`update`/`find` 基于它拼 SQL。DDL 与 registry 共用同一来源。
2. **JSON 列** —— `audit_log.diff` 存为 `TEXT`（JSON 文本），绑参时 `stringify`、读回时 `parse`。
3. **不引入 join/子表** —— 不为 `diff` 建 `audit_log_field` 子表；adapter 不读跨表。读路径（`findById`/`find`）返回单表行，嵌套载荷以 JSON 列整体往返。
4. **事务不嵌套** —— `withTransaction` 用显式 `BEGIN/COMMIT/ROLLBACK`（不用 `withTransactionAsync`，因其 `Promise<void>` + throw→rollback 与 port 的 `<T>` 返回值契约冲突）。SQLite `BEGIN` 不可嵌套；port 契约明确声明"withTransaction 不可嵌套"。
5. **adapter 不加 InMemory 没有的约束** —— 不开 `PRAGMA foreign_keys`、DDL 不写 `FOREIGN KEY`；引用完整性归 repository 层。值域 `CHECK`（direction/action）保留（值域完整性，TS 字面量联合已保证正常路径）。

## Consequences

- **+ 守住 ADR-0001。** adapter 仍是 dumb row store：不含业务逻辑、无 join、无跨表读、两 adapter 行为对称。repository 与 `InMemoryAdapter` 零改动。
- **+ device smoke 可对照。** 两 adapter 行为一致（含都不做引用完整性），`behaviorScript` 对照不会因"SQLite 多了约束"误报。
- **+ diff 往返无损。** JSON 列让嵌套数组在读写间保真，审计时间线与测试表现一致。
- **+ 返回值契约保真。** 手写事务保留 `withTransaction<T>` 的返回值，repository 的 next-state 返回不受影响。
- **− adapter 多持一份列元数据。** 不再"零知识"，但仍 dumb（只描述列形状，零业务逻辑）；DDL 与 registry 需保持一致（靠"insert 时 row keys ⊆ columns"的断言对齐）。
- **− diff 不可 SQL 层查询。** `TimelineFilter` 不能按 diff 字段值过滤/聚合——当前需求无此查询（diff 是只读载荷），可接受。
- **− 事务不可嵌套。** 当前 repository 无嵌套调用；未来若需嵌套，引入 `SAVEPOINT`。

## Alternatives considered

- **`audit_log_field` 子表**。拒绝：与 ADR-0001 三重冲突——port 无 join 但读 audit 必拼主表+子表；要 adapter 拆 diff（不再 dumb）或改已测的 `AuditProvider`/`InMemoryAdapter`；`old/new: unknown` 仍要序列化。
- **完全动态列映射（按 `Object.keys(row)` 推断）**。拒绝：读回方向无法区分普通字符串 vs JSON 文本；repo 笔误会静默拼出不存在的列。
- **`db.withTransactionAsync`**。拒绝：`Promise<void>` + throw→rollback 与 port 的 `<T>` 返回值根本冲突。
- **开 `PRAGMA foreign_keys` + FK 子句**。拒绝：引入 InMemory 没有的引用完整性，破坏两 adapter 行为对称、致 device smoke 误报；引用完整性归 repository 层。
- **`expo-sqlite/migration` 的 `migrate()` helper**。未采用：SDK 57 文档未背书（按 AGENTS.md 以 v57 文档为准），官方示例即手写 `PRAGMA user_version`。

## References

- PRD: [.scratch/2026-07-08-expo-sqlite-production-adapter/01-expo-sqlite-production-adapter.md](../../.scratch/2026-07-08-expo-sqlite-production-adapter/01-expo-sqlite-production-adapter.md)
- Related: [ADR-0001](0001-storage-port-shape.md) — storage port shape（本 ADR 守其约束）；[ADR-0002](0002-derived-inventory-never-stored.md) — 性能推迟原则
- Code (after implementation): `ExpoSqliteAdapter`、迁移模块、纯逻辑模块、device smoke 模块
