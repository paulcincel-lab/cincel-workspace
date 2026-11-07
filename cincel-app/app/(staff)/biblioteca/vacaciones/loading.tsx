import { LoadingSkeleton } from "@/components/shell/LoadingSkeleton";

/** Loading state of Mis vacaciones (redesign FE §3): balance tiles first. */
export default function MisVacacionesLoading() {
  return (
    <div className="flex flex-col gap-4">
      <LoadingSkeleton variant="kpis" />
      <LoadingSkeleton variant="table" rows={5} />
    </div>
  );
}
