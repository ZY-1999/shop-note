import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { SmokeResult } from '@/data/smoke/run-smoke';

/**
 * Dev-only smoke entry (spec #04 relocates it here from the old template Home).
 * Runs the cross-adapter expo-sqlite smoke on press and renders the per-step
 * result. The runner is loaded via dynamic `import()` so this region's static
 * bundle never pulls in `expo-sqlite` (the native module loads only when the
 * smoke actually runs), and it targets the dedicated `shop_note_smoke.db` — the
 * production `shop_note.db` is never touched (ADR-0004). #9 thickens 管理 around it.
 */
export function SmokeEntry() {
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

const styles = StyleSheet.create({
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
