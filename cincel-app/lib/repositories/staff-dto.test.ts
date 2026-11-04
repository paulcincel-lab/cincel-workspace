// @vitest-environment node
/**
 * The staff list DTO carries the Google fields Equipo needs (BE §A.7):
 * `googleManaged` from `google_sub`, plus last sign-in and revocation.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({ db: {} }));

import type { staff } from "@/lib/db/schema";

import { toStaff } from "./staff-repository";

type StaffRow = typeof staff.$inferSelect;

const base: StaffRow = {
  id: "s1",
  kind: "empleado",
  name: "Ana",
  lastName: null,
  phone: null,
  email: "ana@cincel.example",
  role: "Arquitecto Senior",
  capacity: 0,
  availability: null,
  active: true,
  sortOrder: null,
  googleSub: null,
  accessCheckedAt: null,
  accessRevokedAt: null,
  accessRevokedReason: null,
  lastLoginAt: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  deletedAt: null,
} as StaffRow;

describe("toStaff", () => {
  it("marks password staff as not Google-managed with empty Google fields", () => {
    expect(toStaff(base)).toMatchObject({
      googleManaged: false,
      lastLoginAt: null,
      accessRevokedAt: null,
      accessRevokedReason: null,
    });
  });

  it("exposes the Google fields for Google-managed staff", () => {
    const dto = toStaff({
      ...base,
      googleSub: "1234567890",
      lastLoginAt: new Date("2026-11-02T15:00:00.000Z"),
      accessRevokedAt: new Date("2026-11-03T10:00:00.000Z"),
      accessRevokedReason: "suspended",
    });
    expect(dto).toMatchObject({
      googleManaged: true,
      lastLoginAt: "2026-11-02T15:00:00.000Z",
      accessRevokedAt: "2026-11-03T10:00:00.000Z",
      accessRevokedReason: "suspended",
    });
  });
});
