# ADR-0008: 库存/余额重构的清库重建迁移（DROP + 重建），偏离增量式铁律

- Status: **Accepted** (2026-07-10)
- Scope: stock-balance-refactor 的 schema 迁移（v3）

## Context

`stock-balance-refactor` 是一次**核心语义变更**：库存从「每会员持有」收敛为「全局唯一」，会员从「库存持有者」改为「充值 + 出库双动作」。这不是加字段——`Inventory.balance`/`staffInventory`/`staffSummaries` 整块废弃，`shopAggregate` 语义重定义，旧 per-staff 库存数据在新模型下**无干净映射**：旧的「会员名下某商品余额」既不能翻译成「全局库存」，也不能翻译成「会员余额」（金钱与库存已分离）。已与用户确认：项目 2026-07 落地、本地试用阶段，老数据可丢。

项目既有迁移铁律（[PROJECT_KNOWLEDGE.md](../../PROJECT_KNOWLEDGE.md)「给既有表加列必须冻结历史 CREATE 字面量」）针对的是**加列保数据**场景：`ALTER ADD COLUMN` 无 `IF NOT EXISTS`，故全新库跑该 ALTER 会 duplicate-column，解法是冻结历史 CREATE 字面量、`ColDef.default` 对称。该铁律的**前提是保数据**。本次前提不成立——数据主动丢弃——故铁律不适用，需另选迁移模式并记此偏离。

## Decision

v3 迁移改用 **DROP + 重建**（清库重来），一次性收敛：

1. **DROP TABLE IF EXISTS** 5 张既有表（staff/product/stock_record/stock_record_item/audit_log）——连带删除 `idx_item_record_id` 索引。`topup`/`config` 是 v3 新表，无需 DROP。
2. **CREATE TABLE IF NOT EXISTS** 全部 7 张表（5 旧 + `topup` + `config`），用当前 `COLUMNS` 经 `createTableSql` 生成——即当前完整 schema，含 v2 加的 `staff.level`、本 spec 加的 `stock_record.unit_price_snapshot`。
3. **重建 `idx_item_record_id`**（`CREATE INDEX IF NOT EXISTS`，DROP TABLE 已删它，非 unique）。
4. **种子 INSERT `staff('-1')`**：固定 id 的虚拟管理员行（补货归属），绕过 `StaffRepository.create` 的随机 `id()`。

`runMigrations` 签名与执行机制不改——版本门控（`version > PRAGMA user_version`）+ `Math.max(...)` 自动选 v3；全新库（`user_version=0`，跑 v1→v2→v3）与老库（`user_version=2`，只跑 v3）都在 v3 执行 DROP+重建，收敛同一 7 表 schema，无 duplicate-column 风险。

### 为什么不触发「冻结历史 CREATE」铁律

铁律针对**保数据加列**：`ALTER ADD COLUMN` 无 `IF NOT EXISTS`，全新库若 v1 CREATE 已含新列、跑到新版本 ALTER 会 duplicate-column，故冻结 v1 CREATE 为加列前字面量。v3 的 DROP 先清空旧表，`CREATE TABLE IF NOT EXISTS` 在空库上用当前完整 schema 建表，**不存在 ALTER，不存在 duplicate-column 场景**——`createTableSql("staff")`（含 level）可直接用，v1 冻结字面量在此路径不再起作用（仅服务于 v1→v2 的增量 ALTER 老路径）。换言之：清库重建与保数据加列是两条互斥的迁移模式，铁律管后者，本 ADR 管前者。

### drift-guard 关系

[ADR-0003](0003-expo-sqlite-adapter-shape.md) 的 drift-guard 绑定 `COLUMNS[t].name` == `SCHEMA[t].columns`（全部 7 表生效，含 topup/config）。**`MIGRATIONS` 字面量不在 drift-guard 覆盖范围**——这正是 v1 冻结 staff 字面量、v3 的 DROP/种子 INSERT 字面量都合法的原因：drift-guard 只校验 registry 双源一致，不校验迁移语句与 registry 的一致（迁移语句可以引用 `createTableSql(...)`，也可以是独立字面量）。

