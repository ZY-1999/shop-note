import { Stack } from 'expo-router';

import { tabIndexTitle } from '@/navigation/tab-config';

/**
 * 记账 tab stack (spec #04 AC4) — lets a list screen push a detail/form screen
 * and `back` return. Each screen's top header shows its Chinese title (nav-tweak
 * #2): 记账 (index) / 会员详情 / 记录详情; `record-form` sets its own title
 * dynamically (入库 / 出库) via `useNavigation().setOptions` in the route.
 */
export default function BookkeepingLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: tabIndexTitle('bookkeeping') }} />
      <Stack.Screen name="record-form" />
      <Stack.Screen name="topup-form" />
      <Stack.Screen name="staff/[id]" options={{ title: '会员详情' }} />
      <Stack.Screen name="record/[id]" options={{ title: '记录详情' }} />
      <Stack.Screen name="topup/[id]" options={{ title: '充值详情' }} />
    </Stack>
  );
}
