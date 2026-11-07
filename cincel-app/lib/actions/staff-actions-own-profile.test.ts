// @vitest-environment node
/**
 * Ajustes › Perfil (redesign FE §3.8): everyone saves their own nombre,
 * teléfono and firma de correo through the existing staff actions; anything
 * else, or anyone else's record, still needs `canEditCollaborator`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const SELF = "00000000-0000-4000-8000-0000000000c1";
const OTHER = "00000000-0000-4000-8000-0000000000c2";

const { revalidatePath, caps, staffRepo } = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  caps: { canEditCollaborator: false },
  staffRepo: {
    getStaffRoleLock: vi.fn(async () => ({ role: "Arquitecto", googleManaged: false })),
    updateStaff: vi.fn(async (id: string, patch: Record<string, unknown>) => ({ id, ...patch })),
    upsertStaffProfile: vi.fn(async () => ({ emailSignature: null })),
    setStaffEmailSignature: vi.fn(async (_id: string, signature: string | null) => ({ emailSignature: signature })),
  },
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/auth/session", () => ({
  requireCapabilityUser: vi.fn(async () => ({
    member: { id: SELF, name: "Ana", role: "Arquitecto", area: "", capacity: 0, availability: "", active: true, institutionalEmail: "", phone: "" },
    email: "ana@cincel.example",
    access: "Arquitecto",
  })),
}));
vi.mock("@/lib/auth/permissions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/permissions")>()),
  resolveTeamCapabilities: () => ({
    canViewTeam: true,
    canCreateCollaborator: false,
    canEditCollaborator: caps.canEditCollaborator,
    canChangeCollaboratorAccess: false,
    canToggleCollaboratorActive: false,
    canDeleteCollaborator: false,
    canExportData: false,
  }),
}));
vi.mock("@/lib/repositories/staff-repository", () => staffRepo);
vi.mock("@/lib/repositories/positions-repository", () => ({}));

import { updateStaffAction, upsertStaffProfileAction } from "./staff-actions";

beforeEach(() => {
  vi.clearAllMocks();
  caps.canEditCollaborator = false;
});

describe("updateStaffAction (own profile)", () => {
  it("saves the caller's own nombre and teléfono without canEditCollaborator", async () => {
    await updateStaffAction(SELF, { name: "Ana María", phone: "5512345678" });
    expect(staffRepo.updateStaff).toHaveBeenCalledWith(SELF, { name: "Ana María", phone: "5512345678" }, SELF);
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("refuses other fields of the caller's own record", async () => {
    await expect(updateStaffAction(SELF, { name: "Ana", role: "Dirección" })).rejects.toThrow("FORBIDDEN");
    await expect(updateStaffAction(SELF, { email: "otra@cincel.example" })).rejects.toThrow("FORBIDDEN");
    await expect(updateStaffAction(SELF, { active: false })).rejects.toThrow("FORBIDDEN");
    expect(staffRepo.updateStaff).not.toHaveBeenCalled();
  });

  it("refuses someone else's record", async () => {
    await expect(updateStaffAction(OTHER, { name: "Otro" })).rejects.toThrow("FORBIDDEN");
    expect(staffRepo.updateStaff).not.toHaveBeenCalled();
  });

  it("rejects an empty or too long name and a too long phone", async () => {
    await expect(updateStaffAction(SELF, { name: "   " })).rejects.toThrow("INVALID");
    await expect(updateStaffAction(SELF, { name: "a".repeat(121) })).rejects.toThrow("INVALID");
    await expect(updateStaffAction(SELF, { phone: "1".repeat(41) })).rejects.toThrow("INVALID");
    expect(staffRepo.updateStaff).not.toHaveBeenCalled();
  });

  it("keeps the Equipo path for editors", async () => {
    caps.canEditCollaborator = true;
    await updateStaffAction(OTHER, { name: "Otro", role: "Dirección" });
    expect(staffRepo.updateStaff).toHaveBeenCalledWith(OTHER, { name: "Otro", role: "Dirección" }, SELF);
  });
});

describe("upsertStaffProfileAction (own firma de correo)", () => {
  it("saves only the caller's signature without canEditCollaborator", async () => {
    await expect(upsertStaffProfileAction(SELF, { emailSignature: "Ana\nCincel" })).resolves.toEqual({ emailSignature: "Ana\nCincel" });
    expect(staffRepo.setStaffEmailSignature).toHaveBeenCalledWith(SELF, "Ana\nCincel");
    expect(staffRepo.upsertStaffProfile).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/ajustes/perfil");
  });

  it("clears the signature with null", async () => {
    await upsertStaffProfileAction(SELF, { emailSignature: null });
    expect(staffRepo.setStaffEmailSignature).toHaveBeenCalledWith(SELF, null);
  });

  it("rejects a signature over 2000 characters", async () => {
    await expect(upsertStaffProfileAction(SELF, { emailSignature: "a".repeat(2001) })).rejects.toThrow("INVALID");
    expect(staffRepo.setStaffEmailSignature).not.toHaveBeenCalled();
  });

  it("refuses other profile fields and other people's signature", async () => {
    await expect(upsertStaffProfileAction(SELF, { emailSignature: "x", curp: "ABC" })).rejects.toThrow("FORBIDDEN");
    await expect(upsertStaffProfileAction(OTHER, { emailSignature: "x" })).rejects.toThrow("FORBIDDEN");
    expect(staffRepo.setStaffEmailSignature).not.toHaveBeenCalled();
    expect(staffRepo.upsertStaffProfile).not.toHaveBeenCalled();
  });
});
