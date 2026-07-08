# Shop Management System (店铺管理系统)

Type: prd
Status: ready-for-agent

## 问题陈述

单店运营者需要在一个设备上、离线、无后端的情况下，追踪每位员工持有的商品、该库存的成本价值，以及库存变动和主数据编辑的完整历史。当前应用是 Expo 模板，没有任何系统——经营者只能靠纸笔/Excel，数据无问责、总额易错、无审计痕迹。

## 解决方案

一个本地优先、单操作员的店铺管理 App（Expo SDK 57 / React Native + 设备端 SQLite），包含五个相互依赖的模块：人员管理、商品管理、员工库存（从出入库账本派生）、出入库记录、字段级审计日志。库存余额与成本金额由变动账本派生；记录可编辑/可作废并全程审计；允许负库存（员工可欠货）。所有金额均为成本估值（无售价、无销售模块）。

## 用户故事

人员管理
1. 作为操作者，我想新增员工（姓名、电话、备注），以便追踪谁持有库存。
2. 作为操作者，我想修改员工资料，以便联系方式保持最新。
3. 作为操作者，我想假删除员工，使其不再出现在新交易的选项中，但保留其历史记录。
4. 作为操作者，我想恢复被假删除的员工。
5. 作为操作者，我想查看在职员工列表（可搜索），以便快速找人。
6. 作为操作者，我想查看员工详情及其当前库存与金额，以便知道其持货情况。

商品管理
7. 作为操作者，我想新增商品（标题、进货价、可选 code/barcode、可选 category）。
8. 作为操作者，我想修改商品的价格/标题/code/category。
9. 作为操作者，我想让修改进货价后，所有当前库存自动按新成本重新估值。
10. 作为操作者，我想假删除商品，使其不再用于新变动，但保留历史快照。
11. 作为操作者，我想恢复被假删除的商品。
12. 作为操作者，我想对约 1000 个商品按标题/code/category 搜索筛选。
13. 作为操作者，我想查看商品详情及其在各员工的分布与汇总，以便知道货物去向。

员工库存管理
14. 作为操作者，我想看到每位员工对每件商品的当前剩余数量与成本金额。
15. 作为操作者，我想余额自动由所有出入库记录派生，永远与账本一致（无漂移）。
16. 作为操作者，我想金额反映商品当前进货价（当前成本估值）。
17. 作为操作者，我想看到店铺级汇总（跨员工合计），以便掌握总量与总值。
18. 作为操作者，我想允许负库存（显示为欠货/待补），以便在补货单据未到时仍能记出库。

出入库记录
19. 作为操作者，我想为一位员工一次记录含多个商品明细的入库或出库。
20. 作为操作者，我想每条明细在录入时快照商品标题与单价，以便历史记录不随后续商品编辑而失真。
21. 作为操作者，我想能设置/补录记录时间，以便补登记早先发生的变动。
22. 作为操作者，我想为记录加备注（原因、单号）。
23. 作为操作者，我想能编辑已过账记录的明细/备注，且变更进入审计日志。
24. 作为操作者，我想能作废（假删除）记录，使其不计入余额但保留审计。
25. 作为操作者，我想余额在记录被编辑/作废后立即更新。
26. 作为操作者，我想查看员工的变动历史，以便追溯其库存变化。
27. 作为操作者，我想按员工、方向、日期范围筛选记录。

日志
28. 作为操作者，我想每次员工/商品的 创建/更新/删除/恢复 都记录字段级 old→new 差异。
29. 作为操作者，我想每次出入库的 编辑/作废 都被记录，以便追溯影响余额的改动。
30. 作为操作者，我想以只读时间线查看审计日志（按实体类型、动作、日期筛选）。
31. 作为操作者，我想审计日志显示动作执行者与时间（单操作者：actor = owner）。

通用
32. 作为操作者，我想所有数据本地存储（离线优先），无网络也能用。
33. 作为操作者，我想金额以元（CNY、两位小数）显示、数量以整数显示。
34. 作为操作者，我想在约 1000 商品与记录增长下，应用仍保持流畅。

## 实施决策

