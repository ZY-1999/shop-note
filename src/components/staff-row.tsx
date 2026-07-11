import { Pressable, StyleSheet, Text, View } from "react-native";

import { MemberInfoHeader } from "@/components/member-info-header";
import type { Staff } from "@/data/staff";
import { useTheme } from "@/hooks/use-theme";

/**
 * One member row in the 记账 list (stock-balance-refactor balance-domain).
 *
 * The member-info display (name + tier badge + 余额 + 欠款 marker) is rendered
 * by the shared `<MemberInfoHeader>` (topup-subpage spec #01/03), reused four
 * places — so this row's visuals stay aligned with the form / detail headers.
 *
 * All three affordances are delegated so the row stays RNTL-testable: [充值]
 * jumps to the top-up subpage (`onTopup`), [出库] to the record form (`onOut`),
 * and the row body taps through to member detail (`onOpen`). spec 03 flipped
 * money-in from an inline form to a navigation target, mirroring [出库].
 */
export interface StaffRowProps {
  staff: Staff;
  onTopup: (staffId: string) => void;
  onOut: (staffId: string) => void;
  onOpen: (staffId: string) => void;
}

export function StaffRow({ staff, onTopup, onOut, onOpen }: StaffRowProps) {
  const theme = useTheme();

  return (
    <View style={[styles.wrap, { borderColor: theme.border }]}>
      <Pressable
        testID={`row-${staff.id}`}
        onPress={() => onOpen(staff.id)}
        style={styles.row}
      >
        <View style={styles.main}>
          <MemberInfoHeader staffId={staff.id} />
        </View>
        <View style={styles.actions}>
          <Pressable
            testID={`topup-${staff.id}`}
            onPress={() => onTopup(staff.id)}
            style={[styles.btn, { backgroundColor: theme.success }]}
          >
            <Text style={styles.btnText}>充值</Text>
          </Pressable>
          <Pressable
            testID={`out-${staff.id}`}
            onPress={() => onOut(staff.id)}
            style={[styles.btn, { backgroundColor: theme.danger }]}
          >
            <Text style={styles.btnText}>出库</Text>
          </Pressable>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderWidth: 1, borderRadius: 8, marginBottom: 4 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 4,
    gap: 12,
  },
  main: { flex: 1 },
  actions: { flexDirection: "row", gap: 8 },
  btn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  btnText: { color: "#fff", fontSize: 14, fontWeight: "600" },
});
