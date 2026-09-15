import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/repositories/browser-state-repository", () => ({
  readStorage: vi.fn().mockReturnValue(null),
  writeStorage: vi.fn(),
}));

vi.mock("@/lib/utils/export-service", () => ({
  exportTableData: vi.fn().mockResolvedValue(undefined),
}));

import { exportTableData } from "@/lib/utils/export-service";
import { canExportStaff, exportStaffAction, staffExportColumns } from "@/lib/equipo/staff-export";
import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import type { Staff } from "@/lib/types/core";

function makeUser(access: AuthenticatedUser["access"]): AuthenticatedUser {
  return {
    member: {
      id: "s1",
      name: "Test",
      role: "Colaborador",
      area: "General",
      capacity: 0,
      availability: "",
      active: true,
      institutionalEmail: "test@cincel.mx",
      phone: "",
    },
    email: "test@cincel.mx",
    access,
  };
}

const sampleStaff: Staff[] = [
  {
    id: "s1",
    kind: "empleado",
    name: "Ana",
    phone: null,
    email: "ana@cincel.mx",
    role: "Arquitecta",
    capacity: 8,
    availability: "Disponible",
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

describe("canExportStaff", () => {
  it("allows Administrador", () => {
    expect(canExportStaff(makeUser("Administrador"))).toBe(true);
  });

  it("denies Colaborador", () => {
    expect(canExportStaff(makeUser("Colaborador"))).toBe(false);
  });

  it("denies a null user", () => {
    expect(canExportStaff(null)).toBe(false);
  });
});

describe("exportStaffAction", () => {
  beforeEach(() => {
    vi.mocked(exportTableData).mockClear();
  });

  it("calls exportTableData when the caller can export", async () => {
    await exportStaffAction(sampleStaff, "xlsx", {
      user: makeUser("Administrador"),
      companyName: "Cincel",
    });
    expect(exportTableData).toHaveBeenCalledWith(
      expect.objectContaining({ format: "xlsx", companyName: "Cincel", rows: sampleStaff, columns: staffExportColumns })
    );
  });

  it("throws and does not export when the caller lacks the capability", async () => {
    await expect(
      exportStaffAction(sampleStaff, "xlsx", { user: makeUser("Colaborador"), companyName: "Cincel" })
    ).rejects.toThrow("FORBIDDEN");
    expect(exportTableData).not.toHaveBeenCalled();
  });
});
