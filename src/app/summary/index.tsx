import { StyleSheet, Text, View } from 'react-native';

/** 汇总 tab placeholder (spec #04). #8 fills this with the shop aggregate view. */
export default function SummaryTab() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>汇总</Text>
      <Text style={styles.hint}>占位 — #8 接入店铺/员工汇总</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  title: { fontSize: 20, fontWeight: 'bold' },
  hint: { opacity: 0.6 },
});
