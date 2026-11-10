// @vitest-environment node
/**
 * Portal DTO allow-list (Query Migration Phase 11, plan §4.8 rule 2). The portal loaders' results are
 * dehydrated into public page HTML, so each mapper must emit exactly the allowed keys, whatever extra columns
 * a query hands it: no payments, no staff emails other than the project manager's, no internal notes.
 */
import { describe, expect, it } from "vitest";

import type { DriveFile } from "@/lib/google/drive-admin";

import {
  markPortalClientUploads,
  PORTAL_DTO_ALLOWED_KEYS,
  toPortalProjectDTO,
  toPortalScheduleDTO,
  toPortalFolderGroupDTO,
  toPortalTeamMemberDTO,
  toPortalTramosDTO,
  type PortalProjectRow,
  type PortalScheduleTaskRow,
  type PortalTeamRow,
  type PortalTramoProgressRow,
  type PortalTramoRow,
} from "./dto";
import { toPortalFileDTO } from "./files";

/** Values a careless query could carry along; none may reach a DTO. */
const LEAKS = {
  coordinatorEmail: "coordinador@cincel.example",
  internalNotes: "Nota interna: cliente moroso",
  paymentAmountMxn: "250000.00",
  paidAt: "2026-03-01",
  tarea: "Tarea interna",
  responsable: "Responsable interno",
  driveInternalFolderId: "drive-internal",
  webViewLink: "https://drive.example/secret",
  owners: [{ emailAddress: "owner@cincel.example" }],
};

function sortedKeys(value: object): string[] {
  return Object.keys(value).sort();
}

const projectRow = {
  id: "p1",
  name: "Casa Madrid 22",
  code: "MAD-22",
  addressStreet: "Madrid 22",
  addressCity: "CDMX",
  addressState: null,
  status: "activo",
  progress: 40,
  startDate: "2026-01-05",
  endDate: "2026-09-30",
  managerName: "Laura",
  managerLastName: "Pérez",
  managerEmail: "laura@cincel.example",
  ...LEAKS,
} as PortalProjectRow;

const taskRow = {
  planta: "Planta baja",
  seccion: "Preliminares",
  seccionOrder: 1,
  sortOrder: 1,
  inicio: "2026-02-02",
  fin: "2026-02-06",
  status: "done",
  ...LEAKS,
} as PortalScheduleTaskRow;

const tramoRow = {
  id: "w1",
  key: "diseno",
  name: "Diseño",
  active: true,
  sortOrder: 1,
  startedAt: "2026-01-10",
  closedAt: null,
  ...LEAKS,
} as PortalTramoRow;

const driveFile = {
  id: "f1",
  name: "Plano.pdf",
  mimeType: "application/pdf",
  size: "2048",
  modifiedTime: "2026-10-01T12:00:00.000Z",
  ...LEAKS,
} as unknown as DriveFile;

function expectNoLeak(dto: unknown) {
  const json = JSON.stringify(dto);
  for (const value of Object.values(LEAKS)) expect(json).not.toContain(JSON.stringify(value).replace(/^"|"$/g, ""));
}

