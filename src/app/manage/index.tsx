import { StyleSheet, Text, View } from 'react-native';

import { SmokeEntry } from '@/components/smoke-entry';

/**
 * 管理 tab placeholder (spec #04). #9 thickens this into the real staff/product
 * management screen. The `__DEV__` region hosts the relocated cross-adapter smoke
 * entry (AC5): it runs against the dedicated `shop_note_smoke.db`, never the
 * production `shop_note.db` (ADR-0004).
 */
export default function ManageTab() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>管理</Text>
      <Text style={styles.hint}>占位 — #9 接入员工/商品管理</Text>
      {__DEV__ && <SmokeEntry />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  title: { fontSize: 20, fontWeight: 'bold' },
  hint: { opacity: 0.6 },
});
