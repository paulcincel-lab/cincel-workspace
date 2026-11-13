/**
 * "Reacomodar importación" pure parts (project flow BE §11, §16): CLI flags,
 * encoded targets, default and stored group targets, fase by title.
 */
import { describe, expect, it } from "vitest";

import {
  applyTargetOverrides,
  currentRemapInput,
  defaultGroupTarget,
  parseRemapArgs,
  parseTargetSpec,
  phaseInText,
  storedGroupTarget,
  type RemapCatalog,
} from "@/scripts/monday/remap";
import type { MondayRemapState } from "@/lib/types/monday-import";

const PRESALE = "00000000-0000-4000-8000-000000000001";
const DISENO = "00000000-0000-4000-8000-000000000002";
const CONSTRUCCION = "00000000-0000-4000-8000-000000000003";
const MINUTAS_P = "00000000-0000-4000-8000-000000000011";
const COBRO = "00000000-0000-4000-8000-000000000012";
const EJECUTIVO = "00000000-0000-4000-8000-000000000021";
const MINUTAS_D = "00000000-0000-4000-8000-000000000022";
const PROY_ARQ = "00000000-0000-4000-8000-000000000023";
const RESIDENCIA = "00000000-0000-4000-8000-000000000031";

const catalog: RemapCatalog = {
  workflows: [
    { id: PRESALE, key: "presale", name: "Presale", sortOrder: 0, active: true },
    { id: DISENO, key: "diseno", name: "Diseño", sortOrder: 1, active: true },
    { id: CONSTRUCCION, key: "construccion", name: "Construcción", sortOrder: 2, active: true },
  ],
  phases: [
    { id: MINUTAS_P, workflowId: PRESALE, key: "minutas", name: "Minutas", sortOrder: 3, active: true },
    { id: COBRO, workflowId: PRESALE, key: "cobro", name: "Cobro", sortOrder: 4, active: true },
    { id: PROY_ARQ, workflowId: DISENO, key: "proyecto_arquitectonico", name: "Proyecto Arquitectónico", sortOrder: 1, active: true },
    { id: EJECUTIVO, workflowId: DISENO, key: "ejecutivo", name: "Ejecutivo", sortOrder: 2, active: true },
    { id: MINUTAS_D, workflowId: DISENO, key: "minutas", name: "Minutas", sortOrder: 6, active: true },
    { id: RESIDENCIA, workflowId: CONSTRUCCION, key: "residencia", name: "Residencia", sortOrder: 0, active: true },
  ],
};

describe("parseRemapArgs", () => {
  it("is a dry run by default and keeps targets in order", () => {
    expect(
      parseRemapArgs(["--projects", "Madrid 22, Guadalajara 83", "--target", "Obra=etapa:construccion", "--target=Pagos=admin"]),
    ).toEqual({
      projects: ["Madrid 22", "Guadalajara 83"],
      targets: [
        { group: "Obra", spec: "etapa:construccion" },
        { group: "Pagos", spec: "admin" },
      ],
      apply: false,
      by: null,
    });
  });

  it("requires --by with --apply", () => {
    expect(parseRemapArgs(["--projects", "Madrid 22", "--apply"])).toBe("--apply requires --by <admin email>");
    expect(parseRemapArgs(["--projects", "Madrid 22", "--apply", "--by", "ana@cincel.mx"])).toMatchObject({
      apply: true,
      by: "ana@cincel.mx",
    });
  });

  it("refuses a missing project list, bad targets and unknown flags", () => {
    expect(parseRemapArgs([])).toMatch(/--projects/);
    expect(parseRemapArgs(["--projects", "A", "--target", "Obra"])).toMatch(/<group title>=<target>/);
    expect(parseRemapArgs(["--projects", "A", "--force"])).toBe("unknown option --force");
  });
});

describe("parseTargetSpec", () => {
  it("reads etapas by key, name or id", () => {
    expect(parseTargetSpec("etapa:construccion", catalog)).toEqual({ kind: "etapa", workflowId: CONSTRUCCION });
    expect(parseTargetSpec("etapa:Diseño", catalog)).toEqual({ kind: "etapa", workflowId: DISENO });
    expect(parseTargetSpec(`etapa:${PRESALE}`, catalog)).toEqual({ kind: "etapa", workflowId: PRESALE });
  });

  it("keeps `tramo:<key>` working as an alias of `etapa:<key>`", () => {
    expect(parseTargetSpec("tramo:construccion", catalog)).toEqual(parseTargetSpec("etapa:construccion", catalog));
    expect(parseTargetSpec("tramo:Diseño", catalog)).toEqual({ kind: "etapa", workflowId: DISENO });
  });

  it("reads fases by etapa/fase, unique name or id", () => {
    expect(parseTargetSpec("phase:diseno/ejecutivo", catalog)).toEqual({ kind: "phase", phaseId: EJECUTIVO });
    expect(parseTargetSpec("phase:Ejecutivo", catalog)).toEqual({ kind: "phase", phaseId: EJECUTIVO });
    expect(parseTargetSpec("phase:presale/Minutas", catalog)).toEqual({ kind: "phase", phaseId: MINUTAS_P });
    expect(parseTargetSpec("phase:minutas", catalog)).toMatch(/more than one etapa/);
  });

  it("reads the plain kinds and refuses unknown ones", () => {
    for (const kind of ["space", "project", "admin", "ignore"] as const) expect(parseTargetSpec(kind, catalog)).toEqual({ kind });
    expect(parseTargetSpec("etapa:decoracion", catalog)).toMatch(/unknown etapa/);
    expect(parseTargetSpec("area:1", catalog)).toMatch(/unknown target/);
  });
});

