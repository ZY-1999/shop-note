import { StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";

import { MoneyText } from "@/components/money-text";
import { cents } from "@/data/primitives";
import { useTheme } from "@/hooks/use-theme";

/**
 * The 汇总 header's flow summary — the range's member-facing totals in two lines:
 *
 *   line 1: 充值 ￥xx                              (member top-ups, alone)
 *   line 2: 出库 ￥xx 计 N 单 零售 ￥xx            (member checkouts: amount / count / retail)
 *
 * 补货 (restock) is intentionally absent — restock is an inventory op, not member
 * flow; its value surfaces in the 库存卡 (as-of-now stock) and the per-day
 * drill-down, not in this summary. Extracted from `summary-tab.tsx` so the layout
 * is reusable and testable in isolation.
 */
export interface FlowSummaryProps {
  /** Σ topup_amount across the range (cents). Line 1. */
  topup: number;
  /** Σ out_amount across the range (cents). Line 2. */
  out: number;
  /** Σ out-record bundle count across the range. Line 2. */
  bundles: number;
  /** Σ out-record retail across the range (cents). Line 2. */
  retail: number;

  style?: StyleProp<ViewStyle>;
}

export function FlowSummary({
  topup,
  out,
  bundles,
  retail,
  style,
}: FlowSummaryProps) {
  const theme = useTheme();
  return (
    <View testID="flow-summary" style={style}>
      <View testID="flow-summary-line-topup" style={styles.row}>
        <Text style={{ color: theme.success }}>充值</Text>
        <MoneyText testID="flow-topup-total" cents={cents(topup)} />
      </View>
      <View style={styles.row}>
        <Text>出库</Text>
        <MoneyText testID="flow-out-total" cents={cents(out)} />
        <Text testID="bundle-aggregate-count" style={{ color: theme.text }}>
          计 {bundles} 单
        </Text>
        <Text>零售</Text>
        <MoneyText testID="bundle-aggregate-retail" cents={cents(retail)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
});
