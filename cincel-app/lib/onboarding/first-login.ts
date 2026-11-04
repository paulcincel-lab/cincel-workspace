/**
 * First-login wizards (#671, #672): which guided setup a staff member sees after sign-in.
 *
 * - `google_groups` (#671): the bootstrap admin (`BOOTSTRAP_ADMIN_EMAIL`, password only) maps the Google Workspace
 *   groups so others can sign in with Google. The bootstrap admin never sees any other wizard.
 * - `monday_import` (#672): an Administrador signed in with Google, while no monday import has been applied.
 *
 * Both share one per-staff flag, `core.staff.onboarding_completed_at`: finishing or skipping either wizard sets it
 * and the wizard stops showing. Pure, no DB: `first-login-server.ts` loads the inputs.
 */

import { SYSTEM_ADMIN_ROLE } from "@/lib/data/roles";

type Env = Record<string, string | undefined>;

export const FIRST_LOGIN_WIZARDS = ["google_groups", "monday_import"] as const;

export type FirstLoginWizard = (typeof FIRST_LOGIN_WIZARDS)[number];

/**
 * Page of each wizard. Null while that wizard has no page yet: the dashboard only redirects to a wizard with a
 * route, so a wizard that isn't built never sends anyone to a 404. #672 sets `monday_import` when its page lands.
 */
export const FIRST_LOGIN_WIZARD_ROUTES: Record<FirstLoginWizard, string | null> = {
  google_groups: "/configuracion/google/primeros-pasos",
  monday_import: null,
};

/** `BOOTSTRAP_ADMIN_EMAIL`, trimmed and lowercased like `scripts/bootstrap-admin.mjs`; null when unset. */
export function bootstrapAdminEmail(env: Env = process.env): string | null {
  return env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase() || null;
}

/** Whether an email is the bootstrap admin's (case insensitive). False when `BOOTSTRAP_ADMIN_EMAIL` is unset. */
export function isBootstrapAdminEmail(email: string | null | undefined, env: Env = process.env): boolean {
  const bootstrap = bootstrapAdminEmail(env);
  const value = email?.trim().toLowerCase();
  return Boolean(bootstrap && value && value === bootstrap);
}

export type FirstLoginInput = {
  email: string | null;
  /** Resolved access role of the session (`SessionAccess.user.access`). */
  access: string | null;
  /** Signed in with Google before (`google_sub` set). */
  googleLinked: boolean;
  onboardingCompletedAt: Date | string | null;
  /**
   * Whether an import batch is `applied`. Only asked for Google admins, so callers can pass a function and skip
   * the query for everyone else.
   */
  hasAppliedImport: boolean | (() => boolean | Promise<boolean>);
};

/**
 * Which wizard to show, or null. Only Administrador staff get one, and only until they finish or skip it.
 */
export async function resolveFirstLoginWizard(
  input: FirstLoginInput,
  env: Env = process.env,
): Promise<FirstLoginWizard | null> {
  if (input.access !== SYSTEM_ADMIN_ROLE) return null;
  if (input.onboardingCompletedAt) return null;
  if (isBootstrapAdminEmail(input.email, env)) return "google_groups";
  if (!input.googleLinked) return null;
  const applied = typeof input.hasAppliedImport === "function" ? await input.hasAppliedImport() : input.hasAppliedImport;
  return applied ? null : "monday_import";
}

/** The page to send a staff member to after sign-in, or null when there is none (or it isn't built yet). */
export function firstLoginWizardRoute(wizard: FirstLoginWizard | null): string | null {
  return wizard ? FIRST_LOGIN_WIZARD_ROUTES[wizard] : null;
}

export type GoogleSetupBannerInput = {
  email: string | null;
  access: string | null;
  onboardingCompletedAt: Date | string | null;
  groupMappingCount: number;
};

/**
 * The dashboard banner after the bootstrap admin skipped (or finished) the Google wizard while no Workspace group
 * is mapped yet: nobody can sign in with Google until one is.
 */
export function shouldShowGoogleSetupBanner(input: GoogleSetupBannerInput, env: Env = process.env): boolean {
  return (
    input.access === SYSTEM_ADMIN_ROLE &&
    Boolean(input.onboardingCompletedAt) &&
    input.groupMappingCount === 0 &&
    isBootstrapAdminEmail(input.email, env)
  );
}
