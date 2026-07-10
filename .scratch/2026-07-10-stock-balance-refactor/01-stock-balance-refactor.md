# 库存/余额模型重构

Type: prd
Status: ready-for-agent

## Problem Statement

当前 shop-note 的库存模型是「每会员持有」：每个会员各自有一份按商品分品种的库存余额（`balance(staff, product)`），记账就是给某会员记一笔 `in`/`out`，会员既是库存持有者又是出入库操作对象。

但实际业务不是这样：**库存属于店铺（全局唯一），会员不持有库存**。会员的真实角色是「充值 + 出库」——预付/押金进来（充值），卖货出去（出库扣款）。现有模型无法表达：

- 会员没有「余额」概念，无法记录充值、无法出货扣款。
- 库存散落在每会员名下，没有「全局库存」视角，无法表达「管理员补货、会员从全局库存出货」。
- 出库金额缺少「整单 vs 零售」的销量统计口径——运营需要按一个全局「单价」把出库金额折算成「几整单 + 一点零售零头」，现有模型没有这个单价、也没有这个拆分。

## Solution

把库存与会员职责彻底分离：

- **库存全局化**：库存收敛为唯一一份（管理员 `staff_id='-1'` 补货，复用现有 `shopAggregate` 派生作全局库存），普通会员不再持有库存。
- **会员余额化**：普通会员改为「充值（topup）+ 出库」双动作，新增 `topup` 充值流水表，会员余额 = `Σ充值 − Σ出库 line_amount` 派生（从不存储）。
- **出库扣双账户**：会员出库时从全局库存扣库存、从会员余额扣钱。
- **全局单价 + 金额拆分**：新增全局「单价」配置（独立于商品 `purchase_price`），出库记录快照单价，派生「单数 = floor(出库金额 ÷ 单价) / 零售 = 金额 mod 单价」用于整单 vs 散装统计。

## User Stories

1. 作为管理员，我想在管理页「补货」选商品+数量入库，让全局库存增加，以便会员有货可出。
2. 作为管理员，我想在管理页「配置」设置全局单价，以便出库金额能折算成整单+零售统计。
3. 作为操作员，我想给会员「充值」（仅金额），让该会员余额增加，以便会员有余额出货。
4. 作为操作员，我想给会员记「出库」（选商品+数量），系统从全局库存扣库存、从会员余额扣出库金额、并按单价折算单数+零售，以便记录一笔销售。
5. 作为操作员，我想在记账列表看到每个会员的「余额」，以便知道谁还能出货、谁欠款。
6. 作为操作员，我想在汇总看到「全局库存」（按商品），以便决定何时补货。
7. 作为操作员，我想在汇总看到「综合流水」（补货/出库/充值按天），以便对账。
8. 作为操作员，我想在汇总看到本时间段「出库 X 单 + ¥Y 零售」的聚合，以便了解整单 vs 散装销量。
9. 作为操作员，我想看出库记录详情里的「快照单价 + 单数 + 零售」，以便事后核对——即使单价后来变了，这笔记录也不歧义。
10. 作为操作员，我想在库存或余额不足时仍能出库（产生欠货/欠款），以便「先卖后补 / 先卖后充」，不被系统拦截。
11. 作为操作员，我想作废记错的充值或出库记录，以便修正——作废后余额/库存自动重算。
12. 作为操作员，我不想在会员列表/汇总里看到管理员 `'-1'`，以便列表干净、统计不串味。

## Implementation Decisions

### 库存模型：全局唯一

- **废弃 per-staff 库存派生**：`Inventory.balance` / `staffInventory` / `staffSummaries`（每会员持有）全部移除。
- **全局库存 = `Inventory.shopAggregate`**（派生、按商品分品种），语义重定义为 per-product `Σ(补货 in qty) − Σ(出库 out qty)`，跨所有 staff——`in` 只来自管理员补货。派生逻辑不改（本就跨 staff 求和），只是语义收敛。
- **管理员 = 虚拟会员 `staff_id='-1'`**：在 staff 表插入一条不可删除的特殊行（展示名「管理员」）作为补货归属，使 `staff_id` 引用不悬空、流水有归属名。
  - **初始化**：迁移里直接 `INSERT` 固定 `id='-1'` 的种子行（绕过 `StaffRepository.create` 的随机 `id()`）；repo 不开放创建 `'-1'` 的入口。
  - **删除保护**：`StaffRepository.void('-1')` 抛错（数据层守卫），管理 UI 也不对 `'-1'` 暴露删除/编辑入口。
  - **direction 约束**：`StockRecordRepository.create` 校验 `direction='in'` 时 `staff_id` 必须为 `'-1'`（数据层强制，不靠 UI 约定）。
  - **过滤层**：`StaffRepository.list`/`listActive`/`search` **默认排除** `staff_id='-1'`（repo 层一处过滤，记账列表、汇总、管理 tab 等所有消费者自动受益，无需各自过滤）。

### 补货（in）

- `StockRecord(direction='in', staff_id='-1', items)`，多商品，走**现有入库逻辑**（snapshot title/purchase_price、line_amount = purchase_price × qty）。
- `create` 不审计（沿用 stock-record 一贯规则）。
- 补货记录的「全局单价快照」列为 null（拆分只对出库有意义）。

