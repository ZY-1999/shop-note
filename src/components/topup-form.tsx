import DateTimePicker, {
  type DateTimePickerChangeEvent,
} from "@expo/ui/community/datetime-picker";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { formatDateTime } from "@/components/date-format";
import { MemberInfoHeader } from "@/components/member-info-header";
import { cents } from "@/data/primitives";
import { useCreateTopup } from "@/hooks/mutations";
import { useTheme } from "@/hooks/use-theme";

/**
 * The top-up form — the UI's only write path into the top-up ledger. Opened from
 * a 记账 row's [充值] button (navigated, not inline), it mirrors RecordForm's
 * architecture: router-agnostic (props just `staffId`), so it's RNTL-testable
 * (ADR-0006); the route adapter reads `staff_id` and sets the Stack title.
 *
 * Fields: 金额 (元→分, decimal-pad), 备注 (optional), 时间 (dual-branch picker —
 * Android mount-on-demand dialog / iOS inline, same as RecordForm). Submit
 * validates the amount is a finite positive number, converts yuan→cents via
 * `Math.round(yuan*100)`, posts through `useCreateTopup`, and `router.back()`s
 * on success — balance + dailyFlow refresh via the mutation's invalidate chain.
 *
 * Header is `<MemberInfoHeader>` — no direction word (top-up is always money-in;
 * the Stack title says 「充值」).
 */
export interface TopupFormProps {
  staffId: string;
}

export function TopupForm({ staffId }: TopupFormProps) {
  const theme = useTheme();
  const createTopup = useCreateTopup();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [timestamp, setTimestamp] = useState(Date.now());
  // Android renders the picker as a Material dialog (@expo/ui default
  // presentation='dialog'): mount opens it, unmount on confirm (onValueChange)
  // or cancel (onDismiss). iOS ignores `presentation` (always inline).
  const [showTime, setShowTime] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const yuan = parseFloat(amount);
    if (!isFinite(yuan) || yuan <= 0) {
      setError("请输入有效金额");
      return;
    }
    setError(null);
    createTopup.mutate(
      {
        staff_id: staffId,
        amount: cents(Math.round(yuan * 100)),
        note: note.trim() || undefined,
        timestamp,
      },
      { onSuccess: () => router.back() },
    );
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      <MemberInfoHeader staffId={staffId} />

      <View style={styles.field}>
        <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
          时间
        </Text>
        {Platform.OS === "android" ? (
          <>
            <Pressable
              testID="topup-time"
              onPress={() => setShowTime(true)}
              style={[
                styles.timeBtn,
                { backgroundColor: theme.inputBg, borderColor: theme.border },
              ]}
            >
              <Text style={{ color: theme.text }}>
                {formatDateTime(timestamp)}
              </Text>
              <Ionicons
                name="time-outline"
                size={16}
                color={theme.textSecondary}
              />
            </Pressable>
            {showTime && (
              <DateTimePicker
                testID="topup-time-picker"
                mode="datetime"
                value={new Date(timestamp)}
                onValueChange={(_e: DateTimePickerChangeEvent, date: Date) => {
                  setTimestamp(date.getTime());
                  setShowTime(false);
                }}
                onDismiss={() => setShowTime(false)}
              />
            )}
          </>
        ) : (
          <DateTimePicker
            testID="topup-time"
            mode="datetime"
            value={new Date(timestamp)}
            onValueChange={(_e: DateTimePickerChangeEvent, date: Date) =>
              setTimestamp(date.getTime())
            }
          />
        )}
      </View>

      <View style={styles.field}>
        <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
          金额（元）
        </Text>
        <TextInput
          testID="topup-amount"
          style={[
            styles.input,
            {
              backgroundColor: theme.inputBg,
              borderColor: theme.border,
              color: theme.text,
            },
          ]}
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
        />
      </View>

      <View style={styles.field}>
        <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
          备注
        </Text>
        <TextInput
          testID="topup-note"
          style={[
            styles.input,
            {
              backgroundColor: theme.inputBg,
              borderColor: theme.border,
              color: theme.text,
            },
          ]}
          placeholder="单号 / 原因"
          placeholderTextColor={theme.textSecondary}
          value={note}
          onChangeText={setNote}
        />
      </View>

      {error && (
        <Text testID="topup-error" style={{ color: theme.danger }}>
          {error}
        </Text>
      )}

      <Pressable
        testID="topup-submit"
        onPress={submit}
        disabled={createTopup.isPending}
        style={[styles.submit, { backgroundColor: theme.success }]}
      >
        <Text style={styles.submitText}>
          {createTopup.isPending ? "提交中…" : "提交"}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 12, gap: 8 },
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 4,
  },
  fieldLabel: { fontSize: 14, fontWeight: "500", width: 72 },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    flex: 1,
  },
  timeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  submit: {
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  submitText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
