// @vitest-environment node
/** Vista previa problems in Spanish with the step that fixes them (#679), and the grouped warnings (FE §4.6 item 9). */
import { describe, expect, it } from "vitest";

import {
  groupPreviewWarnings,
  ISSUE_FIX_STEP,
  issuePersonId,
  issuePersonName,
  issueText,
} from "@/lib/monday-import/preview-issues";
import type { MondayPreviewIssue } from "@/lib/types/monday-import";
import { BLOCKING_CODES, WARNING_CODES, type PlanIssueCode } from "@/scripts/monday/plan";

/** English plan messages as scripts/monday/plan.ts and translate.ts write them. */
const PLAN_MESSAGES: [PlanIssueCode, string][] = [
  ["CLIENT_UNRESOLVED", "client: contact 00000000-0000-4000-8000-0000000000e5 does not exist"],
  ["CONTACT_NAME_TAKEN", 'A cliente named "Familia Mar" exists already; reuse it with contactMatches or rename it in monday'],
  ["CONTACT_NAME_TAKEN", '2 new cliente contacts are named "Familia Mar" (1, 2)'],
  ["PROJECT_NAME_TAKEN", 'An active project named "Casa Nido" exists already; set another name in projectNames'],
  ["PROJECT_NAME_TAKEN", '2 new projects are named "Casa Nido" (901, 902); set projectNames'],
  ["PROJECT_CODE_TAKEN", 'Project code "CN-01" is used by an existing project; change projectCode / projectCodes'],
  ["PROJECT_CODE_TAKEN", 'Project code "CN-01" repeats in 2 new projects (901, 902)'],
  ["STATUS_UNMAPPED", 'Status label 3 ("Revisión") of column status has no target'],
  ["STATUS_UNMAPPED", "Custom status 00000000-0000-4000-8000-0000000000c3 does not exist"],
  ["TEMPLATE_COLLISION", '"Muros" and "Muros 2" (12) match template t1 in one project'],
  ["TEMPLATE_INVALID", "Template t1 does not exist"],
  ["PROVIDER_SUBTYPE_MISSING", "proveedor contacts need a providerSubtype (material, mano_de_obra)"],
  ["SCHEDULE_EXISTS", "Project p1 already has a cronograma not created by this import; turn schedule off for it"],
  ["DRIVE_NOT_CONFIGURED", "GOOGLE_SHARED_DRIVE_ID is not set"],
  ["MAPPING_INVALID", "workflowId: workflow w1 does not exist"],
  ["MAPPING_INVALID", "groupTargets.g1: fase f1 does not exist"],
  ["MAPPING_INVALID", "contactMatches.11: contact c1 does not exist"],
  ["MAPPING_INVALID", "boards.0.client.name: Too small"],
  ["PERSON_UNMATCHED", "monday user 7 (Luis Pérez) has no staff match"],
  ["RELATION_MISSING", "Linked item 55 is not a contact in the export"],
  ["DATES_MISSING", '"Planos" has no timeline; left out of the cronograma'],
  ["FILE_MISSING", 'File 88 ("plano.pdf") is in files/index.json but /data/monday/run-1/files/88/plano.pdf is not on disk'],
  ["FILE_MISSING", 'File 89 ("foto.jpg") is not in files/index.json'],
  ["STATUS_DEFAULTED", 'Status label 5 ("Urgente") of column status has no equivalent; defaulted to pendiente'],
  ["TRAMO_MISSING", "3 tasks of board 901 resolve no etapa; choose the board's etapa or a etapa for the group"],
  ["PHASE_UNRESOLVED", '"Muros" matches no fase; it imports without one for review'],
  ["CLIENT_MISSING", 'Project "Casa Norte" has no client; it gets the task "Asignar cliente y origen"'],
  ["ADMIN_ASSIGNEE_CLEARED", "Admin task: Luis Pérez removed (not administrators)"],
];

const messageOf = (code: PlanIssueCode, index = 0) => PLAN_MESSAGES.filter(([c]) => c === code)[index][1];

