# ADR-0004: expo-sqlite 适配器的验证方式 —— 纯逻辑 Jest + 跨适配器 device smoke（不直接 Jest 适配器）

- Status: **Accepted** (2026-07-08)
- Scope: shop-management-system 生产存储适配器（`ExpoSqliteAdapter`）的测试策略

## Context

`ExpoSqliteAdapter`（[ADR-0003](0003-expo-sqlite-adapter-shape.md)）依赖 `expo-sqlite` 的原生模块，真正的 SQL 执行只能发生在设备/模拟器上——Jest（host Node / Hermes-on-host）跑不起原生模块。但 PRD 的核心主张恰恰是"`ExpoSqliteAdapter` 与 `InMemoryAdapter` 行为对等"，必须有可重复、可审查的对等证据。如何在**不放弃真 SQL 覆盖**（唯一值得测的东西）的前提下给出这份证据？这是这层最难逆转、最反直觉的测试决策——它决定了后续所有人如何验证这个适配器。

## Decision

验证拆成两半，沿"逻辑 / 执行"的接缝分开：

1. **纯逻辑全 Jest 覆盖。** SQL 构建层（`sql-logic.ts`：per-table registry、`serializeRow`/`deserializeRow` 的 JSON 列往返、`buildInsert`/`buildUpdate`/`buildFind`、`assertKnownKeys`）与 `expo-sqlite` 零耦合（无 `expo-sqlite` import），Jest 直接覆盖。这部分是"拼 SQL + 序列化"的纯函数，能在 host 上跑全。
2. **适配器（`expo-sqlite.ts`）不单测，改由跨适配器 device smoke 验证。** 同一份 `behaviorScript`（覆盖每个 repository 公开路径的 22 步）跑两套独立 repo 集——一套 backed by `ExpoSqliteAdapter`、一套 by `InMemoryAdapter`——`stable()` 规范化易失字段后逐 step 深比较。两适配器在同一进程内各自铸造 id / 调 `now()`，值不同但**行为**应同；规范化后深相等即对等。
3. **`stable()` 是对等比较的规范化器（纯函数，Jest 覆盖）。** 它折叠两适配器各自的易失痕迹：`id`/`*_id` → `"<id>"`、`*_at`/`timestamp` → `"<time>"`、null/undefined 值键丢弃（port: null≈不存在）。它是 smoke 的关键，而非被测生产逻辑——因此它本身必须有回归测试锁定每一条规范化规则。
4. **device smoke 入口挂在 Home `__DEV__`。** 运行时 `await import("@/data/smoke/run-smoke")` 动态加载，保证 Home 静态 bundle 不拉入 `expo-sqlite`；原生模块只在 smoke 真正跑时加载。结果逐 step 渲染到屏幕 + 完整日志打到 Metro 终端（可滚动/可复制）。

## Consequences

- **+ 真 SQL 覆盖。** device smoke 跑的是 `expo-sqlite` 真实的 `runAsync`/`getAllAsync`——JSON 列往返、事务 `ROLLBACK`、`CHECK` 约束、WAL——这些 Jest 一个都跑不到。
- **+ 对等即正确。** 行为对等是 PRD 核心主张；跨适配器逐 step 深比较直接证明它，比单测适配器内部更能回答"两适配器是否一致"。
- **+ 纯逻辑快速回归。** `sql-logic.ts` 的 Jest 在 host 上秒级跑完，重构 SQL 构建器有快速反馈回路。
- **− 适配器执行器本身无自动化单测。** 执行器（`bind` 拼参、`withTransaction` 的 BEGIN/COMMIT/ROLLBACK）的 bug 只能靠 device smoke 间接发现——所以执行器被刻意保持**极薄**：所有逻辑在 `sql-logic.ts`，执行器只做"拼好的 SQL + bind 数组 → 调原生 API → 取首行/全部行"。薄是这一决策能成立的前提。
- **− device smoke 需人工触发，非 CI。** 发布前需人工在设备/模拟器上跑一次 `runExpoSqliteSmoke()` 确认 22/22 PASS。
- **− `stable()` 需随新易失编码演进。** 每当新 case 让一种 volatile token（id/时间戳）以 `stable()` 直接看不到的编码出现，就要扩一条规范化规则。本次 build 就扩了三条：(a) null 值键 vs 缺失键（`InMemoryAdapter` 回滚的 JSON 克隆丢 undefined 键）；(b) 时间戳嵌在 void/restore `FieldDiff` 的 `new` 下（按同级 `field` 名分类，非自身的 `new` 键）；(c) id 嵌在序列化快照字符串里（`auditableRecord` 的 `product_id:qty:price|…`，按 `id()` token 格式 scrub）。每条都有 `stable.test.ts` 回归测试锁定。**经验法则：跨适配器每次发散几乎都是某种新的 token-泄露编码——先找编码，再在 `stable()` 折叠它，而非改被测代码。**

## Alternatives considered

- **Jest mock 掉 `expo-sqlite` 原生模块。** mock 后"测"的是 mock，不是真 SQL——放弃了"真 SQL 覆盖"这个唯一值得测的东西；且 mock 行为会与真实原生模块漂移，给假信心。否决。
- **Jest 下用 `better-sqlite3` / `node:sqlite` 跑真 SQL。** 能测真 SQL，但引入第二个 SQLite 实现（与设备上的 `expo-sqlite` 不是同一份代码），对等证据变弱（"它对等于 InMemory，且在另一份 SQLite 上也对"≠"它在 expo-sqlite 上对"）；且 React Native 工程加 Node 原生依赖代价大。否决。
- **E2E 框架（如 Detox）。** 过重，且第一版数据层无 UI 可驱动；device smoke 是同一层、更轻、更聚焦的对等证明。否决。
