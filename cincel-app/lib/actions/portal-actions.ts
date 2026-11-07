"use server";

import { revalidatePath } from "next/cache";

import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { resolvePortalCapabilities, type PortalCapabilities } from "@/lib/auth/permissions";
import { getAppOrigin } from "@/lib/auth/safe-return-to";
import { driveWebViewLink } from "@/lib/google/drive-url";
import { requireCapabilityUser } from "@/lib/auth/session";
import { sendMail } from "@/lib/email";
import { invitacionEmail } from "@/lib/email/templates";
import * as portalRepository from "@/lib/repositories/portal-access-repository";
import type {
  InvitePortalClientInput,
  InvitePortalClientResult,
  PortalAccessRow,
  PortalActivityRow,
  PortalMutationResult,
  ResendPortalInviteResult,
} from "@/lib/types/portal";

/**
 * Clientes tab (BE §B.4.1, §B.4.8): invite, resend, revoke, disable / enable
 * and the access and activity lists. Errors are codes; the frontend maps them
 * to Spanish copy. Invite, resend and revoke need `portal.manageAccess`;
 * disable and enable need `portal.disableUsers`. Every mutation writes a
 * `portal_audit_events` row.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESEND_LIMIT_PER_HOUR = 3;
const HOUR_MS = 60 * 60 * 1000;
const CLIENTES_PATH = "/proyectos/[id]/clientes";

const isUuid = (value: unknown): value is string => typeof value === "string" && UUID_RE.test(value);

type Actor = { user: AuthenticatedUser; capabilities: PortalCapabilities };

/** The staff member and their portal capabilities, or null without a usable staff session. */
async function getActor(): Promise<Actor | null> {
  let user: AuthenticatedUser;
  try {
    user = await requireCapabilityUser();
  } catch (error) {
    // Only "no session" / "no system access"; redirects (revoked staff) must propagate.
    if (error instanceof Error && (error.message === "UNAUTHENTICATED" || error.message === "FORBIDDEN")) return null;
    throw error;
  }
  return { user, capabilities: resolvePortalCapabilities(user) };
}

async function requireManageAccess(): Promise<Actor | null> {
  const actor = await getActor();
  return actor?.capabilities.manageAccess ? actor : null;
}

async function requireDisableUsers(): Promise<Actor | null> {
  const actor = await getActor();
  return actor?.capabilities.disableUsers ? actor : null;
}

/** Whether a lowercased email is on `GOOGLE_WORKSPACE_DOMAIN` (staff can't be portal clients). */
function isStaffDomainEmail(email: string): boolean {
  const workspace = process.env.GOOGLE_WORKSPACE_DOMAIN?.trim().toLowerCase();
  if (!workspace) return false;
  return email.endsWith(`@${workspace}`);
}

async function sendInvite(to: string, staffName: string, projectName: string): Promise<boolean> {
  const appOrigin = getAppOrigin();
  if (!appOrigin) {
    console.error("[portal] APP_ORIGIN is not set; the invitation email was not sent");
    return false;
  }
  const mail = invitacionEmail({ staffName, projectName, appOrigin });
  const result = await sendMail({ to, ...mail });
  return result.sent;
}

function revalidateClientes(): void {
  revalidatePath(CLIENTES_PATH, "page");
}

export async function invitePortalClientAction(input: InvitePortalClientInput): Promise<InvitePortalClientResult> {
  const actor = await requireManageAccess();
  if (!actor) return { ok: false, error: "forbidden" };
  if (!input || typeof input !== "object") return { ok: false, error: "not_found" };

  const { projectId, contactId } = input;
  if (!isUuid(projectId) || !isUuid(contactId)) return { ok: false, error: "not_found" };

  const project = await portalRepository.findProject(projectId);
  if (!project) return { ok: false, error: "not_found" };
  // Project flow: a project can exist before its client is assigned; nobody is invited until then.
  if (project.clientId === null) return { ok: false, error: "no_client" };

  const contact = await portalRepository.findContact(contactId);
  if (!contact || contact.type === "proveedor") return { ok: false, error: "not_project_contact" };
  if (!(await portalRepository.isContactOnProject(project, contact.id))) return { ok: false, error: "not_project_contact" };
  if (contact.type === "socio" && input.confirmSocio !== true) return { ok: false, error: "socio_unconfirmed" };

  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  if (!EMAIL_RE.test(email)) return { ok: false, error: "invalid_email" };
  if (isStaffDomainEmail(email)) return { ok: false, error: "staff_domain" };

  const name = (typeof input.name === "string" ? input.name.trim() : "") || contact.name;

  const outcome = await portalRepository.invitePortalUser({
    projectId: project.id,
    contactId: contact.id,
    email,
    name,
    staffId: actor.user.member.id,
  });
  if (outcome.status === "disabled") return { ok: false, error: "disabled" };
  if (outcome.status === "already_active") return { ok: false, error: "already_active" };

  revalidateClientes();
  // A failed send doesn't roll back the invite: the UI offers "Reenviar invitación".
  const emailSent = await sendInvite(email, actor.user.member.name, project.name);
  return { ok: true, emailSent };
}

