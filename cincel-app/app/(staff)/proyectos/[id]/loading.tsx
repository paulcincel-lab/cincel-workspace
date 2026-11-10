import { Skeleton } from "@/components/ui/shadcn/skeleton";

/**
 * `/proyectos/[id]` loading state (Resumen): the header and tabs, the
 * 230 px progress hero, three 260 px cards, the 260 px chart and two
 * columns of four blocks ("Lo que sigue", "Actividad reciente").
 */
export default function ProyectoResumenLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <span className="sr-only" role="status">
        Cargando el proyecto…
      </span>
      <div className="flex flex-col gap-3" aria-hidden="true">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-72 max-w-full" />
        <Skeleton className="h-4 w-96 max-w-full" />
        <div className="flex gap-4 border-b border-border pb-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-4 w-16" />
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-6" aria-hidden="true">
        <Skeleton className="h-[230px] rounded-[14px]" />
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-[18px]">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-[260px] rounded-[14px]" />
          ))}
        </div>
        <Skeleton className="h-[260px] rounded-[14px]" />
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(380px,100%),1fr))] gap-[18px]">
          {Array.from({ length: 2 }, (_, column) => (
            <div key={column} className="flex flex-col gap-3">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-16 rounded-[14px]" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
