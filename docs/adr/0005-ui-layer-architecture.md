# ADR-0005: UI 层架构 —— 组合根 Context 注入 + React Query 数据流 + StyleSheet（不引 NativeWind）

- Status: **Accepted** (2026-07-09)
- Scope: shop-management-ui（首批店铺管理屏幕 + 组合根 + hook 层）

## Context

数据层（[ADR-0001](0001-storage-port-shape.md)~[0004](0004-adapter-verification-device-smoke.md)）已 production-grade，但 codemap 反复标注“production composition root missing”“no screen consumes the repos”。现在建首批 UI，三个地基决策难逆转、影响所有未来 UI feature：

1. UI 怎么拿到 repo（依赖注入方式）？
2. 写之后读怎么刷新（数据流 / 缓存失效）？
3. 用什么样式范式（StyleSheet / NativeWind / 组件库）？

## Decision

**1. 组合根用 React Context 注入，复用并提取 `setupRepos`。**

- `_layout` 外层 `AppProvider`：`useEffect` 里 `ExpoSqliteAdapter.open("shop_note.db")` → `setupRepos(adapter)` → state；`useRepos()` 消费。
- `setupRepos` + `Repos` 类型从 `smoke/behavior-script.ts` 提到共享模块（`src/data/composition.ts`），UI 与 smoke 共用同一份装配，避免两套 wiring 漂移。
- DB 未就绪期间不 hide splash（不露空屏）；`open` 失败 → 错误屏 + 重试（不红屏崩溃）。

**2. 数据流用 React Query（`@tanstack/react-query`）。**

- query hook = `useQuery`；mutation hook = `useMutation` + `onSuccess` 里 `invalidateQueries`。
- 派生读（`balance` / `shopAggregate` / `dailyFlow`）**仍是纯计算、不存**（守 [ADR-0002](0002-derived-inventory-never-stored.md)），靠 invalidate 精准控性能，而非缓存结果。
- 记账 tab 的 N 个员工持货摘要从一次 `shopAggregate()` 按 staff group 出，不对每员工单独算 N 次。

**3. 样式沿用 RN `StyleSheet` + 扩展 `theme.ts`，不引 NativeWind / 组件库。**

- 扩展 `Colors` 加语义 token：`success`(入库/正)、`danger`(出库/欠货/作废)、`warning`、`border`、`inputBg`、`accent`。
- 原生输入控件（TextField / Picker / SegmentedControl）按需用已装的 `@expo/ui`。
- 列表（1000 商品）用 RN `FlatList` + 内存搜索（走 repo `search()`），实测卡再换 FlashList。

## Consequences

- **+** 组合根一处装配，UI 树任意深度 `useRepos()`；UI 与 smoke 共用 `setupRepos`，装配逻辑不漂移。
- **+** 写后自动失效重拉，派生读（库存 / 每日流水）始终与账本一致，UI 不需手动 refetch。
- **+** 零额外样式配置，与现有 `ThemedText` / `theme.ts` 范式无缝。
- **−** 加一个依赖 `@tanstack/react-query`（轻、纯客户端、兼容 React Compiler）。
- **−** 引入 query key 约定，需在 hook 层统一 key 规范（spec 阶段定）。
- **−** `ExpoSqliteAdapter.withTransaction` 不可重入（[port.ts](../../src/data/port.ts)）——hook 触发的写要串行，不能并发两个 mutate。

## Alternatives considered

- **组合根用模块级单例**：否决——不可替换、测试不友好，且与 React 的 provider 模型割裂。
- **数据流自建 version 计数器**：否决——invalidate 要自己维护，易漏致数据不一致。
- **数据流手动 refetch**：否决——哪处忘 refetch 就漂移。
- **NativeWind**：否决——根目录无 metro/babel 配置，引 NativeWind 要从零搭且迁移现有 `ThemedText` / `theme.ts` 范式；与 React Compiler / reanimated 4 新架构兼容需单独验证；对单操作者应用不值得这个配置成本。
- **组件库（Paper / gluestack / tamagui）**：否决——重，与现有轻量范式冲突，overkill。

## References

- UI PRD: [.scratch/2026-07-09-shop-management-ui/01-shop-management-ui.md](../../.scratch/2026-07-09-shop-management-ui/01-shop-management-ui.md)
- Code（将落地）: `src/data/composition.ts`, `src/app/providers.tsx`, `src/hooks/*`
- Related: [ADR-0001](0001-storage-port-shape.md)（storage port）, [ADR-0002](0002-derived-inventory-never-stored.md)（派生不存）, [ADR-0006](0006-ui-component-testing-rntl.md)（UI 测试）

## Amendments

### 2026-07-11 —— QueryClient `refetchOnMount` 由 false 改 true

原 `createQueryClient` 默认 `refetchOnMount: false`（代码注释「refetch on focus and mount both off」），意图是「无远端、无需 mount 重取」。但这对**失效时无组件观察**的查询留了一个 stale 窗口：从记账列表点出库提交时，会员详情未挂载，其 records / topups / balance 查询处于 inactive，失效只刷新 active 查询；重新进入该页面挂载时 `refetchOnMount: false` 阻止重取 → 显示失效前的旧缓存（会员详情记录不是最新）。

改为 `refetchOnMount: true`。配合 `staleTime: Infinity`：**只有被失效过的查询**才在 remount 时重取；未失效的查询仍不重取（不引入多余请求，也不破坏派生读的 no-stale-window）。这与 Consequence「写后自动失效重拉…UI 不需手动 refetch」一致 —— `refetchOnMount: true` 是让它真正成立的前提，而非偏离。

- 代码：[src/providers/providers.tsx](../../src/providers/providers.tsx) `createQueryClient`。
- 回归测试：`src/providers/providers.test.tsx`（invalidate-while-inactive → remount 必见新数据）。
- 修复提交：`2ea7fec`。
