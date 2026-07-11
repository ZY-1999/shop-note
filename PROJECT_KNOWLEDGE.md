# Project Knowledge — shop-note

长期、跨任务可复用的项目事实与踩坑。最小、可溯源；不含密钥/私人信息。
每条附：事实 + 来源 + 适用边界 + 验证证据。过程性知识先进 `docs/feature|specs|handoff`，反复踩坑再沉淀到此。

## 平台

### shop-note 是纯移动端应用，不支持 Web

- **事实**：本地优先、单操作员、离线 iOS/Android 应用（见 `CONTEXT.md`）。无 Web 目标。
- **来源**：Bug 诊断 #1（2026-07）—— Metro 曾因尝试解析 `expo-sqlite` 的 `wa-sqlite.wasm`（Web 专用）而打包失败。
- **适用边界**：不要引入 `react-native-web` / `react-dom` / `web` 打包脚本；`app.json` 的 `web` 字段保留无害，但不应作为构建目标。
- **验证**：移除 web 依赖 + 新增 `metro.config.js` 后，Android bundle 成功。

## 构建 / 调试

### 改动依赖结构后必须 `expo start --clear`

- **事实**：增删 `dependencies`、改 `metro.config.js` 或 resolver 配置后，Metro transformer 缓存 + Hermes bytecode 缓存会保留**旧依赖图**，与新代码 / 新 native runtime 不兼容。
- **症状**：`[runtime not ready]: TypeError: property is not writable` → 连锁 `Global was not installed` + `"main" has not been registered`（NOBRIDGE / bridgeless 模式）。
- **来源**：Bug 诊断 #2（2026-07）—— Bug #1 移除 web 依赖后未清缓存，Android Expo Go 启动即崩；`expo start --clear` 后恢复。
- **适用边界**：当版本契约（reanimated / worklets / Expo Go / RN / React）全部对齐却仍崩，**优先怀疑缓存而非版本**。这是首选、最低成本的排查动作。
- **验证**：清缓存重建后启动成功（用户复测）。

### 跑 UI 测试用 `--forceExit`，别用 `| tail`

- **事实**：React Query `notifyManager` 的残留 `setTimeout(0)` 会让 jest 跑完 UI 测试后进程不退出（[codemap Risk Areas](docs/codemap/project.md) 已记录该 timer，但未给运行实践）。`| tail` 等 stdin EOF 会永久阻塞 → 命令挂死、输出不刷新。
- **推荐命令**：`npx jest <pattern> --colors=false --forceExit > /tmp/out.txt 2>&1` 后读文件，单文件约 3–10s 完成。
- **来源**：2026-07 manage-ui 优化，`npx jest manage-tab` 多次挂起，加 `--forceExit` + 重定向后秒级完成。
- **适用边界**：ui project（jest-expo + RNTL + react-query）。data project（ts-jest，无 React Query）不需要。
- **验证**：manage-tab 单文件 3.9s 退出；全量 27 suites 正常退出。

## 依赖

### `@expo/vector-icons` 需显式安装（expo 57 不再传递依赖）

- **事实**：Expo SDK 57（`expo@57.0.4`）不把 `@expo/vector-icons` 列为依赖；裸项目里 `require.resolve('@expo/vector-icons')` 失败。项目已用 `expo install` 装上 `^15.0.2`（SDK 57 兼容版），`tab-config.ts` 的 Ionicons 图标直接 `import` 即可。
- **来源**：nav-tweak 图标化 tab bar（2026-07-10）—— 首次引入图标时 `require.resolve` 失败；查 `expo/package.json` 确认它不在 `dependencies`。
- **适用边界**：项目里需要矢量图标（Ionicons / FontAwesome 等）时直接 `import`，不必再装；新增图标库走 `npx expo install <pkg>` 让 Expo 选 SDK 兼容版（勿裸 `pnpm add`，以免版本与 SDK 错配）。装完按上文规则 `expo start --clear`。
- **验证**：`expo install @expo/vector-icons` 后 `require.resolve` 成功；`tab-config.ts` 的 `Ionicons` 类型解析与运行时 import 均正常。

## 资源 / 图标

### 应用图标：Z logo + 关键约束

