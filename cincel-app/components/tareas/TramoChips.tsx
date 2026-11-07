import { Check } from "lucide-react";

import { Badge } from "@/components/ui/shadcn/badge";
import type { ProjectTramo } from "@/lib/types/core";

/**
 * One chip per started tramo of a project, in tramo order. The current tramo
 * is a filled badge, other open tramos are outlined, and closed tramos are
 * outlined with a check.
 */
export function TramoChips({ tramos }: { tramos: ProjectTramo[] }) {
  const started = [...tramos].sort((a, b) => a.sortOrder - b.sortOrder);
  if (started.length === 0) return null;

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {started.map((tramo) => {
        if (tramo.closedAt) {
          return (
            <Badge key={tramo.id} variant="outline" aria-label={`${tramo.name}, cerrado`}>
              <Check aria-hidden="true" data-icon="inline-start" />
              {tramo.name}
            </Badge>
          );
        }
        return (
          <Badge key={tramo.id} variant={tramo.current ? "default" : "outline"}>
            {tramo.name}
          </Badge>
        );
      })}
    </span>
  );
}

export default TramoChips;
