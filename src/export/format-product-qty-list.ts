/**
 * Merge product lines into `标题×qty` joined by顿号 (、).
 * Same title sums qty; order follows first appearance.
 */
export function formatProductQtyList(
  items: Array<{ title: string; qty: number }>,
): string {
  const order: string[] = [];
  const qtyByTitle = new Map<string, number>();
  for (const { title, qty } of items) {
    if (!qtyByTitle.has(title)) order.push(title);
    qtyByTitle.set(title, (qtyByTitle.get(title) ?? 0) + qty);
  }
  return order.map((t) => `${t}×${qtyByTitle.get(t)}`).join("、");
}