## Consequences

- **+ 两路径收敛，简单。** 全新库与老库都跑同一组 DROP+CREATE+seed，无需为「老库保数据 vs 全新库建表」分叉处理；`createTableSql` 单源直接复用，无冻结字面量的额外维护面。
- **+ drift-guard 不破。** `COLUMNS`↔`SCHEMA` 对 7 表全部一致；新表/新列的 DDL 由 `createTableSql` 单源产出。
- **− 数据丢失（一次性，已确认）。** 老库升级即清空——这是本决策的核心代价，已与用户确认可接受（试用阶段、语义变更、无干净映射）。
- **− 后续若再给 v3 重建过的表加列，须回冻 v3 CREATE。** v3 当时用 `createTableSql` 写入「当时完整 schema」合法；之后增量加列（如 v5 `stock_record.self_use`）会把 `COLUMNS` 推新，若不把 v3（及更早仍含动态 CREATE 的版本）冻成加列前字面量，全新库会在后续 `ALTER` 撞 `duplicate column`。见 `PROJECT_KNOWLEDGE` 加列铁律；checkout-self-use（2026-08）即双冻 v1+v3。
- **− 真实 SQL 仅设备 smoke 覆盖。** v3 的真实 DROP/CREATE/INSERT 执行不在 Jest（[ADR-0004](0004-adapter-verification-device-smoke.md)），发布前须手跑：老库升级（数据清空 + 结构收敛 + `-1` 种子落位）+ 全新库建表（v1→v2→v3 全跑 + 结构等价）。

## Alternatives considered

- **增量 ALTER（保数据铁律路径）。** 拒绝：要给 `stock_record` 加 `unit_price_snapshot`（须冻结 v1 stock_record 字面量 + ALTER）、新建 `topup`/`config`（CREATE IF NOT EXISTS）、种子 `-1`（INSERT）——步骤多且仍触发 stock_record 加列的冻结字面量体操；更关键的是老 per-staff 库存数据无干净映射，保下来只会污染新模型（`shopAggregate` 语义已变）。保数据无价值时，增量式是错的方向。
- **保留旧表 + 只加新表/新列。** 拒绝：留下死 schema（per-staff 库存派生废弃但表结构还在），`shopAggregate`/`MemberBalance` 派生要持续绕过旧语义，长期混淆。
- **给 `runMigrations` 加「列存在性 guard」（跑到 ALTER 前先 `PRAGMA table_info` 判存）。** 拒绝：更重、要改 `runMigrations` 签名（破坏 ADR-0003「executor 极薄」前提），且仍只服务于保数据场景——本次不保数据，无需它。

## References

- PRD: [.scratch/2026-07-10-stock-balance-refactor/01-stock-balance-refactor.md](../../.scratch/2026-07-10-stock-balance-refactor/01-stock-balance-refactor.md)
- Spec: [.scratch/2026-07-10-stock-balance-refactor/specs/01-schema-foundation.md](../../.scratch/2026-07-10-stock-balance-refactor/specs/01-schema-foundation.md)
- Related: [ADR-0003](0003-expo-sqlite-adapter-shape.md) — DDL 与 registry 单源（drift-guard 绑定 `COLUMNS`↔`SCHEMA`，**不**覆盖 `MIGRATIONS` 字面量）；[ADR-0004](0004-adapter-verification-device-smoke.md) — 真实 SQL 执行归设备 smoke
- 铁律对照：[PROJECT_KNOWLEDGE.md](../../PROJECT_KNOWLEDGE.md)「给既有表加列必须冻结历史 CREATE 字面量」——保数据加列场景；本 ADR 是其对照面（清库重建场景）
- Code: `src/data/expo-sqlite-migration.ts`（v3 `MIGRATIONS` 条目）、`src/data/sql-logic.ts`（`SCHEMA` 加 topup/config + stock_record.unit_price_snapshot）
