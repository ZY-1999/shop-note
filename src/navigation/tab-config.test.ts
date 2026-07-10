import { describe, expect, it } from '@jest/globals';

import { TABS, TAB_BAR_SHOW_LABEL, tabIndexTitle, recordFormTitle } from '@/navigation/tab-config';

/**
 * 导航优化 (nav-tweak) — two product rules driven by a single config module so
 * they stay testable without rendering expo-router's native <Tabs>/<Stack>
 * (which RNTL can't host):
 *   #1 底部 tab bar 仅显示图标（隐藏文字标签，每个 tab 必须有图标）
 *   #2 顶部标题栏显示当前页面的中文标题
 *
 * The config module (`tab-config.ts`) is the single source of truth consumed by
 * `AppTabs` (bottom bar) and each tab's `_layout.tsx` (top header), so these
 * rules can't drift apart.
 */
describe('底部 tab bar — 图标化（nav-tweak #1）', () => {
  it('hides the text labels so the bar is icon-only', () => {
    expect(TAB_BAR_SHOW_LABEL).toBe(false);
  });

  it('ships the three business tabs in the fixed 记账 / 汇总 / 管理 order', () => {
    expect(TABS.map((t) => t.name)).toEqual(['bookkeeping', 'summary', 'manage']);
  });

  it('every tab carries a non-empty icon name (an icon-only bar needs one)', () => {
    expect(TABS.length).toBeGreaterThan(0);
    for (const tab of TABS) {
      expect(typeof tab.icon).toBe('string');
      expect(tab.icon.length).toBeGreaterThan(0);
    }
  });
});

describe('中文页面标题（nav-tweak #2）', () => {
  it('every tab title is a non-empty Chinese string', () => {
    for (const tab of TABS) {
      expect(tab.title.length).toBeGreaterThan(0);
      // 至少含一个 CJK 字符 —— 防止退回英文路由名。
      expect(/[一-鿿]/.test(tab.title)).toBe(true);
    }
  });

  it('tabIndexTitle returns the Chinese header title for each tab index screen', () => {
    expect(tabIndexTitle('bookkeeping')).toBe('记账');
    expect(tabIndexTitle('summary')).toBe('汇总');
    expect(tabIndexTitle('manage')).toBe('管理');
  });

  it('recordFormTitle reflects the posting direction (入库 / 出库)', () => {
    expect(recordFormTitle('in')).toBe('入库');
    expect(recordFormTitle('out')).toBe('出库');
  });
});
