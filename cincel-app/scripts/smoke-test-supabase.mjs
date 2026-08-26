/**
 * Smoke test: verify cross-session Supabase persistence.
 *
 * This script confirms that a write made by User A is visible to User B,
 * proving that data is persisted in Supabase (not just localStorage).
 *
 * Prerequisites:
 *   - A live Supabase project with NEXT_PUBLIC_SUPABASE_URL and anon key
 *   - Two test users pre-registered in auth.users:
 *       SMOKE_TEST_EMAIL_A / SMOKE_TEST_PASSWORD_A
 *       SMOKE_TEST_EMAIL_B / SMOKE_TEST_PASSWORD_B
 *   - The test users must have access to core.clients (Administrador or Dirección role)
 *
 * How to run:
 *   NEXT_PUBLIC_SUPABASE_URL=https://xyz.supabase.co \
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key \
 *   SMOKE_TEST_EMAIL_A=user-a@cincel.mx \
 *   SMOKE_TEST_PASSWORD_A=Temporal123 \
 *   SMOKE_TEST_EMAIL_B=user-b@cincel.mx \
 *   SMOKE_TEST_PASSWORD_B=Temporal123 \
 *   node scripts/smoke-test-supabase.mjs
 *
 * NOTE: SMOKE_TEST_PASSWORD_A / _B are synthetic test credentials — they are
 * never real production passwords. Real users authenticate through Supabase Auth
 * (which enforces its own policies). These values only apply to test accounts
 * created specifically for CI/smoke testing.
 *
 * This script CANNOT run in the CI sandbox (no live Supabase project wired up).
 * It is written correctly per the @supabase/supabase-js API and will work once
 * a real project is available.
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const EMAIL_A = process.env.SMOKE_TEST_EMAIL_A;
const PASSWORD_A = process.env.SMOKE_TEST_PASSWORD_A;
const EMAIL_B = process.env.SMOKE_TEST_EMAIL_B;
const PASSWORD_B = process.env.SMOKE_TEST_PASSWORD_B;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or anon key.");
  process.exit(1);
}

if (!EMAIL_A || !PASSWORD_A || !EMAIL_B || !PASSWORD_B) {
  console.error(
    "Missing SMOKE_TEST_EMAIL_A, SMOKE_TEST_PASSWORD_A, SMOKE_TEST_EMAIL_B, or SMOKE_TEST_PASSWORD_B."
  );
  process.exit(1);
}

const TEST_CLIENT_NAME = `smoke-test-${Date.now()}`;
let testClientId = null;

async function step(label, fn) {
  process.stdout.write(`  ${label} ... `);
  try {
    const result = await fn();
    console.log("OK");
    return result;
  } catch (err) {
    console.log("FAIL");
    console.error(`    ${err.message}`);
    process.exit(1);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  console.log("Cincel Workspace — Supabase smoke test");
  console.log(`  Target: ${SUPABASE_URL}`);
  console.log("");

  const clientA = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const clientB = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // Step 1: Sign in as User A
  const sessionA = await step(`Sign in as ${EMAIL_A}`, async () => {
    const { data, error } = await clientA.auth.signInWithPassword({
      email: EMAIL_A,
      password: PASSWORD_A,
    });
    assert(!error, error?.message ?? "sign in failed");
    assert(data.user, "no user returned");
    return data.session;
  });

  assert(sessionA, "No session for User A");

  // Step 2: Write a test record as User A
  testClientId = await step("Write test record (User A)", async () => {
    const { data, error } = await clientA
      .schema("core")
      .from("clients")
      .insert({ name: TEST_CLIENT_NAME, status: "Activo" })
      .select("id")
      .single();
    assert(!error, error?.message ?? "insert failed");
    return data.id;
  });

  // Step 3: Sign in as User B
  await step(`Sign in as ${EMAIL_B}`, async () => {
    const { data, error } = await clientB.auth.signInWithPassword({
      email: EMAIL_B,
      password: PASSWORD_B,
    });
    assert(!error, error?.message ?? "sign in failed");
    assert(data.user, "no user returned");
  });

  // Step 4: Verify User B can read the record written by User A
  await step("Read record as User B (cross-session persistence)", async () => {
    const { data, error } = await clientB
      .schema("core")
      .from("clients")
      .select("id, name")
      .eq("name", TEST_CLIENT_NAME)
      .single();
    assert(!error, error?.message ?? "select failed");
    assert(data?.name === TEST_CLIENT_NAME, `expected ${TEST_CLIENT_NAME}, got ${data?.name}`);
  });

  // Step 5: Cleanup — delete test record as User A
  await step("Cleanup test record (User A)", async () => {
    const { error } = await clientA
      .schema("core")
      .from("clients")
      .delete()
      .eq("id", testClientId);
    assert(!error, error?.message ?? "delete failed");
  });

  // Step 6: Sign out both users
  await step("Sign out User A", () => clientA.auth.signOut());
  await step("Sign out User B", () => clientB.auth.signOut());

  console.log("");
  console.log("All checks passed. Supabase persistence is working correctly.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
