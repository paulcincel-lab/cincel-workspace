import { type NextRequest, NextResponse } from "next/server";
import { getSupabaseServerUser } from "@/lib/supabase/server";
import { getDataSource } from "@/lib/supabase/data-source";

/**
 * GET /api/team/sensitive/[id]
 *
 * Returns PII fields (CURP, RFC, address, home phone, personal email,
 * emergency contact, birth date, marital status, nationality) for a single
 * team member, gated behind Supabase Auth session verification.
 *
 * This endpoint is the ONLY server-sanctioned way for the client to access
 * sensitive team member data. The static team mock (lib/data/team.ts) ships
 * with empty strings for these fields specifically to avoid PII leaking into
 * the public JS bundle.
 *
 * Authorization: caller must have role Administrador or Dirección (global
 * admin per lib/auth/permissions.ts). Project-scoped roles cannot access
 * other members' PII.
 *
 * NOTE: When data-source=localstorage (dev without Supabase credentials)
 * this endpoint returns 503 — PII management is a Supabase-mode feature.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;

  if (getDataSource() !== "supabase") {
    return NextResponse.json(
      { error: "PII access is only available in supabase data-source mode." },
      { status: 503 }
    );
  }

  const user = await getSupabaseServerUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { createSupabaseServerClient } = await import("@/lib/supabase/server");
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase client unavailable." },
      { status: 503 }
    );
  }

  // Verify caller is a global admin.
  const { data: callerRow } = await supabase
    .schema("core")
    .from("team_members")
    .select("role")
    .eq("institutional_email", user.email ?? "")
    .is("deleted_at", null)
    .single();

  const callerRole: string = (callerRow as { role?: string } | null)?.role ?? "";
  if (!["Administrador", "Dirección"].includes(callerRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const legacyId = parseInt(id, 10);
  if (isNaN(legacyId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const { data, error } = await supabase
    .schema("core")
    .from("team_members")
    .select(
      "legacy_id, curp, rfc, address, home_phone, personal_email, emergency_contact, birth_date, marital_status, nationality"
    )
    .eq("legacy_id", legacyId)
    .is("deleted_at", null)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(data);
}
