/**
 * Fails a test that makes React log an "update ... was not wrapped in act(...)" warning (#1030). Such a warning
 * means the UI changed after the test stopped looking, so the test asserted on a state that wasn't settled yet. Fix
 * the test (await the settled UI with `findBy…`/`waitFor`, `settle()` from `tests/helpers/settle`, or advance fake
 * timers inside `act`) instead of adding it to the allow-list. Every other `console.error` passes through untouched.
 */
import { afterEach, expect } from "vitest";

/**
 * Test files that still log the warning, relative to cincel-app/. Each entry is debt: fix the file and remove it.
 * Keep the list empty.
 */
const ALLOWED_FILES: readonly string[] = [];

const ACT_WARNING = "not wrapped in act(";

let pending: string[] = [];

const forward = console.error.bind(console);
console.error = (...args: unknown[]) => {
  const [message] = args;
  if (typeof message === "string" && message.includes(ACT_WARNING)) {
    // React passes the component name as the first substitution argument.
    pending.push(typeof args[1] === "string" ? args[1] : "an anonymous component");
  }
  forward(...args);
};

function allowed(testPath: string | undefined): boolean {
  const normalized = (testPath ?? "").replaceAll("\\", "/");
  return ALLOWED_FILES.some((file) => normalized.endsWith(`/${file}`));
}

afterEach(() => {
  const components = pending;
  pending = [];
  if (components.length === 0 || allowed(expect.getState().testPath)) return;
  const names = [...new Set(components)].join(", ");
  throw new Error(
    `React logged ${components.length} act(...) warning(s) for ${names}: the UI updated after the test's last ` +
      "check. Await the settled UI (findBy…/waitFor, settle() from tests/helpers/settle) or advance fake timers " +
      "inside act.",
  );
});
