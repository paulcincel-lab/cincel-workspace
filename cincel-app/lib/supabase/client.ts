import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

function resolveDevBearer(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  // Este bearer solo se permite en entorno local de desarrollo para pruebas.
  if (process.env.NODE_ENV === "production") {
    return null;
  }

  const host = window.location.hostname;
  const isLocalHost = host === "localhost" || host === "127.0.0.1";
  if (!isLocalHost) {
    return null;
  }

  const maybeToken = (window as Window & { __CINCEL_DEV_SUPABASE_BEARER__?: unknown }).__CINCEL_DEV_SUPABASE_BEARER__;
  return typeof maybeToken === "string" && maybeToken.trim().length > 0 ? maybeToken.trim() : null;
}

/**
 * Devuelve el cliente Supabase singleton.
 * Acepta tanto NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (nuevo nombre de Supabase)
 * como NEXT_PUBLIC_SUPABASE_ANON_KEY (nombre legacy) para compatibilidad.
 * Retorna null cuando las variables de entorno no están configuradas.
 */
export function getSupabaseClient(): SupabaseClient | null {
  if (_client) {
    return _client;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Soporta el nombre nuevo (Publishable Key) y el nombre legacy (anon key)
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const bearer = resolveDevBearer();

  if (!url || !key) {
    return null;
  }

  _client = createClient(url, key, {
    auth: { persistSession: false },
    global: bearer
      ? {
          headers: {
            Authorization: `Bearer ${bearer}`,
          },
        }
      : undefined,
  });

  return _client;
}
