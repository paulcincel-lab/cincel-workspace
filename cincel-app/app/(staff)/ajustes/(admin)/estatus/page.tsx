import { EstatusSettings } from "@/components/ajustes/EstatusSettings";
import { fetchTaskStatusesAction } from "@/lib/actions/task-statuses-actions";

export const dynamic = "force-dynamic";

/**
 * Ajustes › Estatus (redesign FE §3.8): the existing custom task statuses
 * editor, restyled. The segment layout guards it; the Ajustes layout renders
 * the header and `AjustesNav`.
 */
export default async function AjustesEstatusPage() {

  let initialStatuses: Awaited<ReturnType<typeof fetchTaskStatusesAction>> = [];
  try {
    initialStatuses = await fetchTaskStatusesAction();
  } catch {
    // The client hydrates itself on mount, like the legacy page.
  }

  return <EstatusSettings initialStatuses={initialStatuses} />;
}
