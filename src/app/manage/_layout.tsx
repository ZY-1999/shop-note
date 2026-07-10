import { Stack } from 'expo-router';

import { tabIndexTitle } from '@/navigation/tab-config';

/** 管理 tab stack (spec #04). Top header shows 管理 (nav-tweak #2). */
export default function ManageLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: tabIndexTitle('manage') }} />
    </Stack>
  );
}
