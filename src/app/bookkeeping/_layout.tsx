import { Stack } from 'expo-router';

/**
 * 记账 tab stack (spec #04 AC4) — lets a list screen push a detail/form screen
 * and `back` return. #5 fills index with the real staff list and the detail/form
 * routes; the structure (a Stack under the tab) is what this spec ships.
 */
export default function BookkeepingLayout() {
  return <Stack />;
}
