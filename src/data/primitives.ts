/**
 * Shared data-layer primitives (React-free).
 *
 * The repository owns id generation, timestamps, and money representation so
 * every module uses one definition. These are pure functions/types, safe in
 * both the node test runtime and the React Native production runtime.
 */

let idCounter = 0;

/**
 * Generate a unique string id. Single-operator offline app: collision-resistance
 * (not cryptographic strength) is the bar — a monotonic counter plus time plus
 * randomness satisfies it without depending on a `crypto` global (which is not
 * reliably available on Hermes/RN).
 */
export function id(): string {
  idCounter += 1;
  return (
    Date.now().toString(36) +
    "-" +
    idCounter.toString(36) +
    "-" +
    Math.random().toString(36).slice(2, 8)
  );
}

/**
 * Current wall-clock time in epoch milliseconds.
 *
 * System fields (created_at / updated_at / voided_at / audit timestamp) take
 * real `now`; a record's `timestamp` is user-settable and backdatable. Tests
 * stub time via `jest.useFakeTimers()` + `jest.setSystemTime()`.
 */
export function now(): number {
  return Date.now();
}

/**
 * Money — integer cents (分). Stored and computed as integers to avoid
 * floating-point drift; the type layer rejects fractional money.
 *
 * The brand makes a raw `number` unassignable to `Cents`, so the only way to
 * mint one is `cents()`, which validates integrality. Arithmetic on Cents
 * drops the brand (returns `number`); re-mint via `cents()` when storing back.
 */
export type Cents = number & { readonly __brand: "Cents" };

/** Mint a Cents value; throws RangeError on any non-integer. */
export function cents(value: number): Cents {
  if (!Number.isInteger(value)) {
    throw new RangeError(`cents() expects an integer (分), got ${value}`);
  }
  return value as Cents;
}
