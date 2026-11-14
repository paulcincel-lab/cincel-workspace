/**
 * GET /api/soporte/adjuntos/[id] (#1112): the bytes of a solicitud attachment,
 * for its author or a `canManageSupport` user. Anyone else, a missing id and a
 * disabled feature all get the same 404; 401 without a session.
 */
import { type NextRequest, NextResponse } from "next/server";

import { canManageSupport } from "@/lib/auth/permissions";
import { getSessionAccess, requireCapabilityUser } from "@/lib/auth/session";
import { readTicketAttachment } from "@/lib/soporte/attachments";
import { SOPORTE_ENABLED } from "@/lib/soporte/flags";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function notFound(): NextResponse {
  return NextResponse.json({ error: "NOT_FOUND" }, { status: 404, headers: { "Cache-Control": "private, no-store" } });
}

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const access = await getSessionAccess();
  if (!access.user) {
    return access.status === "no_system_access"
      ? NextResponse.json({ error: "FORBIDDEN" }, { status: 403 })
      : NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }
  if (!SOPORTE_ENABLED) return notFound();

  const { id } = await context.params;
  if (!UUID.test(id)) return notFound();

  const user = await requireCapabilityUser();
  const file = await readTicketAttachment({ staffId: user.member.id, canManageSupport: canManageSupport(user) }, id);
  if (!file) return notFound();

  const bytes = Buffer.from(file.bytes);
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": file.mime,
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      "Cache-Control": "private, max-age=3600",
      Vary: "Cookie",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
