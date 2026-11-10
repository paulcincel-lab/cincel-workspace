/**
 * happy-dom has no layout, so Recharts' `ResponsiveContainer` measures 0×0 and logs "The width(0) and height(0) of
 * chart should be greater than 0" on every chart. Give every container a fixed size instead; a test that needs
 * another behavior can still `vi.mock("recharts", …)` itself, which takes precedence.
 */
import { createElement, type ComponentProps } from "react";
import { vi } from "vitest";

export const TEST_CHART_SIZE = { width: 800, height: 400 } as const;

vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  function ResponsiveContainer(props: ComponentProps<typeof actual.ResponsiveContainer>) {
    return createElement(actual.ResponsiveContainer, {
      ...props,
      width: TEST_CHART_SIZE.width,
      height: TEST_CHART_SIZE.height,
      aspect: undefined,
    });
  }
  return { ...actual, ResponsiveContainer };
});
