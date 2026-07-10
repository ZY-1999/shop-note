# Schema 地基 + 清库迁移 + 新 ADR

Type: spec
Status: ready-for-agent
Parent: #01 (01-stock-balance-refactor.md)
Blocked by: None — can start immediately

## Goal

铺设重构地基：新增 `topup` + `config` 表、`stock_record` 加「全局单价快照」列、staff 表种子 `-1` 管理员行；清库重来迁移（DROP+重建）+ 记录偏离点的 ADR。

## Acceptance criteria

- [ ] `createTableSql("topup")` / `createTableSql("config")` 产出含全部新列的 DDL；`COLUMNS` 列名 == `SCHEMA` 列名（drift-guard 对新表生效）。——证明 schema 单源（ADR-0003）
- [ ] `MIGRATIONS` 最新版本含 `DROP TABLE IF EXISTS`（5 张既有表）+ 全部 `CREATE`（7 张表）+ `CREATE INDEX idx_item_record_id`（重建，DROP TABLE 连带删除）+ `INSERT INTO staff(id,...) VALUES('-1',...)`；语句序列顺序正确。——证明清库迁移完整且不丢索引
- [ ] 全新库路径（user_version=0）跑到该版本后，7 张表存在、`staff` 含 `-1` 行、`stock_record` 含 `unit_price_snapshot` 列。——证明新库收敛
- [ ] 老库路径（user_version=2）跑到该版本后结构等价于全新库（无残留旧列、无 duplicate-column 风险）。——证明两路径收敛
- [ ] 迁移测试断言 v3 语句序列；`runMigrations` 签名未变；drift-guard 对全部 7 张表生效。——证明迁移机制不被破坏
- [ ] 新 ADR（`docs/adr/0008-clear-db-rebuild-migration.md`）记录 DROP+重建偏离增量式铁律的原因/边界/与 drift-guard 关系。——证明偏离被记录

## Scope

- **In**: `SCHEMA`/`COLUMNS`/`TableName`（sql-logic.ts + expo-sqlite-migration.ts）新增 topup/config 表 + stock_record 加列；`MIGRATIONS` 新版本（DROP+CREATE+种子 INSERT）；新 ADR-0008。
- **Out**: 任何 repo 逻辑（StaffRepo 过滤、StockRecordRepo 校验、TopupRepository 等留后续 spec）；UI；`-1` 的行为约束（spec 02）；真实 SQLite 执行（ADR-0004 设备 smoke，发布前手跑）。

## Context

- ADR-0003（DDL 与 registry 单源——`SCHEMA`/`COLUMNS` drift-guard）；ADR-0004（真实 SQL → 设备 smoke，非 Jest）。
- PROJECT_KNOWLEDGE「给既有表加列必须冻结历史 CREATE 字面量」——本次清库重来**不触发**该场景（数据丢弃），故 DROP+重建不需冻结字面量；这恰是新 ADR 要记录的偏离点。
- `CONTEXT.md` Cents（整数分）、invariant（无 hard delete、派生不存储）。
- 现有 5 张表：staff/product/stock_record/stock_record_item/audit_log（见 `sql-logic.ts` SCHEMA）；现有 `MIGRATIONS` v1+v2。

## Design

- **Interface delta**
  - `TableName` 扩展：`"topup" | "config"` 加入 union。
  - `SCHEMA`/`COLUMNS` 新增两张表：
    - `topup`：`id, staff_id, amount, timestamp, note(nullable), voided_at(nullable), created_at, updated_at`（`amount` 为 INTEGER Cents）。
    - `config`：`key(TEXT PK), value(INTEGER), updated_at`（通用 key-value，首项 `unit_price`）。
  - `stock_record` 新增列 `unit_price_snapshot INTEGER NULL`（Cents；出库冻结、补货 null）——同步进 `SCHEMA` + `COLUMNS`。
  - `MIGRATIONS` 新版本 v3：先 `DROP TABLE IF EXISTS`（5 张既有表，连带删除 `idx_item_record_id` 索引）→ 用最新 `COLUMNS`/`SCHEMA` `CREATE`（7 张表）→ `CREATE INDEX IF NOT EXISTS idx_item_record_id ON stock_record_item(record_id)`（重建——v1 建过，DROP TABLE 连带删除）→ `INSERT INTO staff(...) VALUES('-1',...)` 种子。
  - `createTableSql` 对 7 张表生效；drift-guard（`COLUMNS` 列名 == `SCHEMA` 列名）对全部 7 张表通过。

- **Internal architecture**
  - **清库迁移模式**：DROP+CREATE 一次性重建，偏离项目既有增量式铁律（`ALTER ADD COLUMN` + 冻结历史 CREATE）。因数据丢弃，不触发"加列保数据"场景，不需冻结字面量——新 ADR-0008 记录此偏离、边界、与 drift-guard 的关系。
  - **两路径收敛**：全新库（user_version=0）与老库（user_version=2）都在 v3 执行 DROP+重建，收敛同一新 schema；`DROP IF EXISTS`/`CREATE IF NOT EXISTS` 幂等，无 duplicate-column 风险。
  - **种子 `-1`**：迁移里直接 `INSERT` 固定 id（绕过 `StaffRepository.create` 的随机 id()）；行为约束（过滤/守卫）留 spec 02。
  - `runMigrations` 签名不改。

## Rework on failure

迁移独立可重做——重跑 DROP+CREATE 幂等无副作用；失败只需 redo 本 spec（schema + ADR），不波及 repo/UI。
