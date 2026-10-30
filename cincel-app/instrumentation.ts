import { assertGoogleFakeAllowed } from "./lib/google/fake";

/**
 * Runs once when the server starts: refuse to boot with the Google fake in
 * production. Next only logs a failed hook and keeps the process alive, so the
 * Node runtime exits explicitly.
 */
export function register(): void {
  try {
    assertGoogleFakeAllowed();
  } catch (error) {
    if (process.env.NEXT_RUNTIME === "nodejs") {
      console.error(error);
      process.exit(1);
    }
    throw error;
  }
}
