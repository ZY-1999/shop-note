import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, StyleSheet, TextInput, View } from 'react-native';

import { StaffRow } from '@/components/staff-row';
import { useStaff, useStaffSummaries } from '@/hooks/reads';
import { useTheme } from '@/hooks/use-theme';

/**
 * 记账 tab home — the operator's primary landing. A searchable list of active
 * staff, each row showing that staff's current holding summary (the one-pass
 * `staffSummaries()` rollup, joined by staff_id), with 入库/出库 jumping into the
 * prefilled record form and a row tap opening staff detail.
 *
 * All active staff render — including zero-record / zero-inventory staff — so a
 * brand-new employee is visible without searching (spec #02 AC3/AC4, revised
 * 2026-07-10: reverses the original "hide zero-inventory in the default view").
 * `useStaff({ search })` narrows by name when searching; StaffRow renders
 * `库存：0件/0种 ¥0.00` for a staff with no summary. The summaries query is shared
 * across all rows (one invalidate refreshes every row — ADR-0005).
 */
export default function BookkeepingTab() {
  const theme = useTheme();
  const [search, setSearch] = useState('');
  const staff = useStaff(search ? { search } : undefined);
  const summaries = useStaffSummaries();
  const summaryById = new Map((summaries.data ?? []).map((s) => [s.staff_id, s]));

  // All active staff render (zero-record staff included — see header). Search
  // narrows via useStaff({ search }); no screen-level inventory filter remains.
  const rows = staff.data ?? [];

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <TextInput
        testID="staff-search"
        style={[styles.search, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }]}
        placeholder="搜索会员姓名或电话"
        placeholderTextColor={theme.textSecondary}
        value={search}
        onChangeText={setSearch}
      />
      <FlatList
        data={rows}
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
