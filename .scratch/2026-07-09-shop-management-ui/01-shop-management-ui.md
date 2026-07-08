# 店铺管理 UI（Shop Management UI）

Type: prd
Status: ready-for-agent

## 问题陈述

店铺管理系统的**数据层已完成**（staff / product / stock-record / audit / inventory + expo-sqlite 生产 adapter + 跨适配器 device smoke），但 app 仍是 Expo 默认模板（Home / Explore 两个 demo tab），**没有任何业务屏幕消费这些 repository**。单店运营者在设备上无法实际使用——无法便捷地记出入库、查看库存与金额、管理员工与商品。CodeMap 反复标注“production composition root missing”“no screen consumes the repos”。需要把数据层接到 UI，让运营者在设备上完成日常店铺管理。

## 解决方案

在现有数据层之上构建**首批店铺管理 UI**：组合根（app 启动时构造 repo 集注入 React）+ hook 层（React Query 数据流）+ **三 tab 导航**（记账首页 / 汇总 / 管理）+ 业务屏幕与表单。**记账优先**——首页按员工组织，搜索员工即可出入库；**汇总**含新增派生读模型「每日流水 dailyFlow」（按天×员工的出入库金额）；**管理**收拢员工/商品 CRUD。审计日志查看屏幕首批不做（数据层已记录字段级 diff，展示推迟）。

## 用户故事

组合根与导航
1. 作为操作者，我想打开 app 直接进入记账，以便最快开始日常出入库。
2. 作为操作者，我想在三个 tab（记账 / 汇总 / 管理）间切换，以便按任务分区。
3. 作为操作者，我想 app 启动时自动初始化数据库，无需手动配置。

记账（首页 — 员工入口列表）
4. 作为操作者，我想在记账首页按姓名 / 电话搜索员工，以便快速定位要记账的人。
5. 作为操作者，我想看到每位员工当前的持货摘要（品种数 / 总数量 / 总金额），以便记账时知道上下文。
6. 作为操作者，我想在员工栏直接点【入库】或【出库】，以便一键进入预填该员工的录入表单。
7. 作为操作者，我想点员工进入其详情（当前持货明细 + 变动历史），以便回看。
8. 作为操作者，我想欠货（负库存）在摘要里明显标识，以便发现待补。

出入库录入
9. 作为操作者，我想在一次入库 / 出库里录入多个商品明细（选商品 + 数量），以便一次记多笔。
10. 作为操作者，我想录入时实时看到每行金额和整单金额，以便核对。
11. 作为操作者，我想为记录设置 / 补录时间、加备注（原因 / 单号），以便补登记或说明。
12. 作为操作者，我想提交后库存立即更新、回到员工栏能看到新余额，以便确认记账生效。
13. 作为操作者，我想表单在我漏填员工 / 明细 / 数量时阻止提交并提示，以免脏数据。

记录详情 / 编辑 / 作废
14. 作为操作者，我想从员工变动历史点开某条记录看明细快照，以便回看。
15. 作为操作者，我想编辑已过账记录的明细 / 备注，且改动进审计，以便修正错误。
16. 作为操作者，我想编辑时只重快照被改动的明细、未动的保留原快照，以保持历史保真。
17. 作为操作者，我想作废记录使其不计入余额但保留审计，以便撤销误记。

汇总 tab
18. 作为操作者，我想在汇总 tab 看店铺总览（跨员工合计数量 / 金额），以便掌握全店。
19. 作为操作者，我想看每日出入库金额流水（按天 × 员工，入库多少 / 出库多少，日期倒序），以便对账和看经营节奏。
20. 作为操作者，我想按员工维度看库存分布，以便知道谁持有什么。
21. 作为操作者，我想按商品维度看在各员工的分布，以便知道货的去向。

管理 tab（员工 / 商品 CRUD）
22. 作为操作者，我想新增员工（姓名 / 电话 / 备注）。
23. 作为操作者，我想修改员工资料。
24. 作为操作者，我想假删除员工使其不出现在新交易选项，但保留历史。
25. 作为操作者，我想恢复被假删除的员工。
26. 作为操作者，我想在员工列表搜索。
27. 作为操作者，我想新增商品（标题 / 进货价 / 可选 code / category）。
28. 作为操作者，我想修改商品（标题 / 价格 / code / category）。
29. 作为操作者，我想改进货价后当前库存自动按新价重估金额。
30. 作为操作者，我想假删除商品使其不再用于新变动但保留历史快照。
31. 作为操作者，我想恢复被假删除的商品。
32. 作为操作者，我想在约 1000 商品里按标题 / code / category 搜索筛选。

通用
33. 作为操作者，我想金额以元（CNY 两位小数）显示、数量整数。
34. 作为操作者，我想金额正 / 负、入库 / 出库用颜色区分，以便一眼看清。
35. 作为操作者，我想所有数据本地存储（离线优先），无网络也能用。
36. 作为操作者，我想 app 在数据库初始化失败时显示可重试的错误屏，而不是崩溃。
37. 作为操作者，我想在约 1000 商品与记录增长下，列表与记账仍流畅。

