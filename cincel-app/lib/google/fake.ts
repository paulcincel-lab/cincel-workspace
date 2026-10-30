/**
 * `GOOGLE_FAKE=1` swaps every Google call behind `lib/google/*` for an
 * in-process fake, so tests and local e2e runs never reach Google. It is for
 * tests only: with `NODE_ENV=production` the app refuses to start (see
 * `instrumentation.ts`), and every call that would pick the fake throws.
 *
 * No `server-only` import: the monday CLI shares the service account code.
 */

type Env = Record<string, string | undefined>;

export class GoogleFakeInProductionError extends Error {
  constructor() {
    super("GOOGLE_FAKE=1 no se permite con NODE_ENV=production");
    this.name = "GoogleFakeInProductionError";
  }
}

/** Throws when `GOOGLE_FAKE=1` is set in production. */
export function assertGoogleFakeAllowed(env: Env = process.env): void {
  if (env.GOOGLE_FAKE?.trim() === "1" && env.NODE_ENV === "production") throw new GoogleFakeInProductionError();
}

/** Whether the fake Google implementation is selected. Throws in production. */
export function isGoogleFake(env: Env = process.env): boolean {
  assertGoogleFakeAllowed(env);
  return env.GOOGLE_FAKE?.trim() === "1";
}

/** Bearer token the fake service account hands out. Never valid at Google. */
export const FAKE_ACCESS_TOKEN = "fake-google-access-token";
