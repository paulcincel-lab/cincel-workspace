/**
 * Runs code inside a simulated React server request, so `cache()` from
 * "react" memoizes like it does during one RSC render. Outside a request
 * React's `cache()` is a passthrough, which is why a test needs this.
 *
 * The test file must load React's react-server build first:
 *
 *   vi.mock("react", async () => vi.importActual(REACT_SERVER_BUILD));
 */
import { resolve } from "node:path";

export const REACT_SERVER_BUILD = resolve(__dirname, "../../node_modules/react/cjs/react.react-server.development.js");

type Dispatcher = { getCacheForType<T>(resourceType: () => T): T };
type ServerInternals = { A: Dispatcher | null };

export async function withRequestCache<T>(fn: () => Promise<T>): Promise<T> {
  const react = (await import("react")) as unknown as Record<string, ServerInternals | undefined>;
  const internals = react.__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  if (!internals) throw new Error("withRequestCache needs React's react-server build (mock \"react\" with REACT_SERVER_BUILD)");
  const caches = new Map<unknown, unknown>();
  const previous = internals.A;
  internals.A = {
    getCacheForType<R>(resourceType: () => R): R {
      if (!caches.has(resourceType)) caches.set(resourceType, resourceType());
      return caches.get(resourceType) as R;
    },
  };
  try {
    return await fn();
  } finally {
    internals.A = previous;
  }
}