## 实施决策

导航与信息架构
- 三 tab：**记账**（首页，默认）→ **汇总** → **管理**。基于现有 `NativeTabs`（`expo-router/unstable-native-tabs`）扩展为 3 个 trigger，每个 tab 内用 Stack 跳详情 / 表单 / 编辑子屏。tab 内 Stack 嵌套能力在 spec 阶段查 Expo SDK 57 文档确认（已知实现风险，必要时退回稳定 `Tabs` + 嵌套路由）。
- **记账 tab** = 员工入口列表（搜索 + 每员工持货摘要 + 入库 / 出库按钮）→ 点员工进**员工详情**（当前持货明细 + 变动历史）→ 历史项进**记录详情**（编辑 / 作废）。新建记录入口 = 员工栏的【入库 / 出库】按钮 → 录入表单（预填员工）。
- **汇总 tab** = 店铺总览 / 每日流水 / 按员工 / 按商品 四个视图切换。
- **管理 tab** = 顶部切换 员工 | 商品，各自列表 + 详情 + 表单（增改 / 假删 / 恢复）。
- 删除现有 Explore tab 及模板 demo 内容；保留 splash 启动动画。

组合根（详见 ADR-0005）
- app 启动：`ExpoSqliteAdapter.open("shop_note.db")` → `setupRepos(adapter)` → 经 **React Context** 注入；UI 通过 `useRepos()` 消费。
- `setupRepos` + `Repos` 类型从 smoke 子包提到**共享模块**，UI 与 device smoke 共用同一份装配，避免两套 wiring 漂移。
- DB 未就绪期间不 hide splash（不露空屏）；`open` 失败 → **错误屏 + 重试**（不红屏崩溃）。
- `__DEV__` device smoke 入口**保留**（移至管理 tab 的 dev-only 区），继续用独立 `shop_note_smoke.db`，与生产库隔离。

hook 层 — 数据流（详见 ADR-0005）
- 引入 `@tanstack/react-query`：query hook（`useStaff` / `useProducts` / `useStockRecords` / `useInventory` / `useDailyFlow`）+ mutation hook（`onSuccess` 里 `invalidateQueries`）。
- 派生读（balance / shopAggregate / dailyFlow）**仍是纯计算、不存**（守 ADR-0002），靠精准 invalidate 控性能，而非缓存结果。
- 记账 tab 的 N 个员工持货摘要从**一次 `shopAggregate()`** 按 staff group 出，不对每员工单独算 N 次。
- 写串行：`ExpoSqliteAdapter.withTransaction` 不可重入，hook 触发的 mutate 不能并发嵌套。

数据层增量 — `dailyFlow` 派生读模型
- 新增派生模块，与 `Inventory` 同级：按 (天, 员工) 聚合**未作废**记录的 snapshot `line_amount`，按 `direction` 拆 in / out，日期倒序。
- 金额口径 = **历史快照 `line_amount`**（录入时冻结的单价 × 数量），**不**按当前进货价重估（保持“那天发生了多少”的流水语义）。
- 纯 TS、不存储、Jest 可测（同 ADR-0002 规则）。

样式与组件（详见 ADR-0005）
- 沿用 RN `StyleSheet` + 扩展 `theme.ts`：在现有 5 个语义 token（text / background / backgroundElement / backgroundSelected / textSecondary）基础上新增 `success`(入库 / 正) / `danger`(出库 / 欠货 / 作废) / `warning` / `border` / `inputBg` / `accent`。
- 业务组件自建（如 `StaffRow` / `RecordCard` / `ProductRow` / `MoneyText`）；原生输入控件（TextField / Picker / SegmentedControl）按需用**已装的 `@expo/ui`**。
- 列表用 RN `FlatList` + 内存搜索（走 repo `search()`）；1000 商品实测卡再换 FlashList。
- 表单自建受控（`useState` + 即时金额计算 + 提交前校验），**不引** react-hook-form。
- 金额：`Cents` → 元（两位小数）；qty 整数；负数显示「欠货」；`MoneyText` 统一格式化与正负色。

## 测试决策

- **单一 seam**：`StoragePort`（`InMemoryAdapter`）——数据层单测和 UI 组件测试都复用它（ADR-0001），不新增独立 seam。
- **好测试**：只测外部行为（输入 → 可观测输出），从**用户行为**驱动（搜索 → 点击 → 填写 → 提交 → 观察），不断言内部状态。
- **数据层增量（`dailyFlow`）**：Jest against `InMemoryAdapter`，沿用现有 `inventory.test.ts` 范式（先例）。
- **UI 层（组件 / hook / 屏 / 用户行为流）**：**React Native Testing Library** + 真实 `InMemoryAdapter` + 内存 `QueryClient`（**不 mock Repos**），经测试专用 Provider 注入。覆盖：
  - 金额格式化（`MoneyText`：Cents→元、负数→欠货、正负色）。
  - 展示组件（`StaffRow` / `RecordCard` / `ProductRow` 等）。
  - 全部 hook（query 返回 + mutation 成功后 invalidate 触发刷新）。
  - 表单：出入库多明细录入（明细增删 + 即时金额计算 + 校验）、员工 / 商品 CRUD 校验。
  - 屏级集成：记账 / 汇总 / 管理 三 tab。
  - 用户行为流：新建记录→库存更新、编辑→余额变、作废→余额归零、假删除→选择器消失、改进货价→金额重估、每日流水渲染、组合根 `open` 失败→错误屏 + 重试（mock `open` 抛错）。
