import { describe, expect, it } from "@jest/globals";
import { Text, View } from "react-native";
import { useBalance, useDailyFlow, useProducts, useShopAggregate, useStaff, useStaffInventory, useStockRecords } from "@/hooks/reads";
import { renderWithProviders } from "@/testing/render";
import { cents } from "@/data/primitives";

/**
 * Spec #03 — the read-hook foundation. useStaff is proven by the tracer; this
 * proves the OTHER six read hooks each wire ReposProvider → useRepos → React
 * Query → repo → render against the real InMemoryAdapter (ADR-0006: no mocked
 * Repos). ReadsProbe self-resolves the staff/product ids from useStaff +
 * useProducts (rather than receiving them as props), so the staff-scoped hooks
 * (useStaffInventory / useBalance) actually fire with valid ids once the master
 * data loads.
 */

function ReadsProbe() {
  const products = useProducts();
  const staff = useStaff();
  const records = useStockRecords();
  const aggregate = useShopAggregate();
  const firstStaffId = staff.data?.[0]?.id ?? "";
  const firstProductId = products.data?.[0]?.id ?? "";
  const staffInv = useStaffInventory(firstStaffId);
  const balance = useBalance(firstStaffId, firstProductId);
  const flow = useDailyFlow();
  return (
    <View>
      <Text testID="products">{(products.data ?? []).map((p) => p.title).join(",") || "empty"}</Text>
      <Text testID="records">{String((records.data ?? []).length)}</Text>
      <Text testID="aggregate">
        {(aggregate.data ?? []).map((a) => `${a.product.title}:${a.total_qty}`).join(",") || "empty"}
      </Text>
      <Text testID="staffInv">
        {(staffInv.data ?? []).map((b) => `${b.product.title}:${b.qty}`).join(",") || "empty"}
      </Text>
      <Text testID="balance">
        {balance.data ? `${balance.data.qty}:${balance.data.cost_amount}` : "empty"}
      </Text>
      <Text testID="flow">
        {(flow.data ?? []).map((f) => `${f.date}:${f.in_amount}:${f.out_amount}`).join(",") ||
          "empty"}
      </Text>
    </View>
  );
}

describe("read hooks — foundation (spec #03)", () => {
  it("each read hook returns its seeded read model through the full stack", async () => {
    const { view } = await renderWithProviders(<ReadsProbe />, {
      seed: async (repos) => {
        const product = await repos.products.create({ title: "可乐", purchase_price: cents(100) });
        const staff = await repos.staff.create({ name: "张三", phone: "1", notes: "" });
        await repos.stockRecords.create({
          staff_id: staff.id,
          direction: "in",
          timestamp: new Date(2026, 6, 9, 12).getTime(),
          items: [{ product_id: product.id, qty: 3 }],
        });
      },
    });

    // Master data + ledger.
    expect((await view.findByTestId("products")).props.children).toBe("可乐");
    expect((await view.findByTestId("records")).props.children).toBe("1");

    // Derived: shop aggregate (qty 3) + per-staff inventory (qty 3) + balance.
    expect((await view.findByTestId("aggregate")).props.children).toContain("可乐:3");
    expect((await view.findByTestId("staffInv")).props.children).toContain("可乐:3");
    expect((await view.findByTestId("balance")).props.children).toBe("3:300"); // 100 × 3

    // Derived: daily flow (in_amount = snapshot line_amount 100 × 3 = 300).
    const flow = await view.findByTestId("flow");
    expect(flow.props.children).toContain(":300:0");
  });
});
