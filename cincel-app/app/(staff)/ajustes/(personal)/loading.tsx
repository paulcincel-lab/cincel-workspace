import { Skeleton } from "@/components/ui/shadcn/skeleton";

/** One settings card placeholder: the `SettingsSection` frame with a title, a description and its body. */
function SectionSkeleton({ body }: { body: "grid" | "row" | "cards" }) {
  return (
    <div className="flex flex-col gap-3.5 rounded-[14px] border border-border bg-card px-6 py-5 shadow-xs">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-72 max-w-full" />
      </div>
      {body === "cards" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
        </div>
      ) : body === "grid" ? (
        <div className="grid grid-cols-1 gap-x-4 gap-y-3.5 sm:grid-cols-2">
          <Skeleton className="h-9 rounded-[10px]" />
          <Skeleton className="h-9 rounded-[10px]" />
          <Skeleton className="h-9 rounded-[10px]" />
          <Skeleton className="h-9 rounded-[10px]" />
        </div>
      ) : (
        <Skeleton className="h-9 w-56 rounded-[10px]" />
      )}
    </div>
  );
}

/**
 * Ajustes personal pages loading (redesign FE §3.8, §4.2): the content column
 * as settings cards (canvas `Ajustes-*`), the same for every presentation style.
 */
export default function Loading() {
  return (
    <div data-slot="route-loading" data-variant="settings" role="status" aria-busy="true" aria-label="Cargando ajustes" className="flex flex-col gap-4">
      <SectionSkeleton body="cards" />
      <SectionSkeleton body="row" />
      <SectionSkeleton body="grid" />
    </div>
  );
}