export async function resendPortalInviteAction(portalUserId: string, projectId: string): Promise<ResendPortalInviteResult> {
  const actor = await requireManageAccess();
  if (!actor) return { ok: false, error: "forbidden" };
  if (!isUuid(portalUserId) || !isUuid(projectId)) return { ok: false, error: "not_found" };

  const access = await portalRepository.findActiveAccess(portalUserId, projectId);
  if (!access || access.status === "disabled") return { ok: false, error: "not_found" };

  const since = new Date(Date.now() - HOUR_MS);
  const recent = await portalRepository.countAuditEventsSince(portalUserId, "resend", since);
  if (recent >= RESEND_LIMIT_PER_HOUR) return { ok: false, error: "rate_limited" };

  await portalRepository.recordAuditEvent({ kind: "resend", portalUserId, projectId, staffId: actor.user.member.id });
  const emailSent = await sendInvite(access.email, actor.user.member.name, access.projectName);
  return { ok: true, emailSent };
}

/** Quitar acceso: the project disappears on the client's next request (BE §B.4.8). */
export async function revokePortalAccessAction(accessId: string): Promise<PortalMutationResult> {
  const actor = await requireManageAccess();
  if (!actor) return { ok: false, error: "forbidden" };
  if (!isUuid(accessId)) return { ok: false, error: "not_found" };

  const revoked = await portalRepository.revokeAccess(accessId, actor.user.member.id);
  if (!revoked) return { ok: false, error: "not_found" };

  revalidateClientes();
  return { ok: true };
}

/** Deshabilitar: signs the client out everywhere and stops new sign-in links (BE §B.4.8). */
export async function disablePortalUserAction(portalUserId: string): Promise<PortalMutationResult> {
  const actor = await requireDisableUsers();
  if (!actor) return { ok: false, error: "forbidden" };
  if (!isUuid(portalUserId)) return { ok: false, error: "not_found" };

  if (!(await portalRepository.disablePortalUser(portalUserId, actor.user.member.id))) {
    return { ok: false, error: "not_found" };
  }
  revalidateClientes();
  return { ok: true };
}

/** Habilitar: back to `active` (or `invited` if never signed in); revoked projects stay revoked. */
export async function enablePortalUserAction(portalUserId: string): Promise<PortalMutationResult> {
  const actor = await requireDisableUsers();
  if (!actor) return { ok: false, error: "forbidden" };
  if (!isUuid(portalUserId)) return { ok: false, error: "not_found" };

  if (!(await portalRepository.enablePortalUser(portalUserId, actor.user.member.id))) {
    return { ok: false, error: "not_found" };
  }
  revalidateClientes();
  return { ok: true };
}

/** Every access row of the project, revoked ones included. Empty without `portal.manageAccess`. */
export async function listProjectPortalAccessAction(projectId: string): Promise<PortalAccessRow[]> {
  if (!(await requireManageAccess()) || !isUuid(projectId)) return [];
  return portalRepository.listProjectAccess(projectId);
}

/** The last 50 client file events of the project. Empty without `portal.manageAccess`. */
export async function listProjectPortalActivityAction(projectId: string): Promise<PortalActivityRow[]> {
  if (!(await requireManageAccess()) || !isUuid(projectId)) return [];
  return portalRepository.listProjectActivity(projectId);
}

/** Drive link of the project's "02 Cliente" folder; null while it is missing or without `portal.manageAccess`. */
export async function getProjectClientFolderUrlAction(projectId: string): Promise<string | null> {
  if (!(await requireManageAccess()) || !isUuid(projectId)) return null;
  const folderId = await portalRepository.findProjectClientFolderId(projectId);
  return folderId ? driveWebViewLink(folderId, true) : null;
}
