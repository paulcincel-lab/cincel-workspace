// @vitest-environment happy-dom
/**
 * Visual kit motion (Estilos #985): each widget's Visual branch carries the
 * shared motion utility of its frame; Esencial and Analítico render none.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { ReactNode } from "react";

vi.mock("next/navigation", () => ({
  usePathname: () => "/tareas",
  useSearchParams: () => new URLSearchParams(""),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
// recharts needs layout; the chart modules render a plain box here.
vi.mock("@/components/widgets/charts/lazy", () => ({
  LazyDonutChart: () => <div data-testid="donut" />,
  LazyAreaSeriesChart: () => <div data-testid="area-chart" />,
}));

import { StyleProvider } from "@/components/shell/StyleProvider";
import { DistributionWidget } from "@/components/widgets/DistributionWidget";
import { EntityCardGrid } from "@/components/widgets/EntityCardGrid";
import { KpiWidget } from "@/components/widgets/KpiWidget";
import { PeopleWidget } from "@/components/widgets/PeopleWidget";
import { ProgressListWidget } from "@/components/widgets/ProgressListWidget";
import { Sparkline } from "@/components/widgets/Sparkline";
import { TaskBoardWidget } from "@/components/widgets/TaskBoardWidget";
import { WidgetCard } from "@/components/widgets/WidgetCard";
import { distributionFixture } from "@/components/widgets/fixtures/distribution";
import { entityCardProjectsFixture } from "@/components/widgets/fixtures/entity-card-grid";
import { kpiFixture } from "@/components/widgets/fixtures/kpi";
import { PEOPLE_FIXTURE } from "@/components/widgets/fixtures/people";
import { progressListFixture } from "@/components/widgets/fixtures/progress-list";
import { taskBoardFixture, taskBoardTableFixture } from "@/components/widgets/fixtures/task-board";
import { renderWithQueryClient } from "@/lib/query/test-utils";
import type { PresentationStyle } from "@/lib/types/redesign";

afterEach(cleanup);

/** Every motion utility of the kit, as class tokens. */
const MOTION = ["anim-in", "rise", "lift", "drag-lift", "draw", "grow", "grow-x", "ring", "ring-in"];

function motionClasses(container: HTMLElement): string[] {
  const found = new Set<string>();
  for (const el of Array.from(container.querySelectorAll("[class]"))) {
    for (const token of (el.getAttribute("class") ?? "").split(/\s+/)) if (MOTION.includes(token)) found.add(token);
  }
  return [...found].sort();
}

function inStyle(style: PresentationStyle, ui: ReactNode) {
  return (
    <StyleProvider style={style} scope="staff">
      {ui}
    </StyleProvider>
  );
}

const WIDGETS: { name: string; utility: string; ui: () => ReactNode; query?: boolean }[] = [
  { name: "Sparkline", utility: "draw", ui: () => <Sparkline points={[1, 3, 2, 5]} label="Tendencia" area /> },
  { name: "KpiWidget", utility: "anim-in", ui: () => <KpiWidget items={kpiFixture} /> },
  {
    name: "DistributionWidget",
    utility: "ring-in",
    ui: () => <DistributionWidget title={distributionFixture.title} segments={distributionFixture.segments} />,
  },
  { name: "PeopleWidget", utility: "grow-x", ui: () => <PeopleWidget people={PEOPLE_FIXTURE} show={["load"]} /> },
  {
    name: "ProgressListWidget",
    utility: "grow-x",
    ui: () => <ProgressListWidget title={progressListFixture.title} items={progressListFixture.items} />,
  },
  { name: "EntityCardGrid", utility: "ring", ui: () => <EntityCardGrid items={entityCardProjectsFixture} /> },
  {
    name: "WidgetCard",
    utility: "lift",
    ui: () => (
      <WidgetCard title="Ritmo semanal" actions={<button type="button">Ver todo</button>}>
        <p>Cuerpo</p>
      </WidgetCard>
    ),
  },
  {
    name: "TaskBoardWidget",
    utility: "anim-in",
    query: true,
    ui: () => <TaskBoardWidget board={taskBoardFixture} table={taskBoardTableFixture} onMove={() => Promise.resolve()} />,
  },
];

describe.each(WIDGETS)("$name motion", ({ utility, ui, query }) => {
  const mount = (style: PresentationStyle) => (query ? renderWithQueryClient(inStyle(style, ui())) : render(inStyle(style, ui())));

  it(`Visual renders ${utility}`, () => {
    const { container } = mount("visual");
    expect(motionClasses(container)).toContain(utility);
  });

  it.each<PresentationStyle>(["esencial", "analitico"])("Esencial and Analítico render no motion class (%s)", (style) => {
    const { container } = mount(style);
    expect(motionClasses(container)).toEqual([]);
  });
});

describe("Visual extras", () => {
  it("KpiWidget tiles fade in 40 ms apart", () => {
    const { container } = render(inStyle("visual", <KpiWidget items={kpiFixture} />));
    const tiles = Array.from(container.querySelectorAll<HTMLElement>('[data-slot="kpi-tile"]'));
    expect(tiles.length).toBeGreaterThan(1);
    tiles.forEach((tile, i) => {
      expect(tile.className).toContain("anim-in");
      expect(tile.style.getPropertyValue("--anim-delay")).toBe(`${i * 40}ms`);
    });
  });

  it("ProgressListWidget rings fill in with ring", () => {
    const { container } = render(
      inStyle("visual", <ProgressListWidget title={progressListFixture.title} items={progressListFixture.items} variant="rings" />),
    );
    expect(motionClasses(container)).toContain("ring");
  });

  it("WidgetCard without a link or button does not lift", () => {
    const { container } = render(
      inStyle(
        "visual",
        <WidgetCard title="Ritmo semanal">
          <p>Cuerpo</p>
        </WidgetCard>,
      ),
    );
    expect(motionClasses(container)).not.toContain("lift");
  });

  it("EntityCardGrid lifts only cards with a link", () => {
    const items = [entityCardProjectsFixture[0], { ...entityCardProjectsFixture[1], href: undefined }];
    const { container } = render(inStyle("visual", <EntityCardGrid items={items} />));
    const [linked, plain] = Array.from(container.querySelectorAll<HTMLElement>("[data-item]"));
    expect(linked.className.split(/\s+/)).toContain("lift");
    expect(plain.className.split(/\s+/)).not.toContain("lift");
  });

  it("a dashboard view override follows the branch: table view of a Visual page renders no motion", () => {
    const { container } = render(
      inStyle("visual", <DistributionWidget title={distributionFixture.title} segments={distributionFixture.segments} view="table" />),
    );
    expect(motionClasses(container)).not.toContain("ring-in");
  });
});

describe("WidgetCard section entrance", () => {
  it("Visual rises 60 ms per section with enterIndex; Esencial does not", () => {
    const card = (style: PresentationStyle) =>
      render(
        inStyle(
          style,
          <WidgetCard title="Ficha" enterIndex={2}>
            <p>Cuerpo</p>
          </WidgetCard>,
        ),
      );
    const visual = card("visual").container.querySelector<HTMLElement>('[data-style="visual"]')!;
    expect(visual.className.split(/\s+/)).toContain("rise");
    expect(visual.style.getPropertyValue("--anim-delay")).toBe("120ms");
    cleanup();
    expect(motionClasses(card("esencial").container)).toEqual([]);
  });
});
