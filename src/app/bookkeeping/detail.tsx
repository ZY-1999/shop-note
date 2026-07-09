import { StyleSheet, Text, View } from 'react-native';

/**
 * 记账 detail placeholder (spec #04 AC4) — the push target proving per-tab Stack
 * navigation. #6/#7 fill this with the real record-posting form / detail-void UI.
 */
export default function BookkeepingDetail() {
  return (
    <View style={styles.container}>
      <Text>记账 / 详情（占位）</Text>
      <Text style={styles.hint}>#6 接入录入表单，#7 接入明细/作废</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  hint: { opacity: 0.6 },
});
