// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";

import { StyleProvider } from "@/components/shell/StyleProvider";
import { Sparkline, hasSparklineData, sparklinePath } from "@/components/widgets/Sparkline";
import type { PresentationStyle } from "@/lib/types/redesign";

afterEach(cleanup);

function renderIn(style: PresentationStyle, area = false) {
  return render(
    <StyleProvider style={style} scope="staff">
      <Sparkline points={[2, 4, 3, 6, 5]} label="Tendencia 7 días: 2, 4, 3, 6, 5" width={120} height={28} area={area} />
    </StyleProvider>,
  );
}

describe("Sparkline", () => {
  it("path has pathLength 1 and draw", () => {
    const { container } = renderIn("visual");
    const line = container.querySelector('[data-slot="sparkline-line"]')!;
    expect(line.getAttribute("pathLength")).toBe("1");
    expect(line.getAttribute("class")).toBe("draw");
    expect(line.getAttribute("d")).toBe(sparklinePath([2, 4, 3, 6, 5], 120, 28));
  });

  it("the area fades in (anim-in) in Visual", () => {
    const { container } = renderIn("visual", true);
    expect(container.querySelector('[data-slot="sparkline-area"]')?.getAttribute("class")).toBe("anim-in");
  });

  it.each<PresentationStyle>(["esencial", "analitico"])("is static in %s", (style) => {
    const { container } = renderIn(style, true);
    const line = container.querySelector('[data-slot="sparkline-line"]')!;
    expect(line.getAttribute("pathLength")).toBeNull();
    expect(line.getAttribute("class")).toBeNull();
    expect(container.querySelector('[data-slot="sparkline-area"]')?.getAttribute("class")).toBeNull();
  });

  it("keeps its size and label (unchanged API)", () => {
    const { container } = renderIn("visual");
    const svg = container.querySelector('[data-slot="sparkline"]')!;
    expect(svg.getAttribute("role")).toBe("img");
    expect(svg.getAttribute("aria-label")).toBe("Tendencia 7 días: 2, 4, 3, 6, 5");
    expect(svg.getAttribute("width")).toBe("120");
    expect(svg.getAttribute("height")).toBe("28");
  });

  it("hasSparklineData needs two points, not all zero", () => {
    expect(hasSparklineData([1])).toBe(false);
    expect(hasSparklineData([0, 0])).toBe(false);
    expect(hasSparklineData([0, 1])).toBe(true);
  });
});
