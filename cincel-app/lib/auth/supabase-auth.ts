import { getSupabaseClient } from "@/lib/supabase/client";

export type SupabaseLoginResult =
  | { ok: true; email: string }
  | {
      ok: false;
      reason:
        | "invalid_credentials"
        | "supabase_not_configured"
        | "unexpected_error";
      message?: string;
    };

/**
 * Authenticates a user via Supabase Auth (signInWithPassword).
 * Session is persisted by @supabase/ssr in cookies — no localStorage involved.
 *
 * This is the production authentication path. It requires a Supabase project
 * with the user pre-registered in auth.users.
 *
 * NOTE: Cannot be fully verified in this sandbox (no live Supabase project
 * configured). The API call is correct per the @supabase/ssr App Router pattern.
 */
export async function signInWithSupabase(
  email: string,
  password: string
): Promise<SupabaseLoginResult> {
  const client = getSupabaseClient();

  if (!client) {
    return { ok: false, reason: "supabase_not_configured" };
  }

  const { data, error } = await client.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });

  if (error || !data.user) {
    if (error?.message?.toLowerCase().includes("invalid")) {
      return { ok: false, reason: "invalid_credentials" };
    }

    return {
      ok: false,
      reason: "unexpected_error",
      message: error?.message,
    };
  }

  return { ok: true, email: data.user.email ?? email };
}

/**
 * Signs the current user out of Supabase Auth and clears the session cookie.
 */
export async function signOutFromSupabase(): Promise<void> {
  const client = getSupabaseClient();
  if (!client) {
    return;
  }

  await client.auth.signOut();
}
