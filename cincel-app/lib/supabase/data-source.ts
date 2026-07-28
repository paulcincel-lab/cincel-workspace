/**
 * Resolución de la fuente de datos activa.
 *
 * Controlada por la variable de entorno NEXT_PUBLIC_CINCEL_DATA_SOURCE.
 * Valores aceptados: "supabase" | "localstorage" (default).
 *
 * Durante Sprint 11.2 el default sigue siendo "localstorage".
 * En Sprint 11.3 se eliminará localStorage y el default pasará a "supabase".
 */
export type DataSource = "supabase" | "localstorage";

export function getDataSource(): DataSource {
  if (process.env.NEXT_PUBLIC_CINCEL_DATA_SOURCE === "supabase") {
    return "supabase";
  }

  return "localstorage";
}

export function isSupabaseEnabled(): boolean {
  return getDataSource() === "supabase";
}