describe("portal DTO allow-list", () => {
  it("toPortalProjectDTO emits exactly the allowed keys", () => {
    const dto = toPortalProjectDTO(projectRow);
    expect(sortedKeys(dto)).toEqual([...PORTAL_DTO_ALLOWED_KEYS.project]);
    expect(sortedKeys(dto.manager!)).toEqual([...PORTAL_DTO_ALLOWED_KEYS.projectManager]);
    expectNoLeak(dto);
  });

  it("toPortalScheduleDTO emits exactly the allowed keys", () => {
    const dto = toPortalScheduleDTO([taskRow]);
    expect(sortedKeys(dto!)).toEqual([...PORTAL_DTO_ALLOWED_KEYS.schedule]);
    expect(sortedKeys(dto!.sections[0])).toEqual([...PORTAL_DTO_ALLOWED_KEYS.scheduleSection]);
    expectNoLeak(dto);
  });

  it("toPortalTramosDTO emits exactly the allowed keys", () => {
    const [dto] = toPortalTramosDTO([tramoRow], null);
    expect(sortedKeys(dto)).toEqual([...PORTAL_DTO_ALLOWED_KEYS.tramo]);
    expectNoLeak(dto);
  });

  it("toPortalTramosDTO emits progressPct and startMonth only", () => {
    const progress = { workflowId: "w1", total: 8, done: 5, title: "Tarea interna", responsable: "Responsable interno" };
    const [dto] = toPortalTramosDTO([tramoRow], null, [progress as PortalTramoProgressRow]);
    expect(dto).toEqual({ key: "diseno", name: "Diseño", state: "en_curso", progressPct: 63, startMonth: "2026-01" });
    expect(sortedKeys(dto)).toEqual(["key", "name", "progressPct", "startMonth", "state"]);
    expectNoLeak(dto);
  });

  it("team member emits name, role, email", () => {
    const row = { name: "Laura", lastName: "Pérez", role: "Diseñadora líder", email: "laura@cincel.example",
      staffId: "s-1", phone: "55 0000 0000", capacity: 40, ...LEAKS } as PortalTeamRow;
    const dto = toPortalTeamMemberDTO(row);
    expect(sortedKeys(dto)).toEqual([...PORTAL_DTO_ALLOWED_KEYS.teamMember]);
    expect(dto).toEqual({ name: "Laura Pérez", role: "Diseñadora líder", email: "laura@cincel.example" });
    expectNoLeak(dto);
  });

  it("folder group emits files, folderId, name", () => {
    const file = toPortalFileDTO(driveFile)!;
    const dto = toPortalFolderGroupDTO({ folderId: "d1", name: "Planos", files: [file], ...LEAKS } as never);
    expect(sortedKeys(dto)).toEqual([...PORTAL_DTO_ALLOWED_KEYS.folderGroup]);
    expect(sortedKeys(dto.files[0])).toEqual(PORTAL_DTO_ALLOWED_KEYS.file.filter((key) => key !== "uploadedBy"));
    expectNoLeak(dto);
  });

  it("the files DTO emits exactly the allowed keys", () => {
    const dto = toPortalFileDTO(driveFile);
    expect(sortedKeys(dto!)).toEqual(PORTAL_DTO_ALLOWED_KEYS.file.filter((key) => key !== "uploadedBy"));
    expectNoLeak(dto);
  });

  it("file emits uploadedBy only after the change", () => {
    const listed = toPortalFileDTO(driveFile)!;
    expect(listed).not.toHaveProperty("uploadedBy");
    const [mine, theirs] = markPortalClientUploads(
      [{ ...listed, ...LEAKS } as typeof listed, { ...listed, id: "f2" }],
      new Set(["f1"]),
    );
    expect(sortedKeys(mine)).toEqual([...PORTAL_DTO_ALLOWED_KEYS.file]);
    expect(mine.uploadedBy).toBe("cliente");
    expect(theirs.uploadedBy).toBe("cincel");
    expectNoLeak([mine, theirs]);
  });

  it("pins the allow-list itself", () => {
    expect(PORTAL_DTO_ALLOWED_KEYS).toEqual({
      project: ["address", "code", "endDate", "id", "manager", "name", "progressPct", "startDate", "status"],
      projectManager: ["email", "name"],
      schedule: ["sections"],
      scheduleSection: ["end", "key", "planta", "progressPct", "seccion", "start"],
      tramo: ["key", "name", "progressPct", "startMonth", "state"],
      file: ["deliveredAs", "id", "kind", "mimeType", "modifiedAt", "name", "sizeBytes", "uploadedBy"],
      folderGroup: ["files", "folderId", "name"],
      teamMember: ["email", "name", "role"],
    });
  });
});