### 出库（out）

- `StockRecord(direction='out', staff_id=普通会员, items)`，选商品 + 数量，走**现有出库逻辑**。
- **出库金额** = `Σ StockItem.line_amount`（= `Σ purchase_price × qty`，沿用现有口径，不额外输入金额）。
- 扣全局库存（`shopAggregate` 派生自动反映）。
- **`stock_record` 新增列「全局单价快照」**（Cents）：`create` 时从配置读取并冻结；补货(in)记录该列为 null。沿用项目快照铁律——create 时冻结，edit 不重冻结。
- **单数 / 零售纯派生**（不存）：`单数 = floor(出库金额 ÷ 快照单价)`，`零售 = 出库金额 mod 快照单价`。

### 金额拆分纯函数

- 新增纯函数 `splitBundleRetail(amountCents, unitPriceCents) → { bundles, retail }`，单源；出库记账 / 出库记录详情 / 汇总聚合三处复用，避免 floor/mod 逻辑重复。

### 会员余额（派生）

- 新增 `MemberBalance` 派生类：`balance(staff) = Σ(未作废 topup amount) − Σ(该会员未作废 out 记录 line_amount)`，**从不存储**（invariant #4）。
- 出库扣余额 = 该笔 out 的 `Σ line_amount`。
- 余额可负 = 欠款（invariant #5 扩展）。

### 充值（topup）

- 新表 `topup`：`id, staff_id, amount(Cents), timestamp, note(nullable), voided_at(nullable), created_at, updated_at`。
- `TopupRepository`：`create` / `void`（软删）/ 查询；`create` 审计（金钱动作），`void` 审计。
- 充值仅金额，无商品、无条目。

### 全局单价配置

- 新增配置存储（`config` 表，key-value 形态），首项 `unit_price`（Cents）。
- `ConfigRepository`：读 / 更新；更新审计（配置变更留痕）。
- 管理·配置 tab 设置；出库 `create` 时读取并快照到 stock_record。

### 边界（不拦截）

- 出库**不校验**库存或余额充足：欠货（全局库存 < 0）与欠款（余额 < 0）均允许，沿用并扩展 invariant #5。

### Schema 迁移（清库重来）

- 已确认丢弃老数据。新结构：新 `topup` 表 + 新 `config` 表 + `stock_record` 加「全局单价快照」列 + staff 表种子 `'-1'` 管理员行。
- **偏离点（须新 ADR 记录）**：项目既有迁移是**增量式**（`CREATE IF NOT EXISTS` + `ALTER ADD COLUMN`），铁律针对「加列保数据」场景（冻结历史 CREATE 字面量、`ColDef.default` 对称）。本次因**清库重来**改用 **DROP + 重建**模式：新版本迁移先 `DROP TABLE IF EXISTS` 全部既有表，再用最新 `COLUMNS`/`SCHEMA` 重新 `CREATE`。因数据丢弃，**不触发**「加列保数据」场景，故无需冻结历史 CREATE 字面量。全新库（user_version=0）与老库（user_version=2）两条路径都在该版本 DROP+重建，收敛到同一新 schema，无 duplicate-column 风险；`runMigrations` 签名不改。drift-guard（`COLUMNS` 列名 == `SCHEMA` 列名）仍对新表生效。
- 真实 SQL 执行仅由设备 smoke 覆盖（ADR-0004），迁移后真实建表/升级须发布前手跑。

### 记账 tab

- 会员行改为 `[充值][出库]`，展示「**余额 ¥X**」（替代原「库存 X 件/种 ¥X」）；移除「入库」入口。
- 新增充值表单（仅金额）；出库沿用现有 record-form（选商品 + 数量），提交时带全局单价快照。

### 汇总 tab

- 库存卡（`shopAggregate` 全局库存，as-of-now 现价，与时间段无关——沿用现有口径）。
- **综合流水**：补货(in) / 出库(out) / 充值(topup) 三类事件按天分组，取代/扩展现 `dailyFlow`（现 dailyFlow 只含库存 in/out）。三种事件的金额口径：补货/出库用 `line_amount`，充值用 `amount`。
- **'-1' 补货在流水里的展示**：补货事件 `staff_id='-1'`，在综合流水里**按事件类型标注为「补货」**，不作为会员行、不显示会员名——与 US12「汇总隐藏 '-1'」一致：`'-1'` 不出现在会员维度，只以「补货」事件类型出现在流水时间轴里。
- **出库单数零售聚合**：本时间段内 `Σ 单数` / `Σ 零售`（每笔 out 用其快照单价派生后求和）。

### 管理 tab

- 由现 `会员｜商品` 两段扩展为 `会员｜商品｜补货｜配置` 四段。
- 补货段 = 补货入库表单（选商品 + 数量，提交 `in` 记录到 `staff_id='-1'`）。
- 配置段 = 全局单价输入。
- dev smoke 保留。

### 出库记录详情

- 显示「快照单价 + 派生单数 + 零售」，避免单价后续变动产生歧义。

