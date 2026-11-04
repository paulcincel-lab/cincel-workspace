"use client";

import { Badge } from "@/components/ui/shadcn/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/shadcn/tooltip";
import { GOOGLE_MANAGED_TOOLTIP } from "@/lib/equipo/google-access";

/** "Google Workspace" badge with the "Se administra en Google Workspace" tooltip (FE §2.6). */
export function GoogleManagedBadge() {
  return (
    <Tooltip>
      <TooltipTrigger render={<Badge variant="outline" />}>
        Google Workspace
      </TooltipTrigger>
      <TooltipContent>{GOOGLE_MANAGED_TOOLTIP}</TooltipContent>
    </Tooltip>
  );
}
