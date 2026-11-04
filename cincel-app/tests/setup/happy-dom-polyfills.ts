/**
 * happy-dom doesn't implement the Web Animations API. Base UI's ScrollArea
 * calls `Element.getAnimations()` from a timer during its own cleanup, which
 * can fire after a test's synchronous portion ends (e.g. after an
 * `await waitFor(...)`) and crash as an unhandled exception even though the
 * test itself passed. A no-op stub is a safe, standard polyfill — no test
 * depends on real animation state.
 */
if (typeof Element !== "undefined" && !Element.prototype.getAnimations) {
  Element.prototype.getAnimations = function getAnimations() {
    return [];
  };
}

/**
 * Testing Library's async queries give up after 1 s by default. Under a full parallel run (many DB test files on
 * one machine) a re-render after a mocked action can take longer, so DOM tests get 5 s.
 */
if (typeof document !== "undefined") {
  const { configure } = await import("@testing-library/react");
  configure({ asyncUtilTimeout: 5000 });
}
/**
 * Node 25 ships its own global `localStorage`, which shadows happy-dom's and has no methods unless Node is started
 * with `--localstorage-file`. Put an in-memory Storage back so DOM tests behave the same on every Node version.
 */
if (typeof window !== "undefined" && typeof window.localStorage?.clear !== "function") {
  const store = new Map<string, string>();
  const memoryStorage: Storage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key) => store.get(key) ?? null,
    key: (index) => Array.from(store.keys())[index] ?? null,
    removeItem: (key) => void store.delete(key),
    setItem: (key, value) => void store.set(key, String(value)),
  };
  Object.defineProperty(window, "localStorage", { configurable: true, value: memoryStorage });
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: memoryStorage });
}
export {};
