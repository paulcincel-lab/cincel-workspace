import { CircleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/shadcn/alert";
import { Button } from "@/components/ui/shadcn/button";

/**
 * Error state (redesign FE §4.2, §3.12, frame `EstadosSistema`): a destructive
 * shadcn `Alert` with "No se pudo cargar esta página." and a "Reintentar"
 * button that calls `onRetry`. `code` (an error digest or action error code)
 * is shown under the description when given. Callers pass action errors
 * through `actionErrorText` as `description`.
 */
export type ErrorStateProps = { title?: string; description?: string; onRetry?(): void; code?: string };

export const ERROR_STATE_TITLE = "No se pudo cargar esta página.";
export const ERROR_STATE_RETRY = "Reintentar";

export function ErrorState({ title = ERROR_STATE_TITLE, description, onRetry, code }: ErrorStateProps) {
  const hasBody = Boolean(description || code || onRetry);
  return (
    <div data-slot="error-state" className="p-4">
      <Alert variant="destructive">
        <CircleAlert aria-hidden="true" />
        <AlertTitle>{title}</AlertTitle>
        {hasBody ? (
          <AlertDescription>
            {description ? <p>{description}</p> : null}
            {code ? (
              <p className="font-mono text-xs">
                Código: <span data-slot="error-state-code">{code}</span>
              </p>
            ) : null}
            {onRetry ? (
              <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => onRetry()}>
                {ERROR_STATE_RETRY}
              </Button>
            ) : null}
          </AlertDescription>
        ) : null}
      </Alert>
    </div>
  );
}
