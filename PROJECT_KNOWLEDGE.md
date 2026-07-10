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
