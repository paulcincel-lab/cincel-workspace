import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient, User } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

// Synchronously-readable cache of the current Supabase Auth user.
//
// Many call sites across the app resolve "who is logged in" synchronously
// (e.g. `useState(() => getCurrentAuthenticatedUser())`), but Supabase's own
// session check (`getSession()`/`getUser()`) is async. To keep those call
// sites working unchanged, we keep a small in-memory cache that is:
//   - populated eagerly the first time the client is created (covers page
//     reloads where a session cookie already exists), and
//   - kept in sync via `onAuthStateChange` (covers sign-in/sign-out/refresh).
//
// Whenever the cache changes we dispatch a synthetic "storage" event. Every
// consumer of `getCurrentAuthenticatedUser()` in this app already listens
// for native `window.addEventListener("storage", ...)` to react to
// localStorage-based session changes, so this lets Supabase-mode session
// changes reuse that exact same refresh path with no changes required at
// those call sites.
let _cachedUser: User | null = null;
let _cacheInitialized = false;

function applyCachedUser(user: User | null): void {
  _cachedUser = user;
  _cacheInitialized = true;

  if (typeof window !== "undefined") {
    window.dispatchEvent(new StorageEvent("storage", { key: "cincel.auth.supabase-session.signal" }));
  }
}

function subscribeToAuthState(client: SupabaseClient): void {
  client.auth.getSession().then(({ data }) => {
    applyCachedUser(data.session?.user ?? null);
  });

  client.auth.onAuthStateChange((_event, session) => {
    applyCachedUser(session?.user ?? null);
  });
}

/**
 * Devuelve el cliente Supabase singleton para uso en componentes de cliente.
 * Usa @supabase/ssr createBrowserClient para que la sesión de Auth se gestione
 * mediante cookies (no localStorage manual), compatiblemente con el middleware.
 *
 * Acepta tanto NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (nuevo nombre de Supabase)
 * como NEXT_PUBLIC_SUPABASE_ANON_KEY (nombre legacy) para compatibilidad.
 * Retorna null cuando las variables de entorno no están configuradas.
 */
export function getSupabaseClient(): SupabaseClient | null {
  // Browser-only: this client stores the session in cookies via
  // @supabase/ssr, and getSession()/onAuthStateChange touch `document`.
  // Several call sites (e.g. getCurrentAuthenticatedUser()) read this client
  // synchronously from a useState initializer, which also runs during SSR
  // of "use client" components — guard against constructing it there.
  if (typeof window === "undefined") {
    return null;
  }

  if (_client) {
    return _client;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return null;
  }

  _client = createBrowserClient(url, key);
  subscribeToAuthState(_client);

  return _client;
}

/**
 * Synchronously-available cached Supabase Auth user, kept up to date via
 * `onAuthStateChange`. Ensures the client (and its auth-state subscription)
 * has been initialized before reading the cache.
 */
export function getCachedSupabaseUser(): User | null {
  getSupabaseClient();
  return _cachedUser;
}

/**
 * True once the initial `getSession()` check has resolved at least once.
 * Useful to distinguish "confirmed logged out" from "haven't checked yet".
 */
export function isSupabaseAuthCacheReady(): boolean {
  return _cacheInitialized;
}

/**
 * Immediately updates the cached Supabase Auth user (and notifies listeners
 * via the synthetic "storage" event). Used right after `signInWithPassword`/
 * `signOut` calls so UI reflects the new state without waiting for the
 * `onAuthStateChange` callback to fire.
 */
export function setCachedSupabaseUser(user: User | null): void {
  applyCachedUser(user);
}
