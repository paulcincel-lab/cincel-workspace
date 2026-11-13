// @vitest-environment node
/**
 * Type-level checks of the shared widget shapes (redesign BE §6.1, FE §4.10.1):
 * the aggregate types are composed only of these shapes, and UI-only inputs
 * (`actions`, `footer`, `renderCell`) are not data fields.
 */
import { describe, expectTypeOf, it } from "vitest";

import type { InicioData, PersonaDetail } from "@/lib/types/redesign";
import type {
  AgendaItem,
  AttentionItem,
  Availability,
  DistributionSegment,
  EntityCard,
  KpiDatum,
  PersonDatum,
  ProgressItem,
  RecordTableData,
} from "@/lib/types/widgets";

describe("widget shapes", () => {
  it("compose InicioData", () => {
    expectTypeOf<InicioData["kpis"]>().toEqualTypeOf<KpiDatum[]>();
    expectTypeOf<InicioData["tasksByEtapa"]>().toEqualTypeOf<DistributionSegment[]>();
    expectTypeOf<InicioData["attention"]>().toEqualTypeOf<AttentionItem[]>();
    expectTypeOf<InicioData["myDay"]>().toEqualTypeOf<AgendaItem[]>();
    expectTypeOf<InicioData["projectsProgress"]>().toEqualTypeOf<ProgressItem[]>();
    expectTypeOf<InicioData["workload"]>().toEqualTypeOf<PersonDatum[]>();
  });

  it("compose PersonaDetail", () => {
    expectTypeOf<PersonaDetail["person"]>().toEqualTypeOf<PersonDatum>();
    expectTypeOf<PersonaDetail["stats"]>().toEqualTypeOf<KpiDatum[]>();
    expectTypeOf<PersonaDetail["availability"]>().toEqualTypeOf<Availability[]>();
  });

  it("keep UI-only props out of the data", () => {
    expectTypeOf<PersonDatum>().not.toHaveProperty("actions");
    expectTypeOf<EntityCard>().not.toHaveProperty("footer");
    expectTypeOf<RecordTableData>().not.toHaveProperty("renderCell");
  });

  it("type the style filters", () => {
    expectTypeOf<KpiDatum["visibleIn"]>().toEqualTypeOf<("visual" | "esencial" | "analitico")[] | undefined>();
    expectTypeOf<AgendaItem["meetingUrl"]>().toEqualTypeOf<string | undefined>();
  });
});
