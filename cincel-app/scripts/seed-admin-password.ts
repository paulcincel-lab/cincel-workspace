/**
 * Password for the admin credential that scripts/seed.ts creates. There is no built-in default: the value comes from
 * SEED_ADMIN_PASSWORD, and when that is unset a random one is generated and printed once by the seed.
 */
import { randomBytes } from "node:crypto";

export function resolveSeedAdminPassword(env: Record<string, string | undefined>): {
  password: string;
  generated: boolean;
} {
  const fromEnv = env.SEED_ADMIN_PASSWORD?.trim();
  if (fromEnv) return { password: fromEnv, generated: false };
  return { password: randomBytes(18).toString("base64url"), generated: true };
}
