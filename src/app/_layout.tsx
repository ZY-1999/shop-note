import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { AppProvider } from '@/providers/app-provider';

SplashScreen.preventAutoHideAsync();

/**
 * Root layout (spec #04): theme → production composition root → shell.
 *
 * `AppProvider` opens `shop_note.db` and only renders its children once the
 * `Repos` is ready, so `AnimatedSplashOverlay` (a child) mounts exactly when the
 * DB is ready and hides the native splash from its own onLayout — the splash
 * therefore stays up through the async open with no blank flash (AC2). On the
 * error path the children (and so the overlay) never mount, so `onError` hides
 * the splash directly to reveal the retryable error screen.
 */
export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AppProvider onError={() => {
        void SplashScreen.hideAsync();
      }}>
        <AnimatedSplashOverlay />
        <AppTabs />
      </AppProvider>
    </ThemeProvider>
  );
}