- **边界（RNTL 不覆盖）**：跨屏导航 push 用 mock router 只验证导航调用 + 目标屏独立测；真实 SQL 执行留 device smoke（ADR-0004）；深色模式 / 手感留手动。
- **先例**：数据层 11 个 Jest suite（`InMemoryAdapter` seam）+ device smoke（ADR-0004）。UI 组件测试是新增测试层（RNTL + jest-expo）。
- **版本兼容风险**：RNTL / jest-expo 需兼容 React 19.2 / RN 0.86 / Expo 57（均新版），spec 阶段查证锁定具体版本。

## 范围外

- 审计日志查看屏幕（数据层已记录字段级 diff；UI 展示推迟）。
- 员工 / 商品详情页显示审计历史段。
- 备份 / 导出 / CSV（v2，系统 PRD 已推迟）。
- 售价 / 销售 / POS / 客户记录（系统 PRD 范围外）。
- 多设备同步 / 云后端 / 鉴权（系统 PRD 范围外）。
- 摄像头扫码（系统 PRD 范围外）。
- NativeWind / 外部 UI 组件库（ADR-0005 否决）。
- react-hook-form / Detox / E2E（ADR-0005 / 0006 否决）。

## 补充说明

- 依赖增量：`@tanstack/react-query`、`@testing-library/react-native`、`jest-expo`。
- 已知实现风险 / spec 阶段待办：
  - `NativeTabs`（unstable）改 3 trigger + tab 内 Stack 嵌套——查 v57 文档确认能力，必要时退回稳定 `Tabs` + 嵌套路由。
  - `withTransaction` 不可重入 vs React Query 并发 mutate——spec 定串行化机制（如 mutation gate），避免两个快速 mutate 在 `BEGIN` 上撞车。
  - `setupRepos` / `Repos` 类型改动（接入 `dailyFlow`）会波及 smoke 的 22 步 behaviorScript——spec 同步（至少编译通过，酌情加 dailyFlow 断言步）。
  - splash hide 与 DB init 是两条独立异步流——spec 定合并触发点（DB 就绪 + layout onLayout 都满足才 hide）。
  - smoke 入口从 Home 移到管理 tab dev-only 区——spec 同步更新 CodeMap 的 Entry Index / Cross-Module Flows。
  - RNTL / jest-expo 版本需兼容 React 19.2 / RN 0.86 / Expo 57——spec 锁定具体版本。
- React Compiler 已开启（app.json），组件须遵循 rules-of-react；React Query 兼容。
- `typedRoutes` 开启，路由名类型受检，改名需同步 `Href` / `Link` 引用。
- `.web.*` 平台变体：`app-tabs` / `animated-icon`（`.web.tsx`）与 `use-color-scheme`（`.web.ts`）有 web 兄弟文件，改动需同步。
- Expo SDK 57 版本文档：https://docs.expo.dev/versions/v57.0.0/
- 关联：系统 PRD [.scratch/2026-07-08-shop-management-system/01-shop-management-system.md](../2026-07-08-shop-management-system/01-shop-management-system.md)；[ADR-0005](../../../docs/adr/0005-ui-layer-architecture.md) UI 层架构；[ADR-0006](../../../docs/adr/0006-ui-component-testing-rntl.md) UI 组件测试；[ADR-0004](../../../docs/adr/0004-adapter-verification-device-smoke.md) device smoke。

## Comments

- 2026-07-09 — drafted via `/idea-to-prd`（`/grilling` + `/domain-modeling` 沉淀 CONTEXT / ADR-0005 / ADR-0006，再 `/to-prd`）。
- 2026-07-09 — 对抗性评审 **PASS**（fresh-context general-purpose sub-agent，veracity first：所有既定事实对照代码核验通过，无 veracity defect；feasibility 风险均已诚实标注）。据评审 minor 建议 fold 入：`.web.*` 表述修正、theme 现有 token 数精确化、spec 阶段待办（串行化机制 / smoke 同步 / splash 协调 / codemap 维护 / 版本锁定）显式化。状态 `needs-info` → `ready-for-human`，待 Gate 0。
- 2026-07-09 — Gate 0 通过（用户 reviewed）。状态 `ready-for-human` → `ready-for-agent`，进入 /sdd-flow 执行；下一步 /to-spec 拆分 specs（系统 PRD 数据层已 ship，本 PRD 为其 UI 延续）。
