import "server-only";

/**
 * Staff login feature flags (backend spec §A.8). Read from the server
 * environment on every call, never through NEXT_PUBLIC_*: pages pass them to
 * client components as props.
 *
 * - AUTH_GOOGLE_ENABLED (default false): "Entrar con Google" and /api/auth/google/*.
 * - AUTH_PASSWORD_ENABLED (default true): email/password form, loginAction,
 *   first access and change password.
 *
 * Only "true" / "false" (any case, surrounding spaces ignored) change a flag;
 * an unset, empty or unrecognised value keeps its default.
 */

function readFlag(name: string, fallback: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

export function isGoogleAuthEnabled(): boolean {
  return readFlag("AUTH_GOOGLE_ENABLED", false);
}

export function isPasswordAuthEnabled(): boolean {
  return readFlag("AUTH_PASSWORD_ENABLED", true);
}

export interface AuthFlags {
  googleEnabled: boolean;
  passwordEnabled: boolean;
}

export function getAuthFlags(): AuthFlags {
  return {
    googleEnabled: isGoogleAuthEnabled(),
    passwordEnabled: isPasswordAuthEnabled(),
  };
}
