import DateTimePicker, { type DateTimePickerChangeEvent } from '@expo/ui/community/datetime-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { MoneyText } from '@/components/money-text';
import { validateRecordForm } from '@/components/record-form-validation';
import { useCreateStockRecord } from '@/hooks/mutations';
import { useProducts, useStaffById } from '@/hooks/reads';
import { useTheme } from '@/hooks/use-theme';
import { cents, type Cents } from '@/data/primitives';
import type { Direction } from '@/data/stock-record';
import type { Product } from '@/data/product';

/**
 * The record-posting form (spec #06) — the UI's only write path into the movement
 * ledger. Opened from a 记账 row's 入库/出库 button with staff + direction prefilled.
 *
 * The operator searches a product (via `useProducts`), taps to add a line, enters a
 * qty, and sees each line's amount + the running total LIVE (derived in render —
 * single source of truth, React-Compiler-friendly). Optional note + backdatable
 * time default to empty / now. Submit runs structural validation (a line needs a
 * product and an integer qty > 0 — mirroring the repo's `RangeError` guard) then
 * posts through `useCreateStockRecord`; the repo snapshots title + price at posting.
 *
 * Deliberately does NOT check stock sufficiency: an `out` over holdings is allowed
 * (produces 欠货 downstream — PRD invariant). Router-agnostic: the route file reads
 * params and passes them as props, so the form is RNTL-testable directly.
 */
interface PickedLine {
  productId: string;
  title: string;
  price: Cents;
  qty: string;
}

export interface RecordFormProps {
  staffId: string;
  direction: Direction;
}

const DIRECTION_LABEL: Record<Direction, string> = { in: '入库', out: '出库' };

/** Safe per-line amount: 0 when qty is empty/non-integer, else price × qty (both integer → cents-safe). */
function lineAmount(line: PickedLine): number {
  const qtyNum = line.qty.trim() === '' ? 0 : Number(line.qty);
  return Number.isInteger(qtyNum) ? line.price * qtyNum : 0;
}

export function RecordForm({ staffId, direction }: RecordFormProps) {
  const theme = useTheme();
  const staff = useStaffById(staffId);
  const createRecord = useCreateStockRecord();
  const [search, setSearch] = useState('');
  const products = useProducts(search ? { search: { text: search } } : undefined);
  const [lines, setLines] = useState<PickedLine[]>([]);
  const [note, setNote] = useState('');
  const [timestamp, setTimestamp] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);

  const linesWithAmount = lines.map((l) => ({ ...l, amount: lineAmount(l) }));
  const total = linesWithAmount.reduce((sum, l) => sum + l.amount, 0);

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
        <DateTimePicker
          testID="record-time"
          mode="datetime"
          value={new Date(timestamp)}
          onValueChange={(_e: DateTimePickerChangeEvent, date: Date) => setTimestamp(date.getTime())}
        />
      </View>

      {error && (
        <Text testID="form-error" style={{ color: theme.danger }}>
          {error}
        </Text>
      )}

      <Pressable
        testID="submit"
        onPress={submit}
        disabled={createRecord.isPending}
        style={[styles.submit, { backgroundColor: direction === 'in' ? theme.success : theme.danger }]}>
        <Text style={styles.submitText}>{createRecord.isPending ? '提交中…' : '提交'}</Text>
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
