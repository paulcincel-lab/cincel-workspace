import {
  isWorkspaceDenialReason,
  type WorkspaceDenialReason,
} from "@/lib/types/workspace-access";

type DenialMessageContext = {
  /** Staff Google Workspace domain (GOOGLE_WORKSPACE_DOMAIN), without "@". */
  domain?: string | null;
  /** Email of the refused Google account, when the callback passes it. */
  email?: string | null;
};

const DEFAULT_REASON: WorkspaceDenialReason = "no_role_group";

/**
 * Message shown on `/login/denegado` for each `motivo` (FE §2.2). An unknown or
 * missing `motivo` falls back to the `no_role_group` text.
 */
export function getDenialMessage(
  motivo: unknown,
  context: DenialMessageContext = {},
): string {
  const reason = isWorkspaceDenialReason(motivo) ? motivo : DEFAULT_REASON;
  const domain = context.domain?.trim().replace(/^@/, "");
  const email = context.email?.trim();

  switch (reason) {
    case "no_role_group":
      return "Tu cuenta no tiene acceso a Cincel. Pide a tu administrador de Google Workspace que te agregue a un grupo de Cincel.";
    case "workspace_suspended":
    case "workspace_deleted":
      return "Tu cuenta de Google Workspace está suspendida.";
    case "domain":
      return domain
        ? `Usa tu cuenta de la empresa (@${domain}).`
        : "Usa tu cuenta de la empresa.";
    case "inactive":
      return "Tu usuario está desactivado en Cincel.";
    case "sub_mismatch":
      return "Esta cuenta de Google no coincide con tu usuario. Contacta al administrador.";
    case "needs_link":
      return `Tu usuario de Cincel no tiene este correo. Pide a un administrador que registre ${email || "tu correo"} en tu ficha de Equipo.`;
    case "revoked":
      return "Tu acceso a Cincel fue retirado en Google Workspace.";
  }
}
