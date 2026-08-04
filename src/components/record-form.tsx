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
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import { formatDateTime } from "@/components/date-format";
import { MemberInfoHeader } from "@/components/member-info-header";
import { validateRecordForm } from "@/components/record-form-validation";
import { type Cents } from "@/data/primitives";
import type { Direction } from "@/data/stock-record";
import { useCreateStockRecord, useUpdateStockRecord } from "@/hooks/mutations";
import { useUnitPrice } from "@/hooks/reads";
import { useTheme } from "@/hooks/use-theme";
import { BottomTabInset } from "@/constants/theme";
import { ItemsSeletor, PickedLine } from "./items-selector";

/** Preloaded line for edit mode — the record's frozen item, carrying its stable id. */
export interface EditLine {
  id: string;
  productId: string;
  title: string;
  price: Cents;
  qty: number;
}

export interface RecordFormEdit {
  recordId: string;
  timestamp: number;
  note: string | null;
  lines: EditLine[];
  /** Edit preload for 自用 — only meaningful for out. */
  selfUse: boolean;
}

export interface RecordFormProps {
  staffId: string;
  direction: Direction;
  /** Present → edit mode: preload these lines + header, submit calls update. */
  edit?: RecordFormEdit;
  /** Called after a successful EDIT save (RecordDetail flips back to view). Defaults to router.back(). */
  onSaved?: () => void;
}

export function RecordForm({
  staffId,
  direction,
  edit,
  onSaved,
}: RecordFormProps) {
  const theme = useTheme();
  const createRecord = useCreateStockRecord();
  const updateRecord = useUpdateStockRecord();
  const unitPrice = useUnitPrice();

  const [selectedItems, setSelectedItems] = useState<PickedLine[]>(() =>
    (edit?.lines ?? []).map((l) => ({
      id: l.id,
      productId: l.productId,
      title: l.title,
      price: l.price,
      qty: String(l.qty),
    })),
  );
  const [note, setNote] = useState(edit?.note ?? "");
  const [timestamp, setTimestamp] = useState(edit?.timestamp ?? Date.now());
  const [selfUse, setSelfUse] = useState(edit?.selfUse ?? false);
  // Android renders the picker as a Material dialog (@expo/ui default
  // presentation='dialog'): mount opens it, and the caller must unmount on
  // confirm (onValueChange) or cancel (onDismiss) — leaving it mounted leaves
  // OK/Cancel half-wired (the #06 Android bug). iOS ignores `presentation`
  // (always inline, no OK/Cancel), so it stays mounted and fires onValueChange
  // per nudge. See @expo/ui community/datetime-picker types.
  const [showTime, setShowTime] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pending = edit ? updateRecord.isPending : createRecord.isPending;

  const submit = () => {
    const msg = validateRecordForm(
      staffId,
      selectedItems.map((l) => ({ productId: l.productId, qty: l.qty })),
    );
    if (msg) {
      setError(msg);
      return;
    }
    setError(null);
    if (edit) {
      // send the edited lines WITH their stable ids — the repo's merge resnapshots touched, keeps untouched
      updateRecord.mutate(
        {
          recordId: edit.recordId,
          patch: {
            timestamp,
            note: note.trim() || null,
            ...(direction === "out" ? { self_use: selfUse } : {}),
            items: selectedItems.map((l) => ({
              id: l.id,
              product_id: l.productId,
              qty: Number(l.qty),
            })),
          },
        },
        { onSuccess: () => (onSaved ? onSaved() : router.back()) },
      );
    } else {
      createRecord.mutate(
        {
          staff_id: staffId,
          direction,
          timestamp,
          note: note.trim() || undefined,
          ...(direction === "out" ? { self_use: selfUse } : {}),
          items: selectedItems.map((l) => ({
            product_id: l.productId,
            qty: Number(l.qty),
          })),
        },
        { onSuccess: () => router.back() },
      );
    }
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      <View style={styles.header}>
        <MemberInfoHeader staffId={staffId} />
      </View>
      <ItemsSeletor
        value={selectedItems}
        onChange={(value) => {
          setSelectedItems(value);
          setError(null);
        }}
        unitPrice={selfUse ? undefined : unitPrice.data}
      />

      <View style={styles.field}>
        <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
          时间
        </Text>
        {/* Android: dialog picker — the affordance is a styled Pressable
            (formatDateTime + an icon); tapping mounts the dialog, unmount on
            confirm (onValueChange) or cancel (onDismiss) per the dialog contract.
            iOS: inline picker stays mounted, nudges fire onValueChange directly. */}
        {Platform.OS === "android" ? (
          <>
            <Pressable
              testID="record-time"
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
                testID="record-time-picker"
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
            testID="record-time"
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
          备注
        </Text>
        <TextInput
          testID="note"
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

      {direction === "out" && (
        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
            自用
          </Text>
          <Switch
            testID="self-use-switch"
            value={selfUse}
            onValueChange={setSelfUse}
          />
          <Text style={{ color: theme.textSecondary, fontSize: 13, flex: 1 }}>
            不计单数与零售
          </Text>
        </View>
      )}

      {error && (
        <Text testID="form-error" style={{ color: theme.danger }}>
          {error}
        </Text>
      )}

      <Pressable
        testID="submit"
        onPress={submit}
        disabled={pending}
        style={[
          styles.submit,
          {
            backgroundColor: theme.success,
          },
        ]}
      >
        <Text style={styles.submitText}>
          {pending ? "提交中…" : edit ? "保存" : "提交"}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 12, gap: 8, paddingBottom: BottomTabInset },
  header: { paddingVertical: 4 },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 15,
    flex: 1,
  },
  field: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  fieldLabel: { fontSize: 14, fontWeight: "500" },
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
