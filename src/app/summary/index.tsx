import { router } from 'expo-router';

import { SummaryTab } from '@/components/summary-tab';

/**
 * 汇总 tab route (spec #05 rewrite). A thin adapter: renders the router-agnostic
 * `<SummaryTab>` and wires its taps to push the staff / record detail routes (#07,
 * which live under the 记账 stack — expo-router resolves the cross-tab push).
 * Keeping the navigation concern here lets the component be RNTL-testable with no
 * router context (ADR-0006).
 */
export default function SummaryTabRoute() {
  return (
    <SummaryTab
      onOpenStaff={(id) => router.push({ pathname: '/bookkeeping/staff/[id]', params: { id } })}
      onOpenRecord={(recordId) => router.push({ pathname: '/bookkeeping/record/[id]', params: { id: recordId } })}
      onOpenTopup={(topupId) => router.push({ pathname: '/bookkeeping/topup/[id]', params: { id: topupId } })}
    />
  );
}
