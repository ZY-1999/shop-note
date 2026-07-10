import { Button, FlatList, Text, View } from "react-native";
import { useStaff } from "@/hooks/reads";
import { useCreateStaff } from "@/hooks/mutations";
import type { Staff } from "@/data/staff";

/**
 * Tracer component (spec #03) — the thinnest possible consumer of the
 * data-flow foundation: reads `useStaff()` and fires `useCreateStaff`. Its RNTL
 * test is the acceptance proof that the full vertical (providers → hook → React
 * Query → repo → render) works, and that the write→invalidate→refresh loop
 * re-renders with no manual refetch. Not a real screen — #5 owns the real staff
 * list; this exists only to prove the foundation end-to-end.
 */
export function StaffListTracer() {
  const { data } = useStaff();
  const createStaff = useCreateStaff();

  return (
    <View>
      <FlatList<Staff>
        testID="staff-list"
        data={data}
        keyExtractor={(s) => s.id}
        renderItem={({ item }) => <Text>{item.name}</Text>}
        ListEmptyComponent={<Text>no-staff</Text>}
      />
      <Button
        title="add-staff"
        onPress={() => createStaff.mutate({ name: "新会员", phone: "", notes: "" })}
      />
    </View>
  );
}
