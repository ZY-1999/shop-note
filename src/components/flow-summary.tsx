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
  /**
   * Per-instance testID prefix so multiple FlowSummarys on one screen (the 汇总
   * range header + each day card + each member row; the member-detail summary +
   * each day separator) don't collide. When given, root = `${testID}` and inner
   * testIDs = `${testID}-<part>`; when omitted, the legacy single-instance
   * defaults (`flow-summary` / `flow-topup-total` / …) are used.
   */
  testID?: string;
}

/**
 * Default (single-instance) testIDs, preserved for the original 汇总 range-header
 * caller and its tests. Each entry pairs the legacy id with the suffix used when
 * a `testID` prefix is supplied.
 */
const TEST_IDS = {
  root: { def: "flow-summary", suffix: "" },
  lineTopup: { def: "flow-summary-line-topup", suffix: "line-topup" },
  topup: { def: "flow-topup-total", suffix: "topup-total" },
  out: { def: "flow-out-total", suffix: "out-total" },
  bundles: { def: "bundle-aggregate-count", suffix: "bundle-count" },
  retail: { def: "bundle-aggregate-retail", suffix: "retail" },
} as const;

export function FlowSummary({
  topup,
  out,
  bundles,
  retail,
  style,
  testID,
}: FlowSummaryProps) {
  const theme = useTheme();
  const tid = (k: keyof typeof TEST_IDS) =>
    testID ? `${testID}-${TEST_IDS[k].suffix}` : TEST_IDS[k].def;
  return (
    <View testID={testID ?? TEST_IDS.root.def} style={style}>
      <View testID={tid("lineTopup")} style={styles.row}>
        <Text style={{ color: theme.success }}>充值</Text>
        <MoneyText testID={tid("topup")} cents={cents(topup)} />
      </View>
      <View style={styles.row}>
        <Text>出库</Text>
        <MoneyText testID={tid("out")} cents={cents(out)} />
        <Text testID={tid("bundles")} style={{ color: theme.text }}>
          计 {bundles} 单
        </Text>
        <Text>零售</Text>
        <MoneyText testID={tid("retail")} cents={cents(retail)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
});
