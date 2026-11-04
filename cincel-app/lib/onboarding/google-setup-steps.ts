/**
 * Step logic of the bootstrap admin's Google setup wizard (#671). Pure: the component renders it, the tests cover it.
 */

import { SYSTEM_ADMIN_ROLE } from "@/lib/data/roles";
import type { GoogleHealth, GroupMapping } from "@/lib/types/workspace-access";

export const GOOGLE_SETUP_STEPS = [
  { id: "review", label: "Revisión" },
  { id: "admin_group", label: "Grupo de administradores" },
  { id: "more_groups", label: "Más grupos (opcional)" },
  { id: "done", label: "Listo" },
] as const;

export type GoogleSetupStepId = (typeof GOOGLE_SETUP_STEPS)[number]["id"];

/** Rank of the Administrador group the wizard creates: above every other role group. */
export const ADMIN_GROUP_RANK = 80;

export type ReviewCheck = {
  id: "workspace_domain" | "oauth_client" | "service_account" | "token_key";
  label: string;
  ok: boolean;
  /** Blocks Next on the review step while missing. */
  required: boolean;
  /** Shown when missing: what to set in the KCD console. */
  hint: string;
  /** Configured value worth showing (domain, service account email); never a secret. */
  value: string | null;
};

/** One row per setting of the health payload, in display order. */
export function reviewChecks(health: GoogleHealth | null): ReviewCheck[] {
  return [
    {
      id: "workspace_domain",
      label: "Dominio de Workspace",
      ok: Boolean(health?.workspaceDomain),
      required: true,
      hint: "Configura GOOGLE_WORKSPACE_DOMAIN en la consola de KCD (por ejemplo, empresa.com).",
      value: health?.workspaceDomain ?? null,
    },
    {
      id: "oauth_client",
      label: "Cliente OAuth",
      ok: Boolean(health?.oauthClientConfigured),
      required: true,
      hint: "Configura GOOGLE_OAUTH_CLIENT_ID y GOOGLE_OAUTH_CLIENT_SECRET en la consola de KCD.",
      value: null,
    },
    {
      id: "service_account",
      label: "Cuenta de servicio",
      ok: Boolean(health?.serviceAccountEmail),
      required: true,
      hint: "Configura GOOGLE_SA_CLIENT_EMAIL y GOOGLE_SA_PRIVATE_KEY en la consola de KCD.",
      value: health?.serviceAccountEmail ?? null,
    },
    {
      id: "token_key",
      label: "Llave de cifrado de tokens",
      ok: Boolean(health?.tokenKeyConfigured),
      required: false,
      hint: "Configura TOKEN_ENCRYPTION_KEY en la consola de KCD. Se necesita para Drive y Calendario.",
      value: null,
    },
  ];
}

/** Required settings still missing; the review step blocks Next while any remain. */
export function missingRequiredChecks(health: GoogleHealth | null): ReviewCheck[] {
  return reviewChecks(health).filter((check) => check.required && !check.ok);
}

/** The Administrador role mapping, if one exists. */
export function findAdminGroup(mappings: GroupMapping[]): GroupMapping | null {
  return mappings.find((mapping) => mapping.kind === "role" && mapping.role === SYSTEM_ADMIN_ROLE) ?? null;
}

export type GoogleSetupState = { health: GoogleHealth | null; mappings: GroupMapping[] };

/** Whether Next is enabled on a step. */
export function canAdvance(step: GoogleSetupStepId, state: GoogleSetupState): boolean {
  switch (step) {
    case "review":
      return missingRequiredChecks(state.health).length === 0;
    case "admin_group":
      return findAdminGroup(state.mappings) !== null;
    case "more_groups":
      return true;
    case "done":
      return false;
  }
}

export function stepIndex(step: GoogleSetupStepId): number {
  return GOOGLE_SETUP_STEPS.findIndex((candidate) => candidate.id === step);
}

export function nextStep(step: GoogleSetupStepId): GoogleSetupStepId {
  const index = Math.min(stepIndex(step) + 1, GOOGLE_SETUP_STEPS.length - 1);
  return GOOGLE_SETUP_STEPS[index].id;
}

export function previousStep(step: GoogleSetupStepId): GoogleSetupStepId {
  return GOOGLE_SETUP_STEPS[Math.max(stepIndex(step) - 1, 0)].id;
}

/**
 * Where the wizard opens: the first step that still needs work, so a reload after saving the admin group doesn't
 * start over. Never opens on Listo.
 */
export function initialStep(state: GoogleSetupState): GoogleSetupStepId {
  if (!canAdvance("review", state)) return "review";
  if (!canAdvance("admin_group", state)) return "admin_group";
  return "more_groups";
}

/** Text of the last step. */
export function doneMessage(domain: string | null): string {
  return domain
    ? `Ahora entra con Google con tu cuenta de ${domain}.`
    : "Ahora entra con Google con tu cuenta de Workspace.";
}

/** Sign out, then back to /login where "Entrar con Google" is. */
export const SIGN_OUT_TO_GOOGLE_LOGIN = "/api/auth/signout?next=%2Flogin";
