import { LoadingSkeleton } from "@/components/shell/LoadingSkeleton";

/** /mi-espacio loading state (redesign FE §3): the Bandeja list and the notes cards. */
export default function MiEspacioLoading() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <LoadingSkeleton variant="list" rows={6} />
      <LoadingSkeleton variant="cards" />
    </div>
  );
}
