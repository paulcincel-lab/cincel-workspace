import { getSupabaseClient } from "./client";

export type HealthCheckResult = {
  ok: boolean;
  latencyMs: number | null;
  source: "supabase" | "unconfigured";
  error: string | null;
};

/**
 * Verifica la conectividad con Supabase haciendo una consulta mínima.
 * Reutilizable por cualquier parte de la aplicación.
 */
export async function checkSupabaseHealth(): Promise<HealthCheckResult> {
  const client = getSupabaseClient();

  if (!client) {
    return {
      ok: false,
      latencyMs: null,
      source: "unconfigured",
      error: "Cliente Supabase no configurado. Revisa NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    };
  }

  const start = Date.now();

  const { error } = await client
    .schema("core")
    .from("clients")
    .select("id")
    .limit(1);

  const latencyMs = Date.now() - start;

  if (error) {
    return {
      ok: false,
      latencyMs,
      source: "supabase",
      error: error.message,
    };
  }

  return {
    ok: true,
    latencyMs,
    source: "supabase",
    error: null,
  };
}