### 作废

- 充值 / 出库作废沿用软删（`voided_at`），余额 / 库存派生自动排除作废记录。

## Testing Decisions

- **好测试只断言外部行为**（用户动作 → 可观测结果），不断言实现细节；通过真实数据栈验证，不 mock repos。
- **不引入新 seam，复用 ADR-0006 双 project**：
  - **data project（ts-jest + `InMemoryAdapter`）**：
    - `splitBundleRetail` 纯函数单测（最高 seam，无 adapter）：边界含「金额 < 单价 → 0 单全零售」「整除」「大额」。
    - `TopupRepository` create/void、`ConfigRepository` 读/更新、stock_record 出库快照单价 → 对 `InMemoryAdapter`，范式同现有 `stock-record.test.ts`。
    - `MemberBalance` 派生 → 对 `InMemoryAdapter`：建充值 + 出库记录，断言 `Σ充值 − Σ出库 line_amount`，含作废排除、负余额。
    - 全局库存语义 → 复用 `inventory.test.ts`，加「补货进 `'-1'` / 出库扣」场景，断言 `shopAggregate`。
  - **ui project（jest-expo + RNTL，真实 `InMemoryAdapter`）**：
    - 记账：充值 → 余额涨；出库 → 全局库存减 + 余额减 + 记录快照单价。
    - 管理：补货 → 全局库存涨；配置单价 → 出库金额拆分随之变。
    - 汇总：综合流水含补货/出库/充值；出库「X 单 ¥Y 零售」聚合正确。
- 先例：`stock-record.test.ts`（repo + snapshot）、`manage-tab.test.tsx`（CRUD 组件流）、`summary-tab.test.tsx`（派生聚合展示）。
- **破坏面（现有测试需迁移）**：`record-detail.test.tsx` 现有断言调用 `inventory.staffInventory`、`manage-tab.test.tsx` 调用 `useBalance`（观察价格重估失效）——这俩方法本次废弃，相关测试须随模型迁移到 `MemberBalance` / 全局库存口径（见 Further Notes 删除面）。
- 真实 SQLite 仍由 ADR-0004 设备 smoke 覆盖，迁移后的真实建表/升级须发布前手跑。
- 跑 UI 测试加 `--forceExit`，勿 `| tail`（PROJECT_KNOWLEDGE 已记）。

## Out of Scope

- 多商品进价**成本核算/利润分析**：补货仍记 `line_amount`（进货成本），但成本/利润报表不在本次。
- 真实 SQLite 自动化测试（仍靠设备 smoke，ADR-0004）。
- 会员等级 `level`（不变）。
- Web 目标（纯移动端，PROJECT_KNOWLEDGE）。
- `purchase_price` 语义重定义（它在出库里继续作 line_amount 计价基准，业务语义留给用户定义）。

## Further Notes

- **最大删除面（按类别枚举；逐文件调用点 / 失效 key 清单留 spec 阶段产出）**：per-staff 库存派生（`balance`/`staffSummaries`/`staffInventory`）是大块删除，波及四处：
  - **数据流层（hooks + query-keys）**：`useStaffSummaries` / `useStaffInventory` / `useBalance`（reads.ts）直接调用废弃方法，须移除/改造为 `MemberBalance` 驱动的新 hook；`query-keys.ts` 的 `inventory.staffSummaries` / `staff` / `balance` key family 一并缩减——记账（消费 `useStaffSummaries`）、staff-detail（`useStaffInventory`）的 hook 接线都要重接。
  - **UI 展示**：记账行、staff-detail、summary 里所有「库存 X 件/种」展示改「余额 ¥X」。
  - **设备 smoke**（`src/data/smoke/behavior-script.ts`）：其多步断言直接调用 `inventory.balance` / `staffInventory`（balance-after-post、price-change、void 等步骤），须改造为 `MemberBalance` + 全局库存（`shopAggregate`）口径——这是 ADR-0004 依赖的**生产代码**（非 Jest），删除方法会让 smoke 崩。
  - **现有 UI 测试**：`record-detail.test.tsx`（断言 `staffInventory`）、`manage-tab.test.tsx`（`useBalance` 观察价格重估）须迁移到新模型。
- **`splitBundleRetail` 必须单源**：金额拆分逻辑在出库记账、记录详情、汇总聚合三处复用，提取为纯函数，否则 floor/mod 易漂移。
- **清库重来**已与用户确认（项目 2026-07 落地、本地试用阶段、核心语义变更、老数据无干净映射）。
- **领域语言沉淀时机**：新术语（管理员/全局库存/补货/充值/全局单价/单数·零售/会员余额 + invariant #4/#5 扩展）**待实现落地后再写入 `CONTEXT.md`**——`CONTEXT.md` 是「当前代码事实」基准，不在 PRD 阶段提前改写以免误导后续读者；本次领域语言决策已完整记录在本 PRD（Implementation Decisions）。
- 现有 grilling 决策快照：多商品保留；单价独立于商品进价；出库金额 = Σ line_amount（不额外输入）；欠货/欠款均允许负；汇总流水为综合视角（含充值）+ 单数零售聚合。
