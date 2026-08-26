import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

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

  return _client;
}