- 平台/技术栈：Expo SDK 57 / React Native；设备端 SQLite 经 `expo-sqlite`（尚未安装，需加入依赖）；本地优先，无网络/鉴权/同步。
- 数据层架构：一个无 React 依赖的纯 TS repository 模块，建在 storage port 之上；生产 adapter = expo-sqlite。UI 仅作薄消费者。
- Schema（编码关键决策的形状）：
  - `staff`: id, name, phone, notes, voided_at(nullable), created_at, updated_at
  - `product`: id, title, purchase_price(int 分), code(nullable), category(nullable), voided_at(nullable), created_at, updated_at
  - `stock_record`(表头): id, staff_id(FK), direction('in'|'out'), timestamp(用户可设), note, voided_at(nullable), created_at, updated_at
  - `stock_record_item`(明细/快照): id, record_id(FK), product_id(FK), title(快照), unit_price(快照, 分), qty(int), line_amount(分)
  - `audit_log`: id, actor, action('create'|'update'|'void'|'restore'), entity_type, entity_id, timestamp + 字段差异（`audit_log_field` 子表 field/old/new，或 JSON diff 列）
- 派生余额（不存储）：balance(staff,product) = SUM(qty, direction='in' 且未作废) − SUM(qty, direction='out' 且未作废)；店铺汇总 = 跨员工 SUM。
- 成本估值：amount(staff,product) = product.purchase_price(当前) × balance qty；实时计算；改价即重估。
- 快照保真：明细冻结 title + unit_price；product_id 作 FK 保留，用于派生并在商品编辑/假删除后仍可关联。
- 负库存：出库不做校验阻断；余额/金额可为负（显示为“欠货”）。
- 编辑/作废：记录可编辑、可作废(voided_at)；绝不硬删；变更进 audit_log。
- 假删除语义：员工/商品置 voided_at 后从新交易的选择器中排除；历史引用（明细、审计）保持完整；可清除 voided_at 恢复。
- 审计覆盖：员工 CRUD、商品 CRUD、出入库 edit/void——字段级差异。
- 金额/数量：price 存整数分；qty 整数；显示为元（CNY、两位小数）。
- 时间戳：记录 timestamp 用户可设（默认 now，可补录）；审计/系统字段取真实 now。

## 测试决策

- 好测试：只测 repository 层外部行为（输入 → 可观测输出/状态），不测 SQL 内部或 React 渲染；每个不变量一条断言。
- 单一 seam：repository 公共 API；在 Jest 中用 in-memory storage port 测试（无设备）。
- 被测模块：repository/数据层（五个模块的全部逻辑）。
- 测试证明：派生正确（入−出−作废）、成本估值（当前价×数量、改价重估）、作废回滚余额、编辑更新余额、所有变更捕获字段级审计差异、假删除从选择器隐藏但保留历史、允许负余额、快照保真（商品编辑后 title/价格仍冻结）。
- 不做单测（改由设备端冒烟验证）：expo-sqlite adapter 的真实 SQL 执行、UI 导航/渲染、端到端流程。
- 先例：无——绿地项目（无现存测试）。若日后加组件测试，使用 jest-expo 预设。

## 范围外

- 多设备同步、云后端、鉴权/登录。
- 备份/恢复 + CSV 导出（推迟到 v2）。已知风险：设备丢失即数据丢失。
- 售价 / 销售 / POS / 客户记录——所有金额仅成本估值。
- 批次/FIFO 成本基础估值——采用当前价估值替代。
- 负库存阻断校验——允许负值。
- 摄像头扫码（code 字段会存储；扫码器推迟）。
- 任何记录的硬删除（永不；仅作废）。

## 补充说明

- 已知 MVP 限制：无备份/导出——v2 前为可接受风险。
- app.json 开启 React Compiler 与 typedRoutes 实验——组件须遵循 rules-of-react；路由名类型受检。
- 现有模板导航使用 `expo-router/unstable-native-tabs`（unstable API，见 src/components/app-tabs.tsx）——将在此基础上扩展 5 个模块的 Tab。
- Expo SDK 57 版本文档：https://docs.expo.dev/versions/v57.0.0/

## Comments

- 2026-07-08 — drafted via /grilling + /to-prd；对抗性评审 PASS（修复 1 处：`expo-router/unstable-native-tabs` 路径分隔符由下划线更正为连字符）。待 Gate 0 评审。
- 2026-07-08 — Gate 0 通过（用户 reviewed）。状态 `ready-for-human` → `ready-for-agent`，进入 /sdd-flow 执行；下一步 /to-spec 拆分 specs。
