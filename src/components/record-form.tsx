import DateTimePicker, { type DateTimePickerChangeEvent } from '@expo/ui/community/datetime-picker';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { MoneyText } from '@/components/money-text';
import { MemberInfoHeader } from '@/components/member-info-header';
import { formatDateTime } from '@/components/date-format';
import { validateRecordForm } from '@/components/record-form-validation';
import { useCreateStockRecord, useUpdateStockRecord } from '@/hooks/mutations';
import { useProducts } from '@/hooks/reads';
import { useTheme } from '@/hooks/use-theme';
import { cents, type Cents } from '@/data/primitives';
import type { Direction } from '@/data/stock-record';
import type { Product } from '@/data/product';

/**
 * The record form — the UI's only write path into the movement ledger. In CREATE
 * mode (opened from a 记账 row's 入库/出库 button) it posts a new record; in EDIT
 * mode (embedded in RecordDetail) it is preloaded with the record's existing
 * lines and calls update instead.
 *
 * Spec #03 (page-refactor) reshaped the line-entry UX without touching the write
 * contract: product search results render as chips (tap = add a line at qty 1;
 * tap an ALREADY-picked product = +1 on its line, no duplicate — and search is
 * deliberately NOT cleared so the chip stays for repeat taps); each line has a
 * `− [qty] +` stepper (− clamps at 1; remove a line via 删除); 备注 is a
 * label:input field; the time control is a buttonized affordance
 * (`formatDateTime` + an icon) that mounts the picker.
 *
 * The one subtle contract in EDIT mode (unchanged): each preloaded line carries
 * its stable item `id` through submit — what lets the repo's merge tell TOUCHED
 * lines (resnapshot) from UNTOUCHED ones (keep their posting-time snapshot).
 *
 * Deliberately does NOT check stock sufficiency: an `out` over holdings is
 * allowed (produces 欠货 downstream — PRD invariant). Router-agnostic: the route
 * file reads params and passes them as props, so the form is RNTL-testable.
 */
interface PickedLine {
  /** Stable item id when editing — drives the repo's touched/untouched merge. Undefined for new lines. */
  id?: string;
  productId: string;
  title: string;
  price: Cents;
  qty: string;
}

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
}

export interface RecordFormProps {
  staffId: string;
  direction: Direction;
  /** Present → edit mode: preload these lines + header, submit calls update. */
  edit?: RecordFormEdit;
  /** Called after a successful EDIT save (RecordDetail flips back to view). Defaults to router.back(). */
  onSaved?: () => void;
}

/** Parsed integer qty (floored; empty/non-numeric → 0) for stepper math. */
function qtyInt(qty: string): number {
  return Math.floor(Number(qty) || 0);
}

/** Safe per-line amount: 0 when qty is empty/non-integer, else price × qty (both integer → cents-safe). */
function lineAmount(line: PickedLine): number {
  const qtyNum = line.qty.trim() === '' ? 0 : Number(line.qty);
  return Number.isInteger(qtyNum) ? line.price * qtyNum : 0;
}

