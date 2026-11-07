/**
 * Placeholder body for project flow contracts whose implementation lands in a
 * later issue. Takes the arguments so stubs keep their parameters "used".
 */
export function notImplemented(name: string, ..._args: unknown[]): never {
  void _args;
  throw new Error(`not implemented: ${name}`);
}
