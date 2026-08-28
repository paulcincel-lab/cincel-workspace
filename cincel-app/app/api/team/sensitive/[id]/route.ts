import { type NextRequest, NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { teamMembers } from "@/lib/db/schema";
import { requireCapabilityUser } from "@/lib/auth/session";
import { isAdministratorRole } from "@/lib/data/roles";

/**
 * GET /api/team/sensitive/[id]
 *
 * Returns PII fields (CURP, RFC, address, home phone, personal email,
 * emergency contact, birth date, marital status, nationality) for a single
 * team member, gated behind the DB-backed session (Phase 3).
 *
 * This endpoint is the ONLY server-sanctioned way for the client to access
 * sensitive team member data. The static team mock (lib/data/team.ts) ships
 * with empty strings for these fields specifically to avoid PII leaking into
 * the public JS bundle.
 *
 * Authorization: caller must be a global admin (Administrador / Dirección per
 * lib/auth/permissions.ts). Project-scoped roles cannot access other members'
 * PII.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;

  let caller;
  try {
    caller = await requireCapabilityUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isAdministratorRole(caller.member.role) && caller.access !== "Dirección") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const legacyId = Number.parseInt(id, 10);
  if (Number.isNaN(legacyId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const [row] = await db
    .select({
      legacyId: teamMembers.legacyId,
      curp: teamMembers.curp,
      rfc: teamMembers.rfc,
      address: teamMembers.address,
      homePhone: teamMembers.homePhone,
      personalEmail: teamMembers.personalEmail,
      emergencyContact: teamMembers.emergencyContact,
      birthDate: teamMembers.birthDate,
      maritalStatus: teamMembers.maritalStatus,
      nationality: teamMembers.nationality,
    })
    .from(teamMembers)
    .where(and(eq(teamMembers.legacyId, legacyId), isNull(teamMembers.deletedAt)))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    legacy_id: row.legacyId,
    curp: row.curp ?? "",
    rfc: row.rfc ?? "",
    address: row.address ?? "",
    home_phone: row.homePhone ?? "",
    personal_email: row.personalEmail ?? "",
    emergency_contact: row.emergencyContact ?? null,
    birth_date: row.birthDate ?? "",
    marital_status: row.maritalStatus ?? "",
    nationality: row.nationality ?? "",
  });
}
