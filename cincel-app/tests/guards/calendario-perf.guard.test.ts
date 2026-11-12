// @vitest-environment node
/**
 * Performance budgets of /calendario and the range loader (issue 1092), checked without a database or a
 * browser: the payload of a month with the per-day caps, the item shape (no notes or descriptions), the
 * number of reads of the range loader and the heavy libraries kept out of the page's static imports.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { PER_DAY_LIMIT, taskRowToItem, type TaskItemRow } from "@/lib/calendario/items";
import { LIST_PAGE_DEFAULT, LIST_PAGE_MAX } from "@/lib/repositories/calendario-repository";

const ROOT = join(__dirname, "../..");
const read = (file: string) => readFileSync(join(ROOT, file), "utf8");

/** Budget: bytes of the range payload for a month view (docs/perf/route-budgets.md). */
const MONTH_PAYLOAD_BUDGET = 150 * 1024;

function row(i: number): TaskItemRow {
  return {
    id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    title: `Revisión de planos eléctricos de la cocina y baños, etapa ${i}`,
    commitmentDate: "2026-11-12",
    deliveryDate: null,
    status: "en_progreso",
    priority: "media",
    customStatusName: null,
    customStatusCloses: null,
    managerId: "11111111-1111-4111-8111-111111111111",
    managerName: "Ana García Martínez",
    parentTaskId: null,
    estimatedHours: 2,
    templateHours: null,
    projectId: "22222222-2222-4222-8222-222222222222",
    projectName: "Residencia Lomas de Chapultepec, Madrid 22",
    workflowId: "33333333-3333-4333-8333-333333333333",
    workflowKey: "diseno",
    workflowName: "Diseño",
    workflowSortOrder: 2,
    workflowColorSlot: 2,
    phaseId: "44444444-4444-4444-8444-444444444444",
    phaseName: "Proyecto ejecutivo",
    waiting: false,
    support: [
      { id: "55555555-5555-4555-8555-555555555555", name: "Luis Martínez" },
      { id: "66666666-6666-4666-8666-666666666666", name: "María Pérez" },
    ],
  } as TaskItemRow;
}

describe("/calendario budgets", () => {
  it("caps the items per day by vista", () => {
    expect(PER_DAY_LIMIT).toEqual({ mes: 3, semana: 12, dia: 200 });
  });

  it("a full month at the per-day cap stays under the payload budget", () => {
    const items = Array.from({ length: 31 * PER_DAY_LIMIT.mes }, (_, i) => taskRowToItem(row(i), { today: "2026-11-11", canEdit: true }));
    const bytes = Buffer.byteLength(JSON.stringify(items), "utf8");
    expect(bytes).toBeLessThanOrEqual(MONTH_PAYLOAD_BUDGET);
  });

  it("range items carry no notes or descriptions", () => {
    const item = taskRowToItem(row(1), { today: "2026-11-11", canEdit: true }) as Record<string, unknown>;
    for (const key of Object.keys(item)) expect(key).not.toMatch(/^(notes|description|descripcion)$/i);
    const select = read("lib/repositories/calendario-repository.ts");
    expect(select).not.toMatch(/tasks\.notes\b/);
    expect(select).not.toMatch(/tasks\.description\b/);
  });

  it("the Analítico list pages at 50 rows, 100 at most", () => {
    expect(LIST_PAGE_DEFAULT).toBe(50);
    expect(LIST_PAGE_MAX).toBe(100);
  });

  it("the range loader reads in one parallel group of three plus the own load", () => {
    const loader = read("lib/loaders/calendario.ts");
    const start = loader.indexOf("export async function loadCalendarioRange");
    const body = loader.slice(start, loader.indexOf("/** Keyset page of the Analítico list. */"));
    expect(body.match(/Promise\.all\(/g)).toHaveLength(1);
    expect(body.match(/calendarioRepository\.\w+\(/g)).toHaveLength(3);
    expect(body.match(/dayLoadRows\(/g)).toHaveLength(1);
    expect(body.match(/loadGoogleInfo\(/g)).toHaveLength(1);
  });

  it("the page does not statically import the chart libraries", () => {
    for (const file of ["app/(staff)/calendario/page.tsx", "components/calendario/CalendarioClient.tsx", "components/calendario/CalendarioChrome.tsx"]) {
      expect(read(file)).not.toMatch(/from\s+["'](?:recharts|@\/components\/ui\/shadcn\/chart)["']/);
    }
  });
});
