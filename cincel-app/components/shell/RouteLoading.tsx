"use client";

import { usePathname } from "next/navigation";

import { LoadingSkeleton } from "@/components/shell/LoadingSkeleton";
import { loadingVariantFor, type LoadingVariant } from "@/lib/ui/route-states";

/**
 * Body of every staff route group's `loading.tsx` (redesign FE §3, §4.2): the
 * `LoadingSkeleton` variant matching the page being opened (`kpis`, `cards`,
 * `list`, `table`, …). `variant` pins it for a group whose pages share a shape.
 */
export type RouteLoadingProps = { variant?: LoadingVariant };

export function RouteLoading({ variant }: RouteLoadingProps) {
  const pathname = usePathname();
  const resolved = variant ?? loadingVariantFor(pathname);
  return (
    <div data-slot="route-loading" data-variant={resolved}>
      <LoadingSkeleton variant={resolved} />
    </div>
  );
}
