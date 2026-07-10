# 记账录入表单 — 商品 chip + 步进器、备注 label:input、时间按钮化、出单

Type: spec
Status: ready-for-human # Stage 2 (/tdd) implemented 2026-07-10 — all ACs GREEN in jest/RNTL, tsc clean; chip+步进器+备注label+时间按钮化+出单 全覆盖，写契约/picker 契约无回归
Parent: #01
Blocked by: #1

## Goal

重建录入表单的明细录入 UX：商品搜索结果以可点 chip 呈现（点 = 选中并 qty 1，再点 = +1，不重复建行），每行用数字步进器（−/[input]/+）精调数量，备注改单行 `label: input`，时间控件按钮化（一眼可点）——并应用「出单」方向文案。提交 payload、校验、EDIT 的稳定 item id 合并契约**均不变**。

## Acceptance criteria

- [ ] 搜索商品渲染为 chip；点某商品 chip 新增一行 qty=1；再点**已选**商品的 chip 则其行 qty += 1（不重复建行）——证明 chip 拣选 + 自增（故事 3）。
- [ ] 每个已选明细行有步进器 `− [qty input] +`：`+`/`−` ±1（不低于 1；qty=1 时 `−` 禁用，删行走「删除」），input 可直输数字（提交前校验正整数）；行金额 + 合计随之实时更新——证明步进器精调 + 即时金额（即时金额继承 #06；故事 3）。
- [ ] 备注渲染为 `备注：[单行 input]`（label:input 同行，非 multiline）——证明备注重构（故事 6）。
- [ ] 时间控件为按钮化 Pressable（`inputBg`+`border`+`formatDateTime(timestamp)` 文本 + 一个 affordance 图标），点击挂载 picker；Android dialog confirm/cancel unmount 契约保留、iOS inline 保留——证明可点 affordance（故事 7）+ 日期格式（故事 4）。
- [ ] 方向文案 out = 「出单」，in = 「入库」——证明文案改（故事 2）。
- [ ] 校验仍阻止提交（无明细 / 数量非法 / 无员工）；合法提交走 create/update，**payload 结构不变**；EDIT 模式各行仍携带稳定 item id（touched/untouched 合并契约不破）；out 超持仓不阻——证明写路径无回归（故事 18；#06/#07 不变式）。

## Scope

- **In**: `components/record-form.tsx`（chip 拣选、步进器、备注 label:input、时间按钮化、出单文案）；`record-form.test.tsx`（为新交互重写）；消费 `formatDateTime`（#01）。
- **Out**: `formatDateTime` 本身（#01）；`validateRecordForm` 规则（不变——步进器只是换种方式喂数量）；create/update repo 内部；staff-row / staff-detail / summary。

## Context

- 现状：`record-form.tsx` 搜索→匹配列表→`pickProduct` 加**空 qty** 行→裸 `TextInput keyboardType="numeric"`；`DIRECTION_LABEL = { in:'入库', out:'出库' }`；`@expo/ui` DateTimePicker（Android dialog mount/unmount、iOS inline）；EDIT 行携带稳定 `id`。
- `record-form-validation.ts`（`validateRecordForm(staffId, lines)`——staff / ≥1 项 / 每项有商品 / qty 正整数）。
- PRD 记账 #3 / #4 / #6 / #7；PROJECT_KNOWLEDGE（Android dialog mount/unmount——commits b0b6cd9 / 7aea40b，不可回退）；ADR-0006（RNTL——须 `await fireEvent.*`）。

## Design

- **Interface delta**: `<RecordForm staffId direction edit? onSaved? />` 签名**不变**。内部新增展示子件：chip 列表（搜索结果）+ 每行一个 `<QtyStepper>`。消费 #01 的 `formatDateTime`。
- **Internal architecture**:
  - **商品拣选**：搜索结果（`useProducts({ search: { text } })`）渲染为 Pressable chip；`pickProduct(p)`——productId 已在 lines 则 qty += 1，否则新增 qty=1。**spec 锁定**：pick 后**不清空**搜索框（让 chip 留住可重复点 +1），仅提交/返回时清。
  - **QtyStepper**：`−`（qty=1 时 disabled）+ 受控 TextInput（`keyboardType="numeric"`）+ `+`；onChange 走既有 `setQty` 路径；保留「删除」行控件。即时时长仍 render 时派生（`price × qty`）。
  - **备注**：单行 TextInput + label（复用管理 tab `StaffForm` 的 field/label 样式语汇），`multiline={false}`。
  - **时间**：按钮化 Pressable（`inputBg`+`border`+`formatDateTime` 文本 + Ionicons 图标）→ 既有 mount/unmount picker 逻辑原样复用；`testID="record-time"` 保留。
  - **出单**：`DIRECTION_LABEL.out = '出单'`。
  - **Deep-module note**: QtyStepper 是小的可复用展示件（放本文件或抽到子件，spec 定）。表单的**写契约不变**（快照/合并/失效都仍藏在表单后）——这是不能破的硬约束，步进器只改「怎么喂数量」。

