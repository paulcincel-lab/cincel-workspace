import type { RecheckStaffAccessResult } from "@/lib/types/workspace-access";

/** Tooltip of the "Google Workspace" badge on role and área fields (FE §2.6). */
export const GOOGLE_MANAGED_TOOLTIP = "Se administra en Google Workspace";

const REVOKED_REASON_LABELS: Record<string, string> = {
  no_role_group: "no pertenece a ningún grupo de rol de Cincel",
  workspace_suspended: "la cuenta está suspendida en Google Workspace",
  workspace_deleted: "la cuenta fue eliminada en Google Workspace",
  domain: "la cuenta no es del dominio de la empresa",
  inactive: "el colaborador está desactivado en Cincel",
  sub_mismatch: "la cuenta de Google no coincide con el colaborador",
  needs_link: "el correo no coincide con el colaborador",
  revoked: "retirado en Google Workspace",
};

/** Spanish label for an `access_revoked_reason` / denial reason; unknown values are shown as they are. */
export function revokedReasonLabel(reason: string | null | undefined): string {
  if (!reason) return "sin motivo registrado";
  return REVOKED_REASON_LABELS[reason] ?? reason;
}

export type RecheckMessage = { tone: "ok" | "revoked" | "error"; text: string };

/** Inline result of **Revisar acceso ahora** (FE §2.6). */
export function recheckResultMessage(result: RecheckStaffAccessResult): RecheckMessage {
  if (result.ok) {
    return result.allowed
      ? { tone: "ok", text: "Acceso confirmado" }
      : { tone: "revoked", text: `Acceso retirado: ${revokedReasonLabel(result.reason)}` };
  }
  switch (result.error) {
    case "forbidden":
      return { tone: "error", text: "Solo un Administrador puede revisar el acceso." };
    case "not_google_linked":
      return { tone: "error", text: "Este colaborador todavía no ha entrado con Google." };
    default:
      return { tone: "error", text: "No pudimos consultar Google; intenta más tarde" };
  }
}

/** "Último acceso" in the Equipo list. */
export function formatLastLogin(value: string | null | undefined): string {
  if (!value) return "Nunca";
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
