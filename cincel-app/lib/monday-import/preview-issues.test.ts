// @vitest-environment node
/** Vista previa problems in Spanish with the step that fixes them (#679). */
import { describe, expect, it } from "vitest";

import { ISSUE_FIX_STEP, issueText } from "@/lib/monday-import/preview-issues";
import { BLOCKING_CODES, WARNING_CODES, type PlanIssueCode } from "@/scripts/monday/plan";

/** English plan messages as scripts/monday/plan.ts and translate.ts write them. */
const PLAN_MESSAGES: [PlanIssueCode, string][] = [
  ["CLIENT_UNRESOLVED", 'Project "Casa Norte" has no client'],
  ["CLIENT_UNRESOLVED", "client: contact 00000000-0000-4000-8000-0000000000e5 does not exist"],
  ["CONTACT_NAME_TAKEN", 'A cliente named "Familia Mar" exists already; reuse it with contactMatches or rename it in monday'],
  ["CONTACT_NAME_TAKEN", '2 new cliente contacts are named "Familia Mar" (1, 2)'],
  ["PROJECT_NAME_TAKEN", 'The client already has a project named "Casa Nido"; set another name in projectNames'],
  ["PROJECT_NAME_TAKEN", '2 new projects of one client are named "Casa Nido" (901, 902); set projectNames'],
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
  ["MAPPING_INVALID", "areaId: area a1 does not exist"],
  ["MAPPING_INVALID", "contactMatches.11: contact c1 does not exist"],
  ["MAPPING_INVALID", "boards.0.client.name: Too small"],
  ["PERSON_UNMATCHED", "monday user 7 (Luis Pérez) has no staff match"],
  ["RELATION_MISSING", "Linked item 55 is not a contact in the export"],
  ["DATES_MISSING", '"Planos" has no timeline; left out of the cronograma'],
  ["FILE_MISSING", 'File 88 ("plano.pdf") is in files/index.json but /data/monday/run-1/files/88/plano.pdf is not on disk'],
  ["FILE_MISSING", 'File 89 ("foto.jpg") is not in files/index.json'],
];

describe("issueText", () => {
  it.each(PLAN_MESSAGES)("writes %s in Spanish without ids, paths or English", (code, message) => {
    const text = issueText(code, message);
    expect(text).not.toMatch(/\/data|files\/index\.json|00000000-|[a-z]+Id\b|contactMatches|projectNames/);
    expect(text).not.toMatch(/\b(has no|does not|exists already|is not|already has|the|and)\b/);
    expect(text.length).toBeGreaterThan(10);
  });

  it("keeps the monday names the message is about", () => {
    expect(issueText("CLIENT_UNRESOLVED", 'Project "Casa Norte" has no client')).toBe(
      "El proyecto «Casa Norte» no tiene cliente. Elige uno en Cliente.",
    );
    expect(issueText("PROJECT_NAME_TAKEN", PLAN_MESSAGES[4][1])).toContain("«Casa Nido»");
    expect(issueText("STATUS_UNMAPPED", PLAN_MESSAGES[8][1])).toContain("«Revisión»");
    expect(issueText("PERSON_UNMATCHED", PLAN_MESSAGES[19][1])).toContain("«Luis Pérez»");
    expect(issueText("FILE_MISSING", PLAN_MESSAGES[22][1])).toContain("«plano.pdf»");
  });

  it("tells a taken name from a repeated one", () => {
    expect(issueText("CONTACT_NAME_TAKEN", PLAN_MESSAGES[2][1])).toMatch(/^Ya existe/);
    expect(issueText("CONTACT_NAME_TAKEN", PLAN_MESSAGES[3][1])).toMatch(/^Varios/);
    expect(issueText("PROJECT_CODE_TAKEN", PLAN_MESSAGES[6][1])).toMatch(/^Otro proyecto/);
    expect(issueText("PROJECT_CODE_TAKEN", PLAN_MESSAGES[7][1])).toMatch(/se repite/);
  });
});

describe("ISSUE_FIX_STEP", () => {
  it("sends every plan code to a step of the wizard", () => {
    for (const code of [...BLOCKING_CODES, ...WARNING_CODES]) expect(ISSUE_FIX_STEP[code]).toBeTruthy();
  });

  it("fixes clients on Equivalencias, people on Personas and Drive on Opciones", () => {
    expect(ISSUE_FIX_STEP.CLIENT_UNRESOLVED).toBe("equivalencias");
    expect(ISSUE_FIX_STEP.PERSON_UNMATCHED).toBe("personas");
    expect(ISSUE_FIX_STEP.DRIVE_NOT_CONFIGURED).toBe("opciones");
  });
});