describe("defaultGroupTarget", () => {
  it("maps etapa names, fases of the board's etapa and 'Administrativo'", () => {
    expect(defaultGroupTarget("Presale", DISENO, catalog)).toEqual({ kind: "etapa", workflowId: PRESALE });
    expect(defaultGroupTarget("DISEÑO", null, catalog)).toEqual({ kind: "etapa", workflowId: DISENO });
    expect(defaultGroupTarget("Minutas", DISENO, catalog)).toEqual({ kind: "phase", phaseId: MINUTAS_D });
    expect(defaultGroupTarget("Cobro", DISENO, catalog)).toEqual({ kind: "phase", phaseId: COBRO });
    expect(defaultGroupTarget("Administrativo", DISENO, catalog)).toEqual({ kind: "admin" });
  });

  it("finds a fase named inside the title", () => {
    expect(defaultGroupTarget("Proyecto Ejecutivo", DISENO, catalog)).toEqual({ kind: "phase", phaseId: EJECUTIVO });
    expect(defaultGroupTarget("Proyecto Ejecutivo", PRESALE, catalog)).toEqual({ kind: "phase", phaseId: EJECUTIVO });
  });

  it("falls back to the board's etapa, else unresolved", () => {
    expect(defaultGroupTarget("Obra", DISENO, catalog)).toEqual({ kind: "etapa", workflowId: DISENO });
    expect(defaultGroupTarget("Obra", null, catalog)).toBeNull();
  });
});

describe("storedGroupTarget", () => {
  it("upgrades v1 kinds", () => {
    expect(storedGroupTarget({ kind: "stage", workflowId: CONSTRUCCION }, "Obra", DISENO, catalog)).toEqual({
      kind: "etapa",
      workflowId: CONSTRUCCION,
    });
    expect(storedGroupTarget({ kind: "workflow_phase", phase: "ejecutivo" }, "X", DISENO, catalog)).toEqual({
      kind: "phase",
      phaseId: EJECUTIVO,
    });
    expect(storedGroupTarget({ kind: "workflow_phase", phase: "Nada" }, "X", DISENO, catalog)).toEqual({
      kind: "etapa",
      workflowId: DISENO,
    });
    expect(storedGroupTarget({ kind: "phase" }, "Residencia", DISENO, catalog)).toEqual({
      kind: "phase",
      phaseId: RESIDENCIA,
    });
    expect(storedGroupTarget({ kind: "phase" }, "Otra cosa", DISENO, catalog)).toBeNull();
    expect(storedGroupTarget({ kind: "project" }, "X", DISENO, catalog)).toEqual({ kind: "project" });
  });

  it("keeps v2 targets that still exist", () => {
    expect(storedGroupTarget({ kind: "phase", phaseId: COBRO }, "X", DISENO, catalog)).toEqual({ kind: "phase", phaseId: COBRO });
    expect(storedGroupTarget({ kind: "phase", phaseId: "00000000-0000-4000-8000-0000000000ff" }, "X", DISENO, catalog)).toBeNull();
    expect(storedGroupTarget({ kind: "admin" }, "X", DISENO, catalog)).toEqual({ kind: "admin" });
    expect(storedGroupTarget(null, "X", DISENO, catalog)).toBeNull();
  });
});

describe("phaseInText", () => {
  const diseno = catalog.phases.filter((p) => p.workflowId === DISENO);
  it("matches whole words, accent-insensitive, longest first", () => {
    expect(phaseInText(diseno, "Revisión del proyecto arquitectonico")).toBe(PROY_ARQ);
    expect(phaseInText(diseno, "Minutas de obra")).toBe(MINUTAS_D);
    expect(phaseInText(diseno, "Ejecutivos")).toBeNull();
  });
});

describe("applyTargetOverrides", () => {
  it("overrides by group title on every board and reports unused ones", () => {
    const state = {
      project: { id: "p", name: "Madrid 22" },
      boards: [
        {
          boardId: "1",
          name: "Madrid 22",
          workflowId: DISENO,
          source: { groups: [{ id: "g_obra", title: "Obra" }] },
          groupTargets: { g_obra: { kind: "etapa", workflowId: DISENO } },
        },
        { boardId: "2", name: "Gone", workflowId: null, source: null, groupTargets: {} },
      ],
      choices: {},
    } as unknown as MondayRemapState;
    const input = currentRemapInput(state);
    expect(input.map((e) => e.boardId)).toEqual(["1"]);
    const out = applyTargetOverrides(
      state,
      input,
      [
        { group: "obra", spec: "etapa:construccion" },
        { group: "Pagos", spec: "admin" },
        { group: "Obra", spec: "etapa:nada" },
      ],
      catalog,
    );
    expect(out.input[0].groupTargets.g_obra).toEqual({ kind: "etapa", workflowId: CONSTRUCCION });
    expect(out.unused).toEqual(["Pagos"]);
    expect(out.errors).toHaveLength(1);
  });
});
