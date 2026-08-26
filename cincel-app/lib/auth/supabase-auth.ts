import { getSupabaseClient, setCachedSupabaseUser } from "@/lib/supabase/client";

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

  // Update the synchronously-readable cache immediately so callers that read
  // `getCurrentAuthenticatedUser()` right after redirecting (e.g. the login
  // page pushing to /dashboard) see the freshly authenticated user without
  // waiting for the async `onAuthStateChange` callback to fire.
  setCachedSupabaseUser(data.user);

  return { ok: true, email: data.user.email ?? email };
}

/**
 * Signs the current user out of Supabase Auth and clears the session cookie.
 */
export async function signOutFromSupabase(): Promise<void> {
  // Clear the cache immediately so UI reflects the logged-out state right
  // away, even before the network sign-out call resolves.
  setCachedSupabaseUser(null);

  const client = getSupabaseClient();
  if (!client) {
    return;
  }

  await client.auth.signOut();
}
