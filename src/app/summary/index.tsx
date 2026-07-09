import { router } from 'expo-router';

import { SummaryTab } from '@/components/summary-tab';

/**
 * 汇总 tab route (spec #08). A thin adapter: renders the router-agnostic
 * `<SummaryTab>` and wires its by-staff tap to push the staff detail route (#07,
 * lives under the 记账 stack — expo-router resolves the cross-tab push). Keeping
 * the navigation concern here lets the component be RNTL-testable with no router
 * context (ADR-0006).
 */
export default function SummaryTabRoute() {
  return (
    <SummaryTab onOpenStaff={(id) => router.push({ pathname: '/bookkeeping/staff/[id]', params: { id } })} />
  );
}
