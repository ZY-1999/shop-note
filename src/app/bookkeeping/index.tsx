import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, StyleSheet, TextInput, View } from 'react-native';

import { StaffRow } from '@/components/staff-row';
import { useStaff } from '@/hooks/reads';
import { useTheme } from '@/hooks/use-theme';

/**
 * 记账 tab home — the operator's primary landing. A searchable list of active
 * members, each row offering an 出库 affordance (jumping into the prefilled
 * record form) and a row tap opening member detail.
 *
 * stock-balance-refactor: members no longer hold stock, so the old per-staff
 * holding summary (`useStaffSummaries`) is gone. The 余额 display + 充值
 * affordance land in spec 03 (balance-domain); spec 02 leaves the row as a clean
 * skeleton. All active members render — including zero-record members — so a
 * brand-new member is visible without searching. `useStaff({ search })` narrows
 * by name when searching.
 */
export default function BookkeepingTab() {
  const theme = useTheme();
  const [search, setSearch] = useState('');
  const staff = useStaff(search ? { search } : undefined);

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
