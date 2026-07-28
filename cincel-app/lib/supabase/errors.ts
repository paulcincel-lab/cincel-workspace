/**
 * Error que se lanza cuando una operación contra Supabase falla
 * estando la fuente de datos configurada como "supabase".
 *
 * Cuando DATA_SOURCE=supabase y ocurre este error, la aplicación NO debe
 * continuar usando localStorage silenciosamente, ya que eso generaría
 * inconsistencias entre PostgreSQL y el almacenamiento local.
 */
export class SupabaseOperationError extends Error {
  readonly operation: string;
  readonly supabaseMessage: string;

  constructor(operation: string, supabaseMessage: string) {
    super(`[Cincel/Supabase] ${operation}: ${supabaseMessage}`);
    this.name = "SupabaseOperationError";
    this.operation = operation;
    this.supabaseMessage = supabaseMessage;
  }
}

/**
 * Registra un error de Supabase de forma visible en consola y
 * opcionalmente lanza el health check para diagnosticar la causa.
 *
 * Llamar desde el catch de cualquier operación de repositorio
 * cuando DATA_SOURCE=supabase.
 */
export function reportSupabaseError(error: SupabaseOperationError): void {
  console.error(
    `%c⛔ Cincel – Supabase inoperativo`,
    "background:#dc2626;color:#fff;font-weight:bold;padding:2px 6px;border-radius:4px;"
  );
  console.error(`  Operación : ${error.operation}`);
  console.error(`  Detalle   : ${error.supabaseMessage}`);
  console.error(
    "  La aplicación NO puede continuar usando localStorage como fuente de datos " +
    "porque DATA_SOURCE=supabase. Revisa la conexión, credenciales y schema."
  );
}
