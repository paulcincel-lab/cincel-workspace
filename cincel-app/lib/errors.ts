/**
 * Error thrown when a repository / Server Action data operation fails.
 *
 * The app must not silently fall back to localStorage on a write failure —
 * that would diverge Postgres from local state. Catch this at the call site,
 * surface it, and stop.
 */
export class RepositoryError extends Error {
  readonly operation: string;
  readonly detail: string;

  constructor(operation: string, detail: string) {
    super(`[Cincel] ${operation}: ${detail}`);
    this.name = "RepositoryError";
    this.operation = operation;
    this.detail = detail;
  }
}

/** Log a RepositoryError visibly. Call from a repository/action catch block. */
export function reportRepositoryError(error: RepositoryError): void {
  console.error(
    `%c⛔ Cincel – data operation failed`,
    "background:#dc2626;color:#fff;font-weight:bold;padding:2px 6px;border-radius:4px;"
  );
  console.error(`  Operation : ${error.operation}`);
  console.error(`  Detail    : ${error.detail}`);
}
