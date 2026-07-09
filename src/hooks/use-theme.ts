/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function useTheme() {
  const scheme = useColorScheme();
  // Only `dark` selects dark; everything else (light / unspecified / null in the
  // jest-expo env) falls back to light — keeps themed components crash-free in tests.
  const theme = scheme === 'dark' ? 'dark' : 'light';

  return Colors[theme];
}
