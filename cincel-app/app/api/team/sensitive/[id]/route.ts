import { type NextRequest, NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { staff, staffProfiles } from "@/lib/db/schema";
import { requireCapabilityUser } from "@/lib/auth/session";
import { canViewSensitiveStaffData } from "@/lib/auth/permissions";

/**
 * GET /api/team/sensitive/[id]
 *
 * Returns PII fields (CURP, RFC, address, home phone, personal email,
 * emergency contact, birth date, marital status, nationality) for a single
 * staff member, gated behind the DB-backed session.
 *
 * This endpoint is the ONLY server-sanctioned way for the client to access
 * sensitive staff data. The public team data ships without these fields
 * specifically to avoid PII leaking into the public JS bundle.
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

  if (!canViewSensitiveStaffData(caller)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [row] = await db
    .select({
      staffId: staff.id,
      curp: staffProfiles.curp,
      rfc: staffProfiles.rfc,
      address: staffProfiles.address,
      homePhone: staffProfiles.homePhone,
      personalEmail: staffProfiles.personalEmail,
      emergencyContactName: staffProfiles.emergencyContactName,
      emergencyContactRelation: staffProfiles.emergencyContactRelation,
      emergencyContactPhone: staffProfiles.emergencyContactPhone,
      emergencyContactAddress: staffProfiles.emergencyContactAddress,
      birthDate: staffProfiles.birthDate,
      maritalStatus: staffProfiles.maritalStatus,
      nationality: staffProfiles.nationality,
    })
    .from(staff)
    .leftJoin(staffProfiles, eq(staffProfiles.staffId, staff.id))
    .where(and(eq(staff.id, id), isNull(staff.deletedAt)))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: row.staffId,
    curp: row.curp ?? "",
    rfc: row.rfc ?? "",
    address: row.address ?? "",
    home_phone: row.homePhone ?? "",
    personal_email: row.personalEmail ?? "",
    emergency_contact: row.emergencyContactName
      ? {
          name: row.emergencyContactName ?? "",
          relation: row.emergencyContactRelation ?? "",
          phone: row.emergencyContactPhone ?? "",
          address: row.emergencyContactAddress ?? "",
        }
      : null,
    birth_date: row.birthDate ?? "",
    marital_status: row.maritalStatus ?? "",
    nationality: row.nationality ?? "",
  });
}
