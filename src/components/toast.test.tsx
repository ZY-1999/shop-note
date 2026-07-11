import { describe, expect, it } from "@jest/globals";
import { fireEvent } from "@testing-library/react-native";
import { Pressable, Text } from "react-native";

import { useToast } from "@/components/toast";
import { useCreateStaff } from "@/hooks/mutations";
import { renderWithProviders } from "@/testing/render";
import { waitForSync } from "@/testing/async";

/**
 * The save-feedback toast bubble. Mounted inside `AppProviders`, so it's
 * exercised here through `renderWithProviders`. Verified end-to-end: a real
 * mutation commit surfaces a success bubble (proving the mutation→toast wiring
 * in mutations.ts), and `useToast.error` surfaces the message (the error path
 * that turns a silent save failure into visible feedback).
 */

function SuccessProbe() {
  const createStaff = useCreateStaff();
  return (
    <Pressable testID="fire" onPress={() => createStaff.mutate({ name: "张三", phone: "", notes: "" })}>
      <Text>fire</Text>
    </Pressable>
  );
}

function ErrorProbe() {
  const toast = useToast();
  return (
    <Pressable testID="fire" onPress={() => toast.error("boom 失败原因")}>
      <Text>fire</Text>
    </Pressable>
  );
}

describe("Toast — save feedback bubble", () => {
  it("pops a success bubble when a mutation commits", async () => {
    const { view } = await renderWithProviders(<SuccessProbe />);
    fireEvent.press(view.getByTestId("fire"));
    // mutation commits → onSuccess → toast.success("会员已创建")
    expect(await waitForSync(() => view.getByText("会员已创建"))).toBeTruthy();
    expect(view.getByTestId("toast")).toBeTruthy();
  });

  it("pops a red error bubble carrying the message via useToast.error", async () => {
    const { view } = await renderWithProviders(<ErrorProbe />);
    fireEvent.press(view.getByTestId("fire"));
    expect(await waitForSync(() => view.getByText(/失败原因/))).toBeTruthy();
    expect(view.getByTestId("toast")).toBeTruthy();
  });
});
