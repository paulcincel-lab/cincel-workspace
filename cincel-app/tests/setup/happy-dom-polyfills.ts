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
