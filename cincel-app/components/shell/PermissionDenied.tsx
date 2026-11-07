import Link from "next/link";
import { Lock } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/shadcn/alert";
import { Button, buttonVariants } from "@/components/ui/shadcn/button";
import { PERMISSION_DENIED_COPY } from "@/lib/ui/route-states";

/**
 * Permission-denied state (redesign frame `EstadosSistema`, "Sin permiso"): a
 * plain shadcn `Alert` with a lock icon, what the viewer cannot do and an
 * optional way forward. Informational, so it is a polite `status` region.
 */
export type PermissionDeniedProps = {
  title?: string;
  description?: string;
  action?: { label: string; href?: string; onClick?(): void };
};

export function PermissionDenied({
  title = PERMISSION_DENIED_COPY.title,
  description = PERMISSION_DENIED_COPY.description,
  action,
}: PermissionDeniedProps) {
  return (
    <div data-slot="permission-denied" className="p-4">
      <Alert role="status">
        <Lock aria-hidden="true" />
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>
          <p>{description}</p>
          {action ? (
            action.href ? (
              <Link href={action.href} className={buttonVariants({ variant: "outline", size: "sm", className: "mt-2" })}>
                {action.label}
              </Link>
            ) : (
              <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => action.onClick?.()}>
                {action.label}
              </Button>
            )
          ) : null}
        </AlertDescription>
      </Alert>
    </div>
  );
}
