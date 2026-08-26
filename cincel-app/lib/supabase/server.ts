import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Returns a Supabase client suitable for Server Components and Route Handlers.
 * Uses the cookie store from next/headers to access the user session established
 * by @supabase/ssr.
 *
 * Returns null when NEXT_PUBLIC_SUPABASE_URL or the anon key is not configured,
 * preserving the localstorage dev path.
 */
export async function createSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return null;
  }

  const cookieStore = await cookies();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // setAll is called from Server Components where mutations are not allowed.
          // This is safe to ignore; the middleware refreshes the session cookie.
        }
      },
    },
  });
}

/**
 * Returns the authenticated Supabase user from the server session, or null if
 * Supabase is not configured or no session exists.
 */
export async function getSupabaseServerUser() {
  const client = await createSupabaseServerClient();
  if (!client) {
    return null;
  }

  const { data } = await client.auth.getUser();
  return data.user ?? null;
}
