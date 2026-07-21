import {
  DarkTheme,
  DefaultTheme,
  Stack,
  ThemeProvider,
  useSegments,
} from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useColorScheme } from "react-native";

import { tab2Title } from "@/navigation/tab-config";
import { AppProvider } from "@/providers/app-provider";

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
setTimeout(() => {
  SplashScreen.hideAsync();
}, 1000);

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const segments = useSegments() as string[];
  const currentTab = segments[1]; // 第一个是 (tabs)，第二个就是具体的 Tab 页

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <AppProvider
        onError={() => {
          void SplashScreen.hideAsync();
        }}
      >
        <Stack>
          <Stack.Screen name="index" redirect />
          <Stack.Screen
            name="(tabs)"
            options={{ title: tab2Title(currentTab) }}
          />
          <Stack.Screen name="record-form" />
          <Stack.Screen name="topup-form" />
          <Stack.Screen name="staff/[id]" options={{ title: "会员详情" }} />
          <Stack.Screen name="record/[id]" options={{ title: "记录详情" }} />
          <Stack.Screen name="topup/[id]" options={{ title: "记录详情" }} />
        </Stack>
      </AppProvider>
    </ThemeProvider>
  );
}
