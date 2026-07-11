import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { formatTimeSeconds } from "@/components/date-format";
import { MoneyText } from "@/components/money-text";
import { cents } from "@/data/primitives";
import { useTheme } from "@/hooks/use-theme";

/**
 * A single member-flow event row — one checkout or one top-up in a day drill-down.
 * Shared by StaffDetail history and SummaryTab member expand. Router-agnostic:
 * `onPress` is supplied by the parent (ADR-0006).
 *
 * List rows are summaries only: no product names; checkout adds bundle/retail
 * split computed by the parent via `splitBundleRetail`. Whole row is pressable
 * with a trailing chevron — detail / void live on the detail screens.
 */
export type FlowEventRowProps =
  | {
      kind: "checkout";
      timestamp: number;
      amountCents: number;
      bundles: number;
      retailCents: number;
      onPress: () => void;
      testID?: string;
    }
  | {
      kind: "topup";
      timestamp: number;
      amountCents: number;
      onPress: () => void;
      testID?: string;
    };

const TEST_IDS = {
  root: { def: "flow-event-row", suffix: "" },
  time: { def: "flow-event-time", suffix: "time" },
  amount: { def: "flow-event-amount", suffix: "amount" },
  bundles: { def: "flow-event-bundle-count", suffix: "bundle-count" },
  retail: { def: "flow-event-retail", suffix: "retail" },
} as const;

export function FlowEventRow(props: FlowEventRowProps) {
  const theme = useTheme();
  const { timestamp, amountCents, onPress, testID } = props;
  const tid = (k: keyof typeof TEST_IDS) =>
    testID ? `${testID}-${TEST_IDS[k].suffix}` : TEST_IDS[k].def;
  const isCheckout = props.kind === "checkout";

  return (
    <Pressable
      testID={testID ?? TEST_IDS.root.def}
      onPress={onPress}
      style={[
        styles.row,
        { borderColor: theme.border, justifyContent: "space-between" },
      ]}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text testID={tid("time")} style={{ color: theme.textSecondary }}>
          {formatTimeSeconds(timestamp)}
        </Text>
        <Text style={{ color: isCheckout ? theme.text : theme.success }}>
          {isCheckout ? "出库" : "充值"}
        </Text>
        <MoneyText testID={tid("amount")} cents={cents(amountCents)} />
        {isCheckout && (
          <>
            <Text testID={tid("bundles")} style={{ color: theme.text }}>
              计 {props.bundles} 单
            </Text>
            <Text style={{ color: theme.text }}>零售</Text>
            <MoneyText
              testID={tid("retail")}
              cents={cents(props.retailCents)}
            />
          </>
        )}
      </View>
      <Ionicons name="chevron-forward" size={14} color={theme.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
    marginLeft: 12,
  },
  chevron: { marginLeft: "auto" },
});
