import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

/**
 * 记账 tab placeholder (spec #04). #5 replaces this with the real staff list; the
 * tappable row here proves the per-tab Stack push wiring (AC4) — pressing it
 * pushes `/bookkeeping/detail` within this tab's stack, asserted by the mock-router
 * test alongside this file.
 */
export default function BookkeepingTab() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>记账</Text>
      <Text style={styles.hint}>占位 — #5 接入员工列表与出入库录入</Text>
      <Pressable testID="demo-row" style={styles.row} onPress={() => router.push('/bookkeeping/detail')}>
        <Text>占位条目 →</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  title: { fontSize: 20, fontWeight: 'bold' },
  hint: { opacity: 0.6 },
  row: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 8, backgroundColor: '#eee' },
});
