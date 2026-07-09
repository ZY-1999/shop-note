import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, StyleSheet, TextInput, View } from 'react-native';

import { StaffRow } from '@/components/staff-row';
import { useStaff, useStaffSummaries } from '@/hooks/reads';
import { useTheme } from '@/hooks/use-theme';

/**
 * 记账 tab home (spec #05) — the operator's primary landing. A searchable list of
 * active staff, each row showing that staff's current holding summary (the one-pass
 * `staffSummaries()` rollup, joined by staff_id), with 入库/出库 jumping into the
 * prefilled record form (#6) and a row tap opening staff detail (#7).
 *
 * Search narrows staff by name/phone via `useStaff({ search })`; the summaries query
 * is shared across all rows (one invalidate refreshes every row — ADR-0005).
 */
export default function BookkeepingTab() {
  const theme = useTheme();
  const [search, setSearch] = useState('');
  const staff = useStaff(search ? { search } : undefined);
  const summaries = useStaffSummaries();
  const summaryById = new Map((summaries.data ?? []).map((s) => [s.staff_id, s]));

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <TextInput
        testID="staff-search"
        style={[styles.search, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }]}
        placeholder="搜索员工姓名或电话"
        placeholderTextColor={theme.textSecondary}
        value={search}
        onChangeText={setSearch}
      />
      <FlatList
        data={staff.data}
        keyExtractor={(s) => s.id}
        renderItem={({ item }) => (
          <StaffRow
            staff={item}
            summary={summaryById.get(item.id)}
            onIn={(id) =>
              router.push({ pathname: '/bookkeeping/record-form', params: { staff_id: id, direction: 'in' } })
            }
            onOut={(id) =>
              router.push({ pathname: '/bookkeeping/record-form', params: { staff_id: id, direction: 'out' } })
            }
            onOpen={(id) => router.push({ pathname: '/bookkeeping/staff/[id]', params: { id } })}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 12, gap: 8 },
  search: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
});
