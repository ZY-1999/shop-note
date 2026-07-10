import { describe, expect, test } from "@jest/globals";
import { InMemoryAdapter } from "@/data/in-memory";
import { setupRepos } from "@/data/composition";
import { ADMIN_STAFF_ID } from "@/data/staff";
import { cents } from "@/data/primitives";

/**
 * MemberBalance (stock-balance-refactor): derived member money balance =
 * Σ(unvoided topup) − Σ(unvoided 'out' line_amount). Never stored; negative =
 * 欠款. Verified through the real composition root over InMemoryAdapter.
 *
 * Money note: `cents(N)` mints N 分 (¥N/100). ¥100 = cents(10000), ¥70 = cents(7000).
 */
function setup() {
  return setupRepos(new InMemoryAdapter());
}

describe("MemberBalance — derivation", () => {
  test("balance = Σ topup − Σ out line_amount (US3/US5)", async () => {
    const repos = setup();
    const product = await repos.products.create({ title: "可乐", purchase_price: cents(300) }); // ¥3.00
    const member = await repos.staff.create({ name: "张三", phone: "", notes: "" });

    expect((await repos.memberBalance.balance(member.id)).amount).toBe(cents(0));

    await repos.topups.create({ staff_id: member.id, amount: cents(10000) }); // +¥100.00
    expect((await repos.memberBalance.balance(member.id)).amount).toBe(cents(10000));

    // out: 10 × ¥3.00 = ¥30.00 (3000¢)
    await repos.stockRecords.create({
      staff_id: member.id,
      direction: "out",
      items: [{ product_id: product.id, qty: 10 }],
    });
    expect((await repos.memberBalance.balance(member.id)).amount).toBe(cents(7000)); // ¥70.00
  });

  test("out exceeding top-up → negative balance (欠款), no error (invariant #5)", async () => {
    const repos = setup();
    const product = await repos.products.create({ title: "可乐", purchase_price: cents(500) }); // ¥5.00
    const member = await repos.staff.create({ name: "张三", phone: "", notes: "" });

    await repos.topups.create({ staff_id: member.id, amount: cents(10000) }); // +¥100.00
    // out total: 4 × ¥5 + 20 × ¥5 = ¥120.00 (12000¢) → exceeds the ¥100 top-up
    await repos.stockRecords.create({
      staff_id: member.id, direction: "out", items: [{ product_id: product.id, qty: 4 }],
    });
    await repos.stockRecords.create({
      staff_id: member.id, direction: "out", items: [{ product_id: product.id, qty: 20 }],
    });
    // 10000¢ − 12000¢ = −2000¢ → 欠款 ¥20.00, returned as-is (no clamp, no error)
    expect((await repos.memberBalance.balance(member.id)).amount).toBe(cents(-2000));
  });
});

describe("MemberBalance — void propagation (US11)", () => {
  test("voiding a top-up drops it from the balance", async () => {
    const repos = setup();
    const member = await repos.staff.create({ name: "张三", phone: "", notes: "" });
    const t1 = await repos.topups.create({ staff_id: member.id, amount: cents(10000) }); // ¥100
    await repos.topups.create({ staff_id: member.id, amount: cents(5000) }); // ¥50
    expect((await repos.memberBalance.balance(member.id)).amount).toBe(cents(15000));

    await repos.topups.void(t1.id);
    expect((await repos.memberBalance.balance(member.id)).amount).toBe(cents(5000)); // only ¥50 left
  });

  test("voiding an 'out' record recovers the balance (out no longer spent)", async () => {
    const repos = setup();
    const product = await repos.products.create({ title: "可乐", purchase_price: cents(300) });
    const member = await repos.staff.create({ name: "张三", phone: "", notes: "" });
    await repos.topups.create({ staff_id: member.id, amount: cents(10000) }); // ¥100
    const out = await repos.stockRecords.create({
      staff_id: member.id, direction: "out", items: [{ product_id: product.id, qty: 10 }], // ¥30
    });
    expect((await repos.memberBalance.balance(member.id)).amount).toBe(cents(7000)); // ¥70

    await repos.stockRecords.void(out.record.id);
    expect((await repos.memberBalance.balance(member.id)).amount).toBe(cents(10000)); // out voided → ¥100
  });
});

describe("MemberBalance — read-only + separation", () => {
  test("every read recomputes; MemberBalance exposes no write surface", async () => {
    const repos = setup();
    const member = await repos.staff.create({ name: "张三", phone: "", notes: "" });
    expect(await repos.memberBalance.balance(member.id)).toEqual(await repos.memberBalance.balance(member.id));

    // @ts-expect-error — no save/persist surface
    void repos.memberBalance.save;
  });

  test("restock under admin -1 does NOT affect a member's balance (money ≠ stock)", async () => {
    const repos = setup();
    const product = await repos.products.create({ title: "可乐", purchase_price: cents(300) });
    const member = await repos.staff.create({ name: "张三", phone: "", notes: "" });
    // global restock has nothing to do with member money
    await repos.stockRecords.create({
      staff_id: ADMIN_STAFF_ID, direction: "in", items: [{ product_id: product.id, qty: 100 }],
    });
    expect((await repos.memberBalance.balance(member.id)).amount).toBe(cents(0));
  });
});
