// Makes sure one Administrador can sign in with a password, without a seed.
// Reads BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD; does nothing when
// both are empty. BOOTSTRAP_ADMIN_NAME (default "Administrador") is the display name. Run by scripts/migrate.mjs after the migrations, so it runs
// on every deploy and is safe to repeat:
//   - no staff row with that email: one is created with role Administrador
//     and BOOTSTRAP_ADMIN_NAME as its name
//   - a staff row still named after its email is renamed to BOOTSTRAP_ADMIN_NAME
//     once; a name set in the app is never overwritten
//   - a staff row exists: its role is set to Administrador and it is reactivated
//   - the password credential is written only when it is missing, disabled or
//     doesn't match the env password, so the env value is the source of truth
// With AUTH_PASSWORD_ENABLED=false nothing is created or re-enabled, so a deploy
// never undoes scripts/disable-passwords.ts. Break-glass: set
// AUTH_PASSWORD_ENABLED=true and the bootstrap vars, then redeploy.
// Hashing must match lib/auth/password.ts (scrypt, 16-byte salt, 64-byte key, NFKC).
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb);
const KEYLEN = 64;
const ADMIN_ROLE = "Administrador";
const DEFAULT_ADMIN_NAME = "Administrador";

async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const derived = await scrypt(password.normalize("NFKC"), salt, KEYLEN);
  return { hash: derived.toString("hex"), salt };
}

async function passwordMatches(password, hash, salt) {
  const expected = Buffer.from(hash, "hex");
  const derived = await scrypt(password.normalize("NFKC"), salt, KEYLEN);
  return (
    expected.length === derived.length && timingSafeEqual(expected, derived)
  );
}

/**
 * The bootstrap admin from env, null when unset; throws when only one of the two is set.
 * @param {Record<string, string | undefined>} [env]
 */
export function bootstrapAdminFromEnv(env = process.env) {
  const email = env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase() ?? "";
  const password = env.BOOTSTRAP_ADMIN_PASSWORD ?? "";
  if (!email && !password) return null;
  if (!email || !password) {
    throw new Error(
      "BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD must be set together",
    );
  }
  if (!/^[^\s@]+@[^\s@]+$/.test(email))
    throw new Error("BOOTSTRAP_ADMIN_EMAIL is not an email address");
  const name = env.BOOTSTRAP_ADMIN_NAME?.trim() || DEFAULT_ADMIN_NAME;
  return { email, password, name };
}

/**
 * AUTH_PASSWORD_ENABLED as lib/auth/auth-flags.ts reads it: only "true" / "false"
 * (any case, spaces ignored) change it; anything else keeps the default, true.
 * @param {Record<string, string | undefined>} [env]
 */
export function passwordAuthEnabledFromEnv(env = process.env) {
  return env.AUTH_PASSWORD_ENABLED?.trim().toLowerCase() !== "false";
}

export const SKIPPED_PASSWORDS_DISABLED = "skipped, passwords disabled";

/**
 * Creates or updates the bootstrap admin with `sql` (a postgres.js client or
 * transaction). Returns what changed, for the log line. With
 * `passwordEnabled: false` it touches nothing and returns [SKIPPED_PASSWORDS_DISABLED].
 * @param {{ passwordEnabled?: boolean }} [options]
 */
export async function ensureBootstrapAdmin(sql, admin, { passwordEnabled = true } = {}) {
  if (!passwordEnabled) return [SKIPPED_PASSWORDS_DISABLED];
  const changes = [];
  const name = admin.name?.trim() || DEFAULT_ADMIN_NAME;
  let [member] = await sql`
    select id, name, email, role, active from core.staff
    where lower(email) = ${admin.email} and deleted_at is null
    limit 1`;

  if (!member) {
    [member] = await sql`
      insert into core.staff (name, email, role, active)
      values (${name}, ${admin.email}, ${ADMIN_ROLE}, true)
      returning id, name, email, role, active`;
    changes.push("staff created");
  } else if ((member.name ?? "").trim().toLowerCase() === admin.email) {
    // Only a name that is still the email is replaced, so this happens once.
    await sql`update core.staff set name = ${name}, updated_at = now() where id = ${member.id}`;
    changes.push("name set");
  }
  if (member.role !== ADMIN_ROLE || !member.active) {
    await sql`update core.staff set role = ${ADMIN_ROLE}, active = true, updated_at = now() where id = ${member.id}`;
    changes.push("staff set to Administrador");
  }

  const [credential] = await sql`
    select password_hash, salt, enabled from core.auth_credentials where staff_id = ${member.id}`;
  const current =
    credential &&
    credential.enabled &&
    (await passwordMatches(
      admin.password,
      credential.password_hash,
      credential.salt,
    ));
  if (!current) {
    const { hash, salt } = await hashPassword(admin.password);
    await sql`
      insert into core.auth_credentials (staff_id, password_hash, salt, enabled, must_change_password, password_updated_at)
      values (${member.id}, ${hash}, ${salt}, true, false, now())
      on conflict (staff_id) do update set
        password_hash = excluded.password_hash,
        salt = excluded.salt,
        enabled = true,
        must_change_password = false,
        password_updated_at = now(),
        updated_at = now()`;
    changes.push(credential ? "password updated" : "password set");
  }
  return changes;
}