export function RecordForm({ staffId, direction, edit, onSaved }: RecordFormProps) {
  const theme = useTheme();
  const createRecord = useCreateStockRecord();
  const updateRecord = useUpdateStockRecord();
  const [search, setSearch] = useState('');
  const products = useProducts(search ? { search: { text: search } } : undefined);
  const [lines, setLines] = useState<PickedLine[]>(() =>
    (edit?.lines ?? []).map((l) => ({ id: l.id, productId: l.productId, title: l.title, price: l.price, qty: String(l.qty) })),
  );
  const [note, setNote] = useState(edit?.note ?? '');
  const [timestamp, setTimestamp] = useState(edit?.timestamp ?? Date.now());
  // Android renders the picker as a Material dialog (@expo/ui default
  // presentation='dialog'): mount opens it, and the caller must unmount on
  // confirm (onValueChange) or cancel (onDismiss) — leaving it mounted leaves
  // OK/Cancel half-wired (the #06 Android bug). iOS ignores `presentation`
  // (always inline, no OK/Cancel), so it stays mounted and fires onValueChange
  // per nudge. See @expo/ui community/datetime-picker types.
  const [showTime, setShowTime] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const linesWithAmount = lines.map((l) => ({ ...l, amount: lineAmount(l) }));
  const total = linesWithAmount.reduce((sum, l) => sum + l.amount, 0);
  const pending = edit ? updateRecord.isPending : createRecord.isPending;

  // Chip pick (spec #03): a product already on a line → +1 on that line (no
  // duplicate); otherwise add a new line at qty 1. Search is deliberately NOT
  // cleared so the chip stays tappable for repeat +1s.
  const pickProduct = (p: Product) => {
    setLines((prev) => {
      const existing = prev.findIndex((l) => l.productId === p.id);
      if (existing >= 0) {
        return prev.map((l, i) => (i === existing ? { ...l, qty: String(qtyInt(l.qty) + 1) } : l));
      }
      return [...prev, { productId: p.id, title: p.title, price: p.purchase_price, qty: '1' }];
    });
    setError(null);
  };
  const setQty = (index: number, qty: string) => {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, qty } : l)));
    setError(null);
  };
  const removeLine = (index: number) => setLines((prev) => prev.filter((_, i) => i !== index));

  const submit = () => {
    const msg = validateRecordForm(staffId, lines.map((l) => ({ productId: l.productId, qty: l.qty })));
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
            items: lines.map((l) => ({ id: l.id, product_id: l.productId, qty: Number(l.qty) })),
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
          items: lines.map((l) => ({ product_id: l.productId, qty: Number(l.qty) })),
        },
        { onSuccess: () => router.back() },
      );
    }
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <MemberInfoHeader staffId={staffId} />
      </View>

      <TextInput
        testID="product-search"
        style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }]}
        placeholder="搜索商品名称"
        placeholderTextColor={theme.textSecondary}
        value={search}
        onChangeText={setSearch}
      />
      {products.data && products.data.length > 0 && (
        <View style={styles.chips}>
          {products.data.map((p) => {
            const picked = lines.some((l) => l.productId === p.id);
            return (
              <Pressable
                key={p.id}
                testID={`pick-${p.id}`}
                onPress={() => pickProduct(p)}
                style={[styles.chip, { borderColor: picked ? theme.success : theme.border, backgroundColor: picked ? theme.backgroundSelected : theme.inputBg }]}>
                <Text style={{ color: theme.text }}>
                  {p.title}
                  {picked ? ` ×${lines.find((l) => l.productId === p.id)?.qty}` : ''}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {linesWithAmount.map((line, i) => (
        <View key={`${line.productId}-${i}`} style={[styles.line, { borderColor: theme.border }]}>
          <View style={styles.lineTop}>
            <Text style={[styles.lineTitle, { color: theme.text }]}>{line.title}</Text>
            <MoneyText cents={cents(line.amount)} />
            <Pressable testID={`remove-${i}`} onPress={() => removeLine(i)}>
              <Text style={{ color: theme.danger }}>删除</Text>
            </Pressable>
          </View>
          <QtyStepper index={i} qty={line.qty} onSetQty={setQty} />
        </View>
      ))}

      <View style={styles.totalRow}>
        <Text style={[styles.totalLabel, { color: theme.textSecondary }]}>合计</Text>
        <MoneyText cents={cents(total)} testID="running-total" />
      </View>

      <View style={styles.field}>
        <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>备注：</Text>
        <TextInput
          testID="note"
          style={[styles.input, styles.fieldInput, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }]}
          placeholder="单号 / 原因"
          placeholderTextColor={theme.textSecondary}
          value={note}
          onChangeText={setNote}
        />
      </View>

      <View style={styles.timeRow}>
        <Text style={[styles.timeLabel, { color: theme.textSecondary }]}>时间</Text>
        {/* Android: dialog picker — the affordance is a styled Pressable
            (formatDateTime + an icon); tapping mounts the dialog, unmount on
            confirm (onValueChange) or cancel (onDismiss) per the dialog contract.
            iOS: inline picker stays mounted, nudges fire onValueChange directly. */}
        {Platform.OS === 'android' ? (
          <>
            <Pressable
              testID="record-time"
              onPress={() => setShowTime(true)}
              style={[styles.timeBtn, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
              <Text style={{ color: theme.text }}>{formatDateTime(timestamp)}</Text>
              <Ionicons name="time-outline" size={16} color={theme.textSecondary} />
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
            onValueChange={(_e: DateTimePickerChangeEvent, date: Date) => setTimestamp(date.getTime())}
          />
        )}
      </View>

      {error && (
        <Text testID="form-error" style={{ color: theme.danger }}>
          {error}
        </Text>
      )}

      <Pressable
        testID="submit"
        onPress={submit}
        disabled={pending}
        style={[styles.submit, { backgroundColor: direction === 'in' ? theme.success : theme.danger }]}>
        <Text style={styles.submitText}>{pending ? '提交中…' : edit ? '保存' : '提交'}</Text>
      </Pressable>
    </ScrollView>
  );
}

/** `− [qty] +` per line (spec #03). − clamps at 1 (disabled there); 删除 removes the line. */
function QtyStepper({ index, qty, onSetQty }: { index: number; qty: string; onSetQty: (i: number, qty: string) => void }) {
  const theme = useTheme();
  const atMin = qtyInt(qty) <= 1;
  return (
    <View style={styles.stepper}>
      <Pressable
        testID={`dec-${index}`}
        onPress={() => onSetQty(index, String(Math.max(1, qtyInt(qty) - 1)))}
        disabled={atMin}
        style={[styles.stepBtn, { borderColor: theme.border }, atMin && { opacity: 0.4 }]}>
        <Text style={styles.stepBtnText}>−</Text>
      </Pressable>
      <TextInput
        testID={`qty-${index}`}
        style={[styles.qtyInput, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }]}
        keyboardType="numeric"
        value={qty}
        onChangeText={(v) => onSetQty(index, v)}
      />
      <Pressable
        testID={`inc-${index}`}
        onPress={() => onSetQty(index, String(qtyInt(qty) + 1))}
        style={[styles.stepBtn, { borderColor: theme.border }]}>
        <Text style={styles.stepBtnText}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 12, gap: 8 },
  header: { paddingVertical: 4 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  line: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, gap: 8 },
  lineTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  lineTitle: { flex: 1, fontSize: 15 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepBtn: { width: 32, height: 32, borderWidth: 1, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  stepBtnText: { fontSize: 18, fontWeight: '600' },
  qtyInput: { width: 60, borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, fontSize: 15, textAlign: 'center' },
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 12, paddingVertical: 8 },
  totalLabel: { fontSize: 15 },
  field: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fieldLabel: { fontSize: 13, fontWeight: '500' },
  fieldInput: { flex: 1 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  timeLabel: { fontSize: 15 },
  timeBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  submit: { borderRadius: 8, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