- **事实**：全套应用图标（`icon` / Android 前景·背景·单色 / `favicon` / `splash-icon`）为蓝色渐变 Z logo，主图标合成 `#E6F4FE` 品牌色背景（与 adaptive icon 背景统一）。源素材在本机 `~/Pictures/z-logo`（透明背景的 Z）。生成方式：`uv run --no-project --with Pillow` 写一次性脚本处理（项目无 sharp/PIL 依赖，勿装；脚本为一次性，未入库）。
- **来源**：2026-07-10 应用图标替换任务。
- **适用边界 / 踩坑**：
  - **iOS 主图标不能有透明**（透明区域被系统填黑）→ `icon.png` 必须不透明。
  - **Android adaptive icon 前景需 66% safe-zone**（Z 居中占画布 66%，否则圆形/squircle mask 裁掉尖端）。
  - **`ios.icon` 用普通 PNG，不用 `.icon` bundle**：bundle 需矢量 SVG 才能发挥 iOS 18 自动渐变/着色/半透明效果，位图用不上；原 bundle 已删除，要恢复 iOS 18 tinted/dark 需提供 Z 的矢量 SVG 重新生成 bundle。
  - 验证图标以 Pillow 像素采样为准（视觉模型会把浅色/透明背景误判为"黑色"）。
- **验证**：`icon.png` 四边 8 点全 `#E6F4FE`、0 透明像素；前景/单色透明背景 + Z 居中 66%。

## 数据层 / 迁移

### 给既有表加列必须冻结历史版本的 CREATE 字面量

- **事实**：本项目的 DDL 由 `COLUMNS`（[src/data/expo-sqlite-migration.ts](src/data/expo-sqlite-migration.ts)）经 `createTableSql` **动态生成**；`MIGRATIONS` 版本化、按 `PRAGMA user_version` 门控（`runMigrations` 只跑 `version > current`）。给**既有表加列**时，若把新列加进 `COLUMNS`（drift-guard 要求 `COLUMNS` 列名 == `SCHEMA` 列名，必须同步加），则**全新库**的 v1 `CREATE TABLE` 已含该列；而**老库**需靠新版本 `ALTER TABLE ADD COLUMN` 补列——SQLite `ALTER ADD COLUMN` **无 `IF NOT EXISTS`**，于是全新库跑到该 `ALTER` 会 `duplicate column` 失败。解法：把已发布版本里该表的 `CREATE` **冻结为加列前的历史字面量**（如 `V1_STAFF_DDL`），新版本迁移用 `ALTER ... DEFAULT <回填值>` 给新老两路都补列，两路径都收敛到带新列的表。
- **来源**：会员等级 feature（2026-07-10，`member-rename-level`）给 `staff` 加 `level` 列——spec #01 + 提交 `35bdb9f`；Stage 3 双轴评审确认。配套：给 `ColDef` 加 `default?: string`、`colSql` 发 `DEFAULT <v>`，使 `createTableSql` 产出的新列与 `ALTER` 的 `DEFAULT` **对称**（唯一"无 DEFAULT"的 DDL 是冻结的历史字面量，因其早于该列）。
- **适用边界 / 踩坑**：**任何给 5 张既有表（staff/product/stock_record/stock_record_item/audit_log）加列**都适用——这是默认要走的路，不是特例。冻结的是**已发布的历史版本**该表的 `CREATE` 字面量；`COLUMNS`/`SCHEMA` 仍含新列（drift-guard 绑定的是这两者，**不**覆盖 `MIGRATIONS` 字面量，所以冻结合法）。**不要**在已发布迁移里直接留 `createTableSql(table)`——`COLUMNS` 一旦加列它就漂移、会和 `ALTER` 撞列。替代方案（给 `runMigrations` 加列存在性 guard、跑到 `ALTER` 前先 `PRAGMA table_info` 判存）更重、要改 `runMigrations` 签名，未采纳。
- **验证**：[src/data/expo-sqlite-migration.test.ts](src/data/expo-sqlite-migration.test.ts) 断言 v1 staff 字面量 `!== createTableSql("staff")`、`MIGRATIONS.length === 2`、v2 `ALTER ... DEFAULT 'normal' CHECK(...)` 语句正确；`createTableSql('staff')` 快照含 `level TEXT NOT NULL DEFAULT 'normal' CHECK (level IN ('normal','gold'))`。真实 `ALTER` 执行仅靠**设备 smoke**（ADR-0004，Jest 不覆盖），发布前须手跑：老库升级 existing 行得回填默认值、全新库建表+迁移后列存在。
- **关联**：ADR-0003（DDL 与 registry 共用单源）、ADR-0004（真实 SQL → device smoke）。CONTEXT.md「会员化改名 + 会员等级」条目亦有概述。

