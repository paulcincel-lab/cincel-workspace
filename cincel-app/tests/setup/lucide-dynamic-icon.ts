/**
 * lucide's `DynamicIcon` imports its icon in an effect and sets state when the import resolves. On a cold or busy
 * machine that lands after the test's last check, which the act guard reports. Render the same icon synchronously
 * from the static set instead; a test that needs another behavior can still `vi.mock("lucide-react/dynamic", …)`.
 */
import { createElement, forwardRef, type ComponentProps, type ComponentType } from "react";
import { vi } from "vitest";

vi.mock("lucide-react/dynamic", async (importOriginal) => {
  const actual = await importOriginal<typeof import("lucide-react/dynamic")>();
  // The module's named exports include the aliases the dynamic names use (the `icons` map doesn't).
  const byName = (await import("lucide-react")) as unknown as Record<string, ComponentType<Record<string, unknown>>>;
  const pascal = (name: string) =>
    name
      .split("-")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join("");
  const DynamicIcon = forwardRef<SVGSVGElement, ComponentProps<typeof actual.DynamicIcon>>(
    ({ name, fallback: Fallback, ...props }, ref) => {
      const Icon = byName[pascal(name)];
      if (Icon) return createElement(Icon, { ...props, ref });
      return Fallback ? createElement(Fallback) : null;
    },
  );
  DynamicIcon.displayName = "DynamicIcon";
  return { ...actual, DynamicIcon, default: DynamicIcon };
});
