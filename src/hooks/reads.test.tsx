import { describe, expect, it } from "@jest/globals";
import { Text, View } from "react-native";
import { useDailyFlow, useProducts, useShopAggregate, useStockRecords } from "@/hooks/reads";
import { renderWithProviders } from "@/testing/render";
import { ADMIN_STAFF_ID } from "@/data/staff";
import { cents } from "@/data/primitives";

/**
 * Read-hook foundation. useStaff is proven by the tracer; this proves the OTHER
 * read hooks each wire ReposProvider → useRepos → React Query → repo → render
 * against the real InMemoryAdapter (ADR-0006: no mocked Repos).
 *
 * stock-balance-refactor: the per-staff `useStaffInventory` / `useBalance` hooks
 * are gone (members no longer hold stock); `useShopAggregate` is the single
 * inventory read. The seed posts a restock under the admin `-1` so the global
 * aggregate + daily flow are non-empty.
 */

function ReadsProbe() {
  const products = useProducts();
  const records = useStockRecords();
  const aggregate = useShopAggregate();
  const flow = useDailyFlow();
  return (
    <View>
      <Text testID="products">{(products.data ?? []).map((p) => p.title).join(",") || "empty"}</Text>
      <Text testID="records">{String((records.data ?? []).length)}</Text>
      <Text testID="aggregate">
        {(aggregate.data ?? []).map((a) => `${a.product.title}:${a.total_qty}`).join(",") || "empty"}
      </Text>
      <Text testID="flow">
        {(flow.data ?? []).map((f) => `${f.date}:${f.in_amount}:${f.out_amount}`).join(",") ||
          "empty"}
      </Text>
    </View>
  );
}

describe("read hooks — foundation", () => {
  it("each read hook returns its seeded read model through the full stack", async () => {
    const { view } = await renderWithProviders(<ReadsProbe />, {
      seed: async (repos) => {
        const product = await repos.products.create({ title: "可乐", purchase_price: cents(100) });
        await repos.staff.create({ name: "张三", phone: "1", notes: "" });
        await repos.stockRecords.create({
          staff_id: ADMIN_STAFF_ID,
          direction: "in",
          timestamp: new Date(2026, 6, 9, 12).getTime(),
          items: [{ product_id: product.id, qty: 3 }],
        });
      },
    });

    // Master data + ledger.
    expect((await view.findByTestId("products")).props.children).toBe("可乐");
    expect((await view.findByTestId("records")).props.children).toBe("1");

    // Derived: global shop aggregate (restock qty 3).
    expect((await view.findByTestId("aggregate")).props.children).toContain("可乐:3");

    // Derived: daily flow (in_amount = snapshot line_amount 100 × 3 = 300).
    const flow = await view.findByTestId("flow");
    expect(flow.props.children).toContain(":300:0");
  });
});
