import CronogramaView from "@/components/cronograma/cronograma-view";
import { fetchScheduleAction, type ScheduleViewData } from "@/lib/actions/schedule-actions";

export default async function CronogramaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;

  let initialView: ScheduleViewData | null = null;
  try {
    initialView = await fetchScheduleAction(projectId);
  } catch {
    // Not authorized / no session — the client falls back to hydrating itself.
  }

  return <CronogramaView projectId={projectId} initialView={initialView} />;
}
