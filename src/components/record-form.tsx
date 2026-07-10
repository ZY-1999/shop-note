import DateTimePicker, { type DateTimePickerChangeEvent } from '@expo/ui/community/datetime-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { MoneyText } from '@/components/money-text';
import { validateRecordForm } from '@/components/record-form-validation';
import { useCreateStockRecord, useUpdateStockRecord } from '@/hooks/mutations';
import { useProducts, useStaffById } from '@/hooks/reads';
import { useTheme } from '@/hooks/use-theme';
import { cents, type Cents } from '@/data/primitives';
import type { Direction } from '@/data/stock-record';
import type { Product } from '@/data/product';

/**
 * The record form (spec #06 post + #07 edit) — the UI's only write path into
 * the movement ledger. In CREATE mode (opened from a 记账 row's 入库/出库 button)
 * it posts a new record; in EDIT mode (embedded in #07's RecordDetail) it is
 * preloaded with the record's existing lines and calls update instead.
 *
 * The operator searches a product (`useProducts`), taps to add a line, enters a
 * qty, and sees each line's amount + the running total LIVE (derived in render —
 * single source of truth, React-Compiler-friendly). Optional note + backdatable
 * time. Submit runs structural validation (a line needs a product and an integer
 * qty > 0 — mirroring the repo's `RangeError` guard).
 *
 * The one subtle contract in EDIT mode (spec #07 deep-module note): each
 * preloaded line carries its stable item `id` through submit. That id is what
 * lets the repo's merge tell TOUCHED lines (resnapshot at the product's current
 * price/title) from UNTOUCHED ones (keep their original posting-time snapshot).
 * Hide that behind the form — the operator just edits lines.
 *
 * Deliberately does NOT check stock sufficiency: an `out` over holdings is
 * allowed (produces 欠货 downstream — PRD invariant). Router-agnostic: the route
 * file reads params and passes them as props, so the form is RNTL-testable
 * directly (create mode); edit mode is driven by the `edit` prop from RecordDetail.
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

const DIRECTION_LABEL: Record<Direction, string> = { in: '入库', out: '出库' };

/** Safe per-line amount: 0 when qty is empty/non-integer, else price × qty (both integer → cents-safe). */
function lineAmount(line: PickedLine): number {
  const qtyNum = line.qty.trim() === '' ? 0 : Number(line.qty);
  return Number.isInteger(qtyNum) ? line.price * qtyNum : 0;
}

export function RecordForm({ staffId, direction, edit, onSaved }: RecordFormProps) {
  const theme = useTheme();
  const staff = useStaffById(staffId);
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

  const pickProduct = (p: Product) => {
    setLines((prev) => [...prev, { productId: p.id, title: p.title, price: p.purchase_price, qty: '' }]);
    setSearch('');
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
        <Text style={[styles.direction, { color: direction === 'in' ? theme.success : theme.danger }]}>
          {DIRECTION_LABEL[direction]}
        </Text>
        <Text style={styles.staffName}>{staff.data?.name ?? '加载中'}</Text>
      </View>

      <TextInput
        testID="product-search"
        style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }]}
        placeholder="搜索商品名称"
        placeholderTextColor={theme.textSecondary}
        value={search}
        onChangeText={setSearch}
      />
      {products.data?.map((p) => (
        <Pressable
          key={p.id}
          testID={`pick-${p.id}`}
          onPress={() => pickProduct(p)}
          style={[styles.match, { borderColor: theme.border }]}>
          <Text style={{ color: theme.text }}>{p.title}</Text>
        </Pressable>
      ))}

      {linesWithAmount.map((line, i) => (
        <View key={`${line.productId}-${i}`} style={[styles.line, { borderColor: theme.border }]}>
          <Text style={[styles.lineTitle, { color: theme.text }]}>{line.title}</Text>
          <TextInput
            testID={`qty-${i}`}
            style={[styles.qtyInput, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }]}
            keyboardType="numeric"
            value={line.qty}
            onChangeText={(v) => setQty(i, v)}
          />
          <MoneyText cents={cents(line.amount)} />
          <Pressable testID={`remove-${i}`} onPress={() => removeLine(i)}>
            <Text style={{ color: theme.danger }}>删除</Text>
          </Pressable>
        </View>
      ))}

      <View style={styles.totalRow}>
        <Text style={[styles.totalLabel, { color: theme.textSecondary }]}>合计</Text>
        <MoneyText cents={cents(total)} testID="running-total" />
      </View>

      <TextInput
        testID="note"
        style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }]}
        placeholder="备注（单号 / 原因）"
        placeholderTextColor={theme.textSecondary}
        value={note}
        onChangeText={setNote}
      />
      <View style={styles.timeRow}>
        <Text style={[styles.timeLabel, { color: theme.textSecondary }]}>时间</Text>
        {/* Android: dialog picker — tap the timestamp to mount it; unmount on
            confirm (onValueChange) or cancel (onDismiss) per the dialog contract.
            iOS: inline picker stays mounted, nudges fire onValueChange directly. */}
        {Platform.OS === 'android' ? (
          <>
            <Pressable testID="record-time" onPress={() => setShowTime(true)}>
              <Text style={{ color: theme.text }}>{new Date(timestamp).toLocaleString()}</Text>
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

const styles = StyleSheet.create({
  container: { flex: 1, padding: 12, gap: 8 },
  header: { flexDirection: 'row', alignItems: 'baseline', gap: 12, paddingVertical: 4 },
  direction: { fontSize: 18, fontWeight: '700' },
  staffName: { fontSize: 16 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  match: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  lineTitle: { flex: 1, fontSize: 15 },
  qtyInput: { width: 70, borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, fontSize: 15 },
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 12, paddingVertical: 8 },
  totalLabel: { fontSize: 15 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  timeLabel: { fontSize: 15 },
  submit: { borderRadius: 8, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
