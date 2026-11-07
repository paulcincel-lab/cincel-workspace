// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import axe from "axe-core";

import { ListPage, type ListSpec } from "@/components/patterns/ListPage";
import { Button } from "@/components/ui/shadcn/button";
import { taskBoardFixture, taskBoardTableFixture } from "@/components/widgets/fixtures/task-board";
import type { RecordTableData } from "@/lib/types/widgets";
import { THEME_IDS } from "@/lib/ui/themes";

const MODES = ["light", "dark"] as const;

function applyTheme(theme: string, mode: (typeof MODES)[number]) {
  const html = document.documentElement;
  html.setAttribute("data-theme", mode);
  html.setAttribute("data-theme-id", theme);
  html.classList.toggle("dark", mode === "dark");
}

async function seriousViolations(container: HTMLElement) {
  // Color contrast needs real layout/rendering, which happy-dom doesn't provide;
  // token pairs are covered by the CONTRAST_PAIRS / checkContrast preset test.
  const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  return results.violations
    .filter((v) => v.impact === "critical" || v.impact === "serious")
    .map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.html) }));
}

const table: RecordTableData = {
  columns: [
    { key: "nombre", label: "Proyecto" },
    { key: "tramo", label: "Tramo" },
    { key: "avance", label: "Avance", align: "right", format: "percent" },
  ],
  rows: [
    { id: "p1", nombre: "Casa Espino", tramo: "Diseño", avance: 40 },
    { id: "p2", nombre: "Local Papa", tramo: "Construcción", avance: 75 },
  ],
};


const SPECS: ListSpec[] = [
  { kind: "table", data: table },
  { kind: "cards", items: [{ id: "p1", title: "Casa Espino", subtitle: "Familia Espino" }], table },
  { kind: "people", people: [{ id: "s1", name: "Ana López", initials: "AL", open: 4, overdue: 1 }], show: ["load"] },
  { kind: "board", board: taskBoardFixture, table: taskBoardTableFixture },
];

function Fixture({ spec, empty }: { spec: ListSpec; empty?: boolean }) {
  return (
    <main>
      <ListPage
        header={{
          title: "Proyectos",
          description: "Todos los proyectos de la organización.",
          actions: <Button>Nuevo proyecto</Button>,
        }}
        tabs={
          <nav aria-label="Vistas">
            <a href="?vista=tarjetas" aria-current="page">
              Tarjetas
            </a>{" "}
            <a href="?vista=tabla">Tabla</a>
          </nav>
        }
        filters={
          <div role="group" aria-label="Filtros">
            <Button variant="outline" aria-pressed="true">
              Activos
            </Button>
            <Button variant="outline" aria-pressed="false">
              Archivados
            </Button>
          </div>
        }
        spec={empty && spec.kind === "table" ? { ...spec, data: { ...spec.data, rows: [] } } : spec}
        empty={empty ? { title: "Aún no hay proyectos", description: "Crea el primero." } : undefined}
      />
    </main>
  );
}

afterEach(() => {
  cleanup();
  const html = document.documentElement;
  html.removeAttribute("data-theme");
  html.removeAttribute("data-theme-id");
  html.classList.remove("dark");
});

describe("ListPage accessibility", () => {
  for (const theme of THEME_IDS) {
    for (const mode of MODES) {
      for (const spec of SPECS) {
        it(`has no serious or critical axe violations (${theme}, ${mode}, ${spec.kind})`, async () => {
          applyTheme(theme, mode);
          const { container } = render(<Fixture spec={spec} />);
          expect(await seriousViolations(container)).toEqual([]);
        });
      }

      it(`has no serious or critical axe violations with the empty state (${theme}, ${mode})`, async () => {
        applyTheme(theme, mode);
        const { container } = render(<Fixture spec={SPECS[0]} empty />);
        expect(await seriousViolations(container)).toEqual([]);
      });
    }
  }
});