describe("issueText", () => {
  it.each(PLAN_MESSAGES)("writes %s in Spanish without ids, paths or English", (code, message) => {
    const text = issueText(code, message);
    expect(text).not.toMatch(/\/data|files\/index\.json|00000000-|[a-z]+Id\b|contactMatches|projectNames/);
    expect(text).not.toMatch(/\b(has no|does not|exists already|is not|already has|the|and)\b/);
    expect(text.length).toBeGreaterThan(10);
  });

  it("keeps the monday names the message is about", () => {
    expect(issueText("CLIENT_MISSING", messageOf("CLIENT_MISSING"))).toBe(
      "El proyecto «Casa Norte» no tiene cliente; se crea con la tarea de administración «Asignar cliente y origen».",
    );
    expect(issueText("PHASE_UNRESOLVED", messageOf("PHASE_UNRESOLVED"))).toBe(
      "«Muros» no coincide con ninguna fase; se importa sin fase para revisarla.",
    );
    expect(issueText("PROJECT_NAME_TAKEN", messageOf("PROJECT_NAME_TAKEN"))).toContain("«Casa Nido»");
    expect(issueText("STATUS_UNMAPPED", messageOf("STATUS_UNMAPPED"))).toContain("«Revisión»");
    expect(issueText("PERSON_UNMATCHED", messageOf("PERSON_UNMATCHED"))).toContain("«Luis Pérez»");
    expect(issueText("FILE_MISSING", messageOf("FILE_MISSING"))).toContain("«plano.pdf»");
    expect(issueText("STATUS_DEFAULTED", messageOf("STATUS_DEFAULTED"))).toBe(
      "La etiqueta de estatus «Urgente» no tiene equivalente; sus tareas quedan como Pendiente. Revísala en Estatus.",
    );
  });

  it("tells a taken name from a repeated one", () => {
    expect(issueText("CONTACT_NAME_TAKEN", messageOf("CONTACT_NAME_TAKEN"))).toMatch(/^Ya existe/);
    expect(issueText("CONTACT_NAME_TAKEN", messageOf("CONTACT_NAME_TAKEN", 1))).toMatch(/^Varios/);
    expect(issueText("PROJECT_NAME_TAKEN", messageOf("PROJECT_NAME_TAKEN"))).toMatch(/^Ya hay un proyecto activo/);
    expect(issueText("PROJECT_NAME_TAKEN", messageOf("PROJECT_NAME_TAKEN", 1))).toMatch(/^Varios/);
    expect(issueText("PROJECT_CODE_TAKEN", messageOf("PROJECT_CODE_TAKEN"))).toMatch(/^Otro proyecto/);
    expect(issueText("PROJECT_CODE_TAKEN", messageOf("PROJECT_CODE_TAKEN", 1))).toMatch(/se repite/);
  });
});

describe("ISSUE_FIX_STEP", () => {
  it("sends every plan code to a step of the wizard", () => {
    for (const code of [...BLOCKING_CODES, ...WARNING_CODES]) expect(ISSUE_FIX_STEP[code]).toBeTruthy();
  });

  it("fixes clients on Equivalencias, people on Personas and Drive on Opciones", () => {
    expect(ISSUE_FIX_STEP.CLIENT_UNRESOLVED).toBe("equivalencias");
    expect(ISSUE_FIX_STEP.TRAMO_MISSING).toBe("equivalencias");
    expect(ISSUE_FIX_STEP.PHASE_UNRESOLVED).toBe("equivalencias");
    expect(ISSUE_FIX_STEP.PERSON_UNMATCHED).toBe("personas");
    expect(ISSUE_FIX_STEP.DRIVE_NOT_CONFIGURED).toBe("opciones");
  });

  it("reads the monday user of an unmatched person, for its Personas link and Crear integrante (#689)", () => {
    const message = "monday user 7 (Luis Pérez (Obra)) has no staff match";
    expect(issuePersonId("PERSON_UNMATCHED", message)).toBe("7");
    expect(issuePersonName("PERSON_UNMATCHED", message)).toBe("Luis Pérez (Obra)");
    expect(issuePersonName("PERSON_UNMATCHED", "monday user 8 (?) has no staff match")).toBeNull();
    expect(issuePersonId("RELATION_MISSING", message)).toBeNull();
  });
});

describe("groupPreviewWarnings", () => {
  const issue = (code: PlanIssueCode, blocking = false, message = `texto ${code}`): MondayPreviewIssue => ({
    code,
    blocking,
    boardId: "901",
    itemId: null,
    boardName: "Casa Nido",
    itemName: null,
    message,
    fixStep: ISSUE_FIX_STEP[code],
  });

  it("groups warnings by code with a counted title, leaving blocking issues out", () => {
    const groups = groupPreviewWarnings([
      issue("PHASE_UNRESOLVED"),
      issue("TRAMO_MISSING", true),
      issue("PERSON_UNMATCHED"),
      issue("PHASE_UNRESOLVED"),
      issue("CLIENT_MISSING"),
      issue("ADMIN_ASSIGNEE_CLEARED"),
      issue("STATUS_DEFAULTED"),
      issue("DATES_MISSING"),
      issue("RELATION_MISSING", false, "Un elemento vinculado no está en la exportación; ese vínculo no se importa."),
    ]);
    expect(groups.map((g) => [g.code, g.title, g.issues.length])).toEqual([
      ["PHASE_UNRESOLVED", "Tareas sin fase (2)", 2],
      ["PERSON_UNMATCHED", "Personas sin equivalente (1)", 1],
      ["CLIENT_MISSING", "Proyectos sin cliente (1)", 1],
      ["ADMIN_ASSIGNEE_CLEARED", "Tareas de administración sin responsable (1)", 1],
      ["STATUS_DEFAULTED", "Estatus sin equivalente (1)", 1],
      ["DATES_MISSING", "Elementos sin línea de tiempo (1)", 1],
      ["RELATION_MISSING", "Un elemento vinculado no está en la exportación; ese vínculo no se importa.", 1],
    ]);
  });
});
