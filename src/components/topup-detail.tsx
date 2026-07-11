import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { formatDateTimeSeconds } from "@/components/date-format";
import { MoneyText } from "@/components/money-text";
import { BottomTabInset } from "@/constants/theme";
import { useVoidTopup } from "@/hooks/mutations";
import { useStaffById, useTopupById } from "@/hooks/reads";
import { useTheme } from "@/hooks/use-theme";

/**
 * The top-up detail screen — look-back / void surface for a member recharge.
 * Router-agnostic: the route reads `topupId` from params and passes it as a
 * prop (ADR-0006). No edit — domain rule: void and re-enter.
 */
export interface TopupDetailProps {
  topupId: string;
}

export function TopupDetail({ topupId }: TopupDetailProps) {
  const theme = useTheme();
  const detail = useTopupById(topupId);
  const topup = detail.data;
  const staff = useStaffById(topup?.staff_id ?? "");
  const voidTopup = useVoidTopup();
  const [confirmingVoid, setConfirmingVoid] = useState(false);

  if (!topup) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <Text style={{ color: theme.textSecondary }}>加载中</Text>
      </View>
    );
  }

  const voided = topup.voided_at != null;

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderColor: theme.border }]}>
        <Text style={{ color: theme.success, fontSize: 18, fontWeight: "700" }}>充值</Text>
        {staff.data && <Text style={[styles.note, { color: theme.text }]}>{staff.data.name}</Text>}
        <Text style={[styles.note, { color: theme.textSecondary }]}>
          {formatDateTimeSeconds(topup.timestamp)}
        </Text>
        <MoneyText testID="topup-detail-amount" cents={topup.amount} />
        <Text testID="topup-detail-note" style={[styles.note, { color: theme.text }]}>
          {topup.note != null && topup.note !== "" ? topup.note : "—"}
        </Text>
        {voided && <Text style={{ color: theme.danger }}>已作废</Text>}
      </View>

      {!voided && (
        <View style={styles.actions}>
          {!confirmingVoid ? (
            <Pressable
              testID="void"
              onPress={() => setConfirmingVoid(true)}
              style={[styles.actionBtn, { borderColor: theme.danger }]}
            >
              <Text style={{ color: theme.danger }}>作废</Text>
            </Pressable>
          ) : (
            <View style={styles.confirmRow}>
              <Pressable
                testID="void-confirm"
                onPress={() => voidTopup.mutate(topupId, { onSettled: () => setConfirmingVoid(false) })}
                disabled={voidTopup.isPending}
                style={[styles.actionBtn, { backgroundColor: theme.danger }]}
              >
                <Text style={styles.confirmText}>{voidTopup.isPending ? "作废中…" : "确认作废"}</Text>
              </Pressable>
              <Pressable
                testID="void-cancel"
                onPress={() => setConfirmingVoid(false)}
                style={[styles.actionBtn, { borderColor: theme.danger }]}
              >
                <Text style={{ color: theme.danger }}>取消</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 12, gap: 8, paddingBottom: BottomTabInset },
  header: { borderWidth: 1, borderRadius: 8, padding: 12, gap: 4 },
  note: { fontSize: 14 },
  actions: { marginTop: 8 },
  confirmRow: { flexDirection: "row", gap: 8 },
  actionBtn: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 10 },
  confirmText: { color: "#fff", fontSize: 15, fontWeight: "600" },
});
