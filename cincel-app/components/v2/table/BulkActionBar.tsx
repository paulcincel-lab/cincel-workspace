import { Button } from "@/components/ui/shadcn/button";

export interface BulkAction {
  label: string;
  onClick: () => void;
  variant?: "default" | "destructive";
}

interface BulkActionBarProps {
  selectedCount: number;
  itemLabel?: string;
  actions: BulkAction[];
}

/**
 * The bar that appears above a task table once one or more rows are
 * selected via `createSelectionColumn` — "N tareas seleccionadas · Reasignar
 * · Marcar completadas · Archivar" from the Actividades redesign. Renders
 * nothing when `selectedCount` is 0, so callers can mount it unconditionally.
 */
export function BulkActionBar({ selectedCount, itemLabel = "tareas", actions }: BulkActionBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="flex items-center justify-between gap-3 rounded-t-md bg-foreground px-3.5 py-2 text-xs text-background">
      <span className="font-semibold">
        {selectedCount} {itemLabel} seleccionadas
      </span>
      <div className="flex gap-2">
        {actions.map((action) => (
          <Button
            key={action.label}
            variant="ghost"
            size="sm"
            className="h-7 border border-background/30 text-background hover:bg-background/10 hover:text-background"
            onClick={action.onClick}
          >
            {action.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
