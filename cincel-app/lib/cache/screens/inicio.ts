import "server-only";

/**
 * Inicio has no `revalidatePath` target (Query Migration Phase 3, #937): the
 * page is the `qk.inicio()` query, which the tasks, projects, statuses,
 * reminders, vacations and onboarding mutations invalidate on the client.
 * The old `/dashboard` call only redirected to Inicio. The callers keep the
 * call until their own phase removes it.
 */
export function revalidateInicioScreen(): void {}
