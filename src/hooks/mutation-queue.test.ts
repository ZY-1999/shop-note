import { describe, expect, test } from "@jest/globals";
import { MutationQueue } from "@/hooks/mutation-queue";

describe("MutationQueue — serialization (ADR-0005)", () => {
  test("two tasks enqueued together never overlap; the second starts only after the first resolves", async () => {
    const queue = new MutationQueue();
    const events: string[] = [];

    const taskA = () =>
      new Promise<string>((resolve) => {
        events.push("A:start");
        setTimeout(() => {
          events.push("A:end");
          resolve("a");
        }, 20);
      });
    const taskB = () =>
      new Promise<string>((resolve) => {
        events.push("B:start");
        setTimeout(() => {
          events.push("B:end");
          resolve("b");
        }, 5);
      });

    // Enqueue both before either settles — the gate must serialize them.
    const all = Promise.all([queue.run(taskA), queue.run(taskB)]);
    const [a, b] = await all;

    expect(a).toBe("a");
    expect(b).toBe("b");
    // B started strictly after A ended — zero overlap (no nested BEGIN).
    expect(events).toEqual(["A:start", "A:end", "B:start", "B:end"]);
  });

  test("a task's rejection does not block later tasks (the chain stays healthy)", async () => {
    const queue = new MutationQueue();
    const order: string[] = [];

    await queue
      .run(async () => {
        order.push("first");
        throw new Error("boom");
      })
      .catch((e) => {
        expect((e as Error).message).toBe("boom");
      });

    const second = await queue.run(async () => "second-ok");
    expect(second).toBe("second-ok");
    expect(order).toEqual(["first"]);
  });

  test("results come back in enqueue order even when later tasks finish faster", async () => {
    const queue = new MutationQueue();
    const slow = queue.run(
      () => new Promise<string>((r) => setTimeout(() => r("slow"), 20)),
    );
    const fast = queue.run(
      () => new Promise<string>((r) => setTimeout(() => r("fast"), 1)),
    );
    // Promise.all preserves array order regardless of settling order.
    expect(await Promise.all([slow, fast])).toEqual(["slow", "fast"]);
  });
});
