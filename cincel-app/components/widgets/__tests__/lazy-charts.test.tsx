// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

import { StyleProvider } from "@/components/shell/StyleProvider";
import { DistributionWidget, distributionSummary } from "@/components/widgets/DistributionWidget";
import { LineSeriesWidget } from "@/components/widgets/LineSeriesWidget";
import { distributionFixture } from "@/components/widgets/fixtures/distribution";

// happy-dom has no layout, so ResponsiveContainer measures 0×0 and renders nothing.
vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactNode }) => <>{children}</>,
  };
});

afterEach(() => {
  cleanup();
});

describe("lazy charts (issue 922)", () => {
  it("the donut's label is there at once and the chart arrives with its chunk", async () => {
    const { container } = render(
      <StyleProvider style="visual" scope="staff">
        <DistributionWidget {...distributionFixture} />
      </StyleProvider>,
    );
    const img = screen.getByRole("img");
    expect(img.getAttribute("aria-label")).toBe(
      distributionSummary(distributionFixture.title, distributionFixture.segments, distributionFixture.totalLabel),
    );
    await waitFor(() => expect(img.querySelector('[data-slot="chart"]')).not.toBeNull());
    expect(container.querySelector('[data-slot="chart-placeholder"]')).toBeNull();
  });

  it("the line chart keeps its height while loading and then renders the chart", async () => {
    const { container } = render(
      <StyleProvider style="visual" scope="staff">
        <LineSeriesWidget
          title="Ritmo semanal"
          points={[
            { key: "s1", label: "S1", values: { cerradas: 3 } },
            { key: "s2", label: "S2", values: { cerradas: 5 } },
          ]}
          series={[{ key: "cerradas", label: "Cerradas", colorVar: "var(--chart-1)", area: true }]}
          table={{ columns: [], rows: [] }}
        />
      </StyleProvider>,
    );
    const placeholder = container.querySelector('[data-slot="chart-placeholder"]');
    if (placeholder) expect(placeholder.className).toContain("h-56");
    await waitFor(() => expect(container.querySelector('[data-slot="chart"]')).not.toBeNull());
  });
});
