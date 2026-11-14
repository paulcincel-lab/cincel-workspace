import { LoadingSkeleton } from "@/components/shell/LoadingSkeleton";

/** /mejoras loading state: the stats and a board. */
export default function MejorasLoading() {
  return (
    <div className="flex flex-col gap-4">
      <LoadingSkeleton variant="kpis" rows={4} />
      <LoadingSkeleton variant="board" />
    </div>
  );
}
