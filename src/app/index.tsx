import { useState } from 'react';
import * as Device from 'expo-device';
import { Platform, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedIcon } from '@/components/animated-icon';
import { HintRow } from '@/components/hint-row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { WebBadge } from '@/components/web-badge';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import type { SmokeResult } from '@/data/smoke/run-smoke';

function getDevMenuHint() {
  if (Platform.OS === 'web') {
    return <ThemedText type="small">use browser devtools</ThemedText>;
  }
  if (Device.isDevice) {
    return (
      <ThemedText type="small">
        shake device or press <ThemedText type="code">m</ThemedText> in terminal
      </ThemedText>
    );
  }
  const shortcut = Platform.OS === 'android' ? 'cmd+m (or ctrl+m)' : 'cmd+d';
  return (
    <ThemedText type="small">
      press <ThemedText type="code">{shortcut}</ThemedText>
    </ThemedText>
  );
}

/**
 * Dev-only smoke entry: runs the expo-sqlite adapter against the in-memory
 * adapter on press and renders the per-step result. The runner is loaded via
 * dynamic `import()` so this screen's static bundle never pulls in `expo-sqlite`
 * (and the native module loads only when the smoke actually runs).
 */
function SmokeEntry() {
  const [result, setResult] = useState<SmokeResult | null>(null);
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    setResult(null);
    try {
      const { runExpoSqliteSmoke } = await import('@/data/smoke/run-smoke');
      const res = await runExpoSqliteSmoke();
      // Full per-step log to the Metro terminal too — scrollable/copyable there
      // even when the on-screen view is truncated.
      console.log(`[expo-sqlite smoke] ${res.pass ? "PASS" : "FAIL"}\n${res.details}`);
      setResult(res);
    } catch (error) {
      setResult({
        pass: false,
        details: `RUN FAILED: ${error instanceof Error ? error.message : String(error)}`,
      });
    } finally {
      setRunning(false);
    }
  }

  const lines = result?.details.split("\n") ?? [];
  const passed = lines.filter((l) => l.startsWith("✓")).length;
  const failed = lines.filter((l) => l.startsWith("✗")).length;

  return (
    <ThemedView type="backgroundElement" style={styles.smoke}>
      <Pressable onPress={run} disabled={running}>
        <ThemedText type="code">
          {running ? 'running smoke…' : 'run expo-sqlite smoke'}
        </ThemedText>
      </Pressable>
      {result && (
        <>
          <ThemedText type="small">
            {result.pass ? '✅ PASS' : '❌ FAIL'} — {passed}/{passed + failed} steps
            {'  '}
            <ThemedText type="small">see Metro terminal for full log</ThemedText>
          </ThemedText>
          <ScrollView style={styles.smokeScroll}>
            <ThemedText type="small" style={styles.smokeResult}>
              {result.details}
            </ThemedText>
          </ScrollView>
        </>
      )}
    </ThemedView>
  );
}

export default function HomeScreen() {
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.heroSection}>
          <AnimatedIcon />
          <ThemedText type="title" style={styles.title}>
            Welcome to&nbsp;Expo
          </ThemedText>
        </ThemedView>

        <ThemedText type="code" style={styles.code}>
          get started
        </ThemedText>

        <ThemedView type="backgroundElement" style={styles.stepContainer}>
          <HintRow
            title="Try editing"
            hint={<ThemedText type="code">src/app/index.tsx</ThemedText>}
          />
          <HintRow title="Dev tools" hint={getDevMenuHint()} />
          <HintRow
            title="Fresh start"
            hint={<ThemedText type="code">npm run reset-project</ThemedText>}
          />
        </ThemedView>

        {__DEV__ && <SmokeEntry />}

        {Platform.OS === 'web' && <WebBadge />}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    flexDirection: 'row',
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    gap: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.three,
    maxWidth: MaxContentWidth,
  },
  heroSection: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    paddingHorizontal: Spacing.four,
    gap: Spacing.four,
  },
  title: {
    textAlign: 'center',
  },
  code: {
    textTransform: 'uppercase',
  },
  stepContainer: {
    gap: Spacing.three,
    alignSelf: 'stretch',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.four,
    borderRadius: Spacing.four,
  },
  smoke: {
    gap: Spacing.two,
    alignSelf: 'stretch',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.four,
  },
  smokeResult: {
    fontFamily: 'monospace',
  },
  smokeScroll: {
    maxHeight: 280,
    alignSelf: 'stretch',
  },
});
