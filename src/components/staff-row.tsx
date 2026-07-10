import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { MoneyText } from '@/components/money-text';
import { LevelBadge } from '@/components/level-badge';
import { useMemberBalance } from '@/hooks/reads';
import { useCreateTopup } from '@/hooks/mutations';
import { useTheme } from '@/hooks/use-theme';
import { cents, type Cents } from '@/data/primitives';
import type { Staff } from '@/data/staff';

/**
 * One member row in the 记账 list (stock-balance-refactor balance-domain).
 *
 * Members carry a money balance (Σ topup − Σ out line_amount), so this row reads
 * `useMemberBalance` per-staff (one query per row — rules-of-react clean) and
 * renders 余额 via MoneyText + a 欠款 badge when it goes negative (invariant #5).
 * A [充值] affordance expands an inline top-up form (元 → Cents); [出库] is
 * delegated to the record form. The row body taps through to member detail.
 *
 * Navigation (out / open) is delegated so the row stays RNTL-testable; the top-up
 * form is local (money-in is this row's concern, not a navigation target).
 */
export interface StaffRowProps {
  staff: Staff;
  onOut: (staffId: string) => void;
  onOpen: (staffId: string) => void;
}

export function StaffRow({ staff, onOut, onOpen }: StaffRowProps) {
  const theme = useTheme();
  const balance = useMemberBalance(staff.id);
  const createTopup = useCreateTopup();
  const [showTopup, setShowTopup] = useState(false);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const amountCents: Cents | null = balance.data?.amount ?? null;

  const submitTopup = () => {
    const yuan = parseFloat(amount);
    if (!isFinite(yuan) || yuan <= 0) {
      setError('请输入有效金额');
      return;
    }
    setError(null);
    createTopup.mutate(
      { staff_id: staff.id, amount: cents(Math.round(yuan * 100)), note: note.trim() || undefined },
      {
        onSuccess: () => {
          setShowTopup(false);
          setAmount('');
          setNote('');
        },
      },
    );
  };

  return (
    <View style={[styles.wrap, { borderColor: theme.border }]}>
      <Pressable testID={`row-${staff.id}`} onPress={() => onOpen(staff.id)} style={styles.row}>
        <View style={styles.main}>
          <View style={styles.header}>
            <Text style={styles.name}>{staff.name}</Text>
            <LevelBadge level={staff.level} />
          </View>
          <View style={styles.meta}>
            <Text style={[styles.sub, { color: theme.textSecondary }]}>余额</Text>
            <MoneyText testID={`balance-${staff.id}`} cents={amountCents ?? cents(0)} negativeLabel="欠款" />
          </View>
        </View>
        <View style={styles.actions}>
          <Pressable
            testID={`topup-${staff.id}`}
            onPress={() => setShowTopup((v) => !v)}
            style={[styles.btn, { backgroundColor: theme.success }]}>
            <Text style={styles.btnText}>充值</Text>
          </Pressable>
          <Pressable
            testID={`out-${staff.id}`}
            onPress={() => onOut(staff.id)}
            style={[styles.btn, { backgroundColor: theme.danger }]}>
            <Text style={styles.btnText}>出库</Text>
          </Pressable>
        </View>
      </Pressable>
      {showTopup && (
        <View testID={`topup-form-${staff.id}`} style={[styles.form, { borderColor: theme.border }]}>
          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.textSecondary }]}>金额（元）</Text>
            <TextInput
              testID="topup-amount"
              style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }]}
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
            />
          </View>
          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.textSecondary }]}>备注（可选）</Text>
            <TextInput
              testID="topup-note"
              style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }]}
              value={note}
              onChangeText={setNote}
            />
          </View>
          {error && (
            <Text testID="topup-error" style={{ color: theme.danger }}>{error}</Text>
          )}
          <Pressable
            testID="topup-submit"
            onPress={submitTopup}
            disabled={createTopup.isPending}
            style={[styles.submit, { backgroundColor: theme.success }]}>
            <Text style={styles.btnText}>{createTopup.isPending ? '保存中…' : '确认充值'}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderWidth: 1, borderRadius: 8 },
  row: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 12 },
  main: { flex: 1, gap: 2 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: 16, fontWeight: '600' },
  sub: { fontSize: 13 },
  actions: { flexDirection: 'row', gap: 8 },
  btn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  btnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  form: { borderTopWidth: 1, padding: 12, gap: 8 },
  field: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { fontSize: 13, fontWeight: '500', width: 96 },
  input: { flex: 1, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 15 },
  submit: { borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
});
