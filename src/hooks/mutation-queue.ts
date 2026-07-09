/**
 * Serial mutation queue (ADR-0005).
 *
 * `ExpoSqliteAdapter.withTransaction` is NOT reentrant, and React Query runs
 * concurrent `useMutation`s by default — so every repo write must pass through
 * this gate. Tasks enqueued together run strictly in order: the next starts only
 * after the previous resolves, which is what prevents two rapid writes from
 * nesting a `BEGIN` inside a `BEGIN`.
 *
 * Pure TypeScript — the gate's own contract (serial execution) is what is
 * Jest-provable here. The adapter-level nesting failure it prevents is only
 * observable on the real adapter (device smoke / ADR-0004), because
 * `InMemoryAdapter.withTransaction` happens to nest safely.
 */
export class MutationQueue {
  private tail: Promise<unknown> = Promise.resolve();

  /**
   * Enqueue `task`; it runs only after every previously enqueued task has
   * settled. Resolves (in enqueue order) with the task's own result or rejects
   * with its error — one task's rejection never poisons the chain for the next.
   */
  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(task);
    // Advance the tail defensively: a task's error must not break the chain for
    // later tasks (they still run — React Query surfaces each mutation's error
    // independently via its own result).
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result as Promise<T>;
  }
}
