import { Stack } from 'expo-router';

import { tabIndexTitle } from '@/navigation/tab-config';

/** 汇总 tab stack (spec #04). Top header shows 汇总 (nav-tweak #2). */
export default function SummaryLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: tabIndexTitle('summary') }} />
    </Stack>
  );
}
