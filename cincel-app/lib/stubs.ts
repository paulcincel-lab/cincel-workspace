/**
 * Contract-phase stub helpers (redesign BE §9.10, §21 Rule 1). Phase 1 lands
 * every redesign module with its final signature; the owning phase replaces
 * the body. Pure and client-safe.
 *
 * - Server action write stubs throw `NOT_IMPLEMENTED` (mapped to "Esta función
 *   todavía no está disponible." by `actionErrorText`).
 * - Server action read stubs return a safe default and never throw.
 * - Every other stubbed module throws `not implemented: <name>`.
 */

/** The action error code of an unimplemented write action. */
export const NOT_IMPLEMENTED = "NOT_IMPLEMENTED";

/** Body of a server action write stub. The extra arguments only mark the inputs as consumed. */
export function notImplementedAction(name: string, ...args: unknown[]): never {
  void args;
  throw new Error(`${NOT_IMPLEMENTED}: ${name}`);
}

/** Body of a server action read stub: returns the safe default. */
export function stubDefault<T>(value: T, ...args: unknown[]): T {
  void args;
  return value;
}

/** Body of any other stubbed function. */
export function notImplemented(name: string, ...args: unknown[]): never {
  void args;
  throw new Error(`not implemented: ${name}`);
}