### 新引入表的 CREATE TABLE IF NOT EXISTS 不纠正已存在的错误 schema

- **事实**：v3 清库重建迁移只 `DROP TABLE IF EXISTS` 了 5 张老表（staff/product/stock_record/stock_record_item/audit_log），注释假设 topup/config 是 v3 新增、无需 DROP，随后用 `CREATE TABLE IF NOT EXISTS topup/config` 建表。但 `IF NOT EXISTS` **见到表已存在就跳过整条 CREATE**——若累积升级的开发库里 topup/config 已以**旧 schema** 残留（开发期某版代码留下），旧表原样保留，`COLUMNS`/`SCHEMA` 的新列不会补进去。`runMigrations` 的 `user_version` 门控只看版本号、不校验表结构，漂移要等到运行时才炸（`findById` 报 `no such column`）。
- **来源**：Bug 诊断 #3（2026-07-11）—— 全局单价保存报 `no such column: id`；生产 config 表是旧 schema（缺 `id` 列），v3 的 IF NOT EXISTS 跳过重建；修复为 v4 迁移显式 `DROP TABLE IF EXISTS config` + `createTableSql("config")` 强制重建。
- **适用边界 / 踩坑**：**新表（某迁移版本首次引入的表）若在「该版本发布前」曾被以不同结构创建过**（开发期残留、手改 DB、跨分支切换），那个版本的 `CREATE TABLE IF NOT EXISTS` 修不了它——drift-guard 绑定 `COLUMNS`↔`SCHEMA` 列名，**不覆盖磁盘上已存在的旧表**。与「给既有表加列必须冻结历史 CREATE 字面量」对称的另一面：那条防的是全新库 v1 CREATE 已含新列 → 老 ALTER 重复加列；本条防的是旧表残留 → 新 CREATE 被跳过。**任何新表迁移**都适用——若不确定开发库历史，默认 `DROP TABLE IF EXISTS <new> + createTableSql(<new>)`，别只靠 IF NOT EXISTS。
- **验证**：[src/data/expo-sqlite-migration.test.ts](src/data/expo-sqlite-migration.test.ts) v4 断言 `MIGRATIONS` v4 语句 = `["DROP TABLE IF EXISTS config", createTableSql("config")]`；真实 DROP+CREATE 执行靠设备 smoke（ADR-0004，Jest 不覆盖）。
- **关联**：ADR-0003（DDL 与 registry 共用单源）、ADR-0008（清库重建迁移）；与「给既有表加列必须冻结历史版本的 CREATE 字面量」互为对称面。

## UI / 布局

### 全页滚动底部留白用 `BottomTabInset`（theme.ts），别各页硬编码

- **事实**：底部 tab bar（icon-only，[src/components/app-tabs.tsx](src/components/app-tabs.tsx)）占屏幕底部，滚动页（FlatList/ScrollView）最后一项滑到底易被遮挡/贴边。约定：每个滚动页的内容容器加 `paddingBottom: BottomTabInset`（[src/constants/theme.ts](src/constants/theme.ts)，`Platform.select({ ios: 50, android: 80 })`）。FlatList 加在 `contentContainerStyle`，ScrollView 加在内容 `style`。
- **来源**：2026-07-11 —— 用户反馈「全部页面滑动底部展示不全」。`BottomTabInset` 此前已定义并在 codemap 登记，但**全仓库零引用**（定义了没接上），是各页缺底部留白的根因；本次接入 7 个滚动页（记账首页/管理/会员详情/记录详情/记录表单/充值表单/汇总）。
- **适用边界 / 踩坑**：**新增任何滚动页**都应加 `paddingBottom: BottomTabInset`，不要逐页硬编码数字。值偏大/偏小**只改 `BottomTabInset` 一处**（单点旋钮）。默认 expo-router `Tabs` 为 in-flow（内容不延伸到 tab bar 下），该常量值偏保守以确保内容肯定可见；真机若觉留白过大，下调即可。`items-selector`（modal 选择器）、`smoke-entry`（dev 烟雾屏）非「页面」，未接入。
- **验证**：接入后 `tsc` 通过、12 suites / 120 测试 GREEN（纯样式，无行为断言变更）；真机留白体感靠设备目检。
- **关联**：[src/constants/theme.ts](src/constants/theme.ts) 的 `BottomTabInset`；codemap [docs/codemap/project.md](docs/codemap/project.md) 已登记该常量为 theme.ts 职责。
