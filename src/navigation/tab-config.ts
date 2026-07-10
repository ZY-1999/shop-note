import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';

import type { Direction } from '@/data/stock-record';

/**
 * Navigation文案与 tab 身份的单一事实来源 (nav-tweak)。
 *
 * 底部 tab bar 与顶部标题栏的中文文案都从这里派生，使两条产品规则可在
 * 不渲染 expo-router 原生 `<Tabs>` / `<Stack>` 的情况下被测试（RNTL 无法挂载它们）：
 *   #1 底部 tab bar 仅显示图标 —— `TAB_BAR_SHOW_LABEL = false`，每个 tab 必须有 `icon`
 *   #2 顶部标题栏显示当前页面的中文标题 —— `title` 即首屏标题
 *
 * `AppTabs`（底部栏）与各 tab 的 `_layout.tsx`（顶部 Stack 标题）都消费本模块，
 * 两处文案因此不会漂移。
 */

/** Ionicons 字形名 —— 类型化使得配置里拼错图标名成为编译错误。 */
export type IconName = ComponentProps<typeof Ionicons>['name'];

export type TabName = 'bookkeeping' | 'summary' | 'manage';

export interface TabDef {
  /** `src/app/` 下的路由段名 —— 必须与目录名一致（typedRoutes 会校验）。 */
  name: TabName;
  /** 中文页面标题：既作顶部 Stack 标题，也作 tab 的无障碍名（label 文字已隐藏）。 */
  title: string;
  /** 底部 tab bar 的图标（icon-only）。 */
  icon: IconName;
}

/** 三个业务 tab（spec #04）：记账（默认）/ 汇总 / 管理。顺序即渲染顺序。 */
export const TABS: readonly TabDef[] = [
  { name: 'bookkeeping', title: '记账', icon: 'calculator-outline' },
  { name: 'summary', title: '汇总', icon: 'stats-chart-outline' },
  { name: 'manage', title: '管理', icon: 'settings-outline' },
];

/** 底部 tab bar 仅显示图标，不显示文字标签（nav-tweak #1）。 */
export const TAB_BAR_SHOW_LABEL = false;

/** 每个 tab 首屏的中文标题（顶部 Stack 标题）。 */
export function tabIndexTitle(name: TabName): string {
  const tab = TABS.find((t) => t.name === name);
  if (!tab) throw new Error(`unknown tab: ${name}`);
  return tab.title;
}

/** 记账 posting 表单的动态标题 —— 入库 / 出库，由 direction 参数决定。 */
export function recordFormTitle(direction: Direction): string {
  return direction === 'in' ? '入库' : '出库';
}