## Rework on failure

隔离在 record-form + 其测试；repo 重新校验，故数量/picker bug 无法污染账本。若 EDIT 合并出问题，根因在步进器如何喂 line id（UI），非 repo 合并。

---

## Stage 2 evidence (implemented 2026-07-10)

`npx jest` → 28 suites / 202 passed（含本 spec 5 个新测试 + 既有 #06/#07 全部无回归）；`npx tsc --noEmit` → exit 0。

- **AC1（chip 拣选：点 = qty 1，再点已选 = +1 不重复建行）** → `src/components/record-form.test.tsx` "picking a chip starts a line at qty 1; tapping it again adds +1 (no duplicate line)"（首点 `qty-0`.value=`"1"`；再点同一 `pick-${id}` → `"2"`；`qty-1` 仍不存在 = 无重复行；且 `pick-${id}` 仍在 = 搜索未清，spec 锁定）。GREEN。
- **AC2（步进器 −/[input]/+，− 在 1 时钳位，删行走删除，直输 + 即时金额）** → "the stepper + increases, − clamps at 1, and 删除 removes the line"（dec-0 在 qty=1 时按下仍 `"1"` 不破 1；inc-0 → `"2"`；dec-0 → `"1"`；remove-0 → qty-0 消失）+ 既有 "updates the line amount and total as the operator types a qty"（直输数量即时金额/合计，×2 `¥12.00`，改 10 → 合计 `30.00`）。GREEN。
- **AC3（备注 label:input 单行）** → "renders 备注 as a label:input field"（`getByText("备注：")` + `testID="note"` TextInput）。GREEN。
- **AC4（时间按钮化 formatDateTime + 图标，Android dialog confirm/cancel unmount 契约保留，iOS inline 保留）** → "the time affordance reflects formatDateTime(timestamp) after a dialog backdate"（Android：tap `record-time` 挂载 `record-time-picker` → onValueChange 回写 → 按钮文本 = `formatDateTime(mockBackdateMs)`）+ 既有 "mounts the picker on tap, confirms via onValueChange, and unmounts"（onValueChange 后 `record-time-picker` 卸载 + 提交时间正确）+ "cancel via onDismiss unmounts without writing a new time"（onDismiss 卸载 + 不写时间）+ "lets the operator backdate the time"（iOS inline `record-time-backdate` 路径）。GREEN。
- **AC5（out = 出单，in = 入库）** → "renders the out-direction as 出单 (not 出库)"（`getByText("出单")` + `queryByText("出库")` null）；`DIRECTION_LABEL = { in:'入库', out:'出单' }`。GREEN。
- **AC6（写契约不变：校验仍阻、payload 结构不变、EDIT 稳定 item id 合并、out 超持仓不阻）** → 既有 "blocks submit with no items" + "blocks submit when a line has a non-integer qty"（校验）+ "posts the record (snapshot at current price) and navigates back"（payload：staff_id/direction/timestamp/items + 价格快照）+ "posts an out exceeding current holdings"（out 超持仓不阻）+ edit 模式由 `record-detail.test.tsx` 覆盖（稳定 id 合并，本 spec 全量跑过无回归）。GREEN。

**改动范围**：`src/components/record-form.tsx`（chip 拣选 + `QtyStepper` 内部子件 + 备注 label:input field + Android 时间按钮 `formatDateTime`+Ionicons + `DIRECTION_LABEL.out='出单'`）+ `src/components/record-form.test.tsx`（+5 新测试，既有 #06/#07 测试保留）。消费 #01 的 `formatDateTime`。`<RecordForm staffId direction edit? onSaved?>` 签名不变；`validateRecordForm` 规则、create/update payload、EDIT 合并契约全不变。

**力学要点**：chip 拣选后**不清搜索框**（spec 锁定——chip 留住可重复点 +1）；`pickProduct` 找到既有行则 `qtyInt+1`，否则新建 `qty:'1'`；步进器 `−` 在 `qtyInt<=1` 时 disabled+钳位，删除走独立「删除」按钮；Android 时间按钮化但 dialog mount/unmount 契约（onValueChange 确认卸载 / onDismiss 取消卸载）原样保留（commits b0b6cd9/7aea40b，PROJECT_KNOWLEDGE 不可回退项）；测试沿用 `waitForSync`/`flushPending`/`queryClient.clear`。

Commit: see `feat(record-form): 商品 chip + 步进器 + 备注 label:input + 时间按钮化 + 出单 (#03)` (this spec's Stage 2 commit).
