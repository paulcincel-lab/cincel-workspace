"use client";

import { usePathname } from "next/navigation";

import { AjustesNav, ajustesNavKeyFromPath, type AjustesNavProps } from "@/components/ajustes/AjustesNav";

/** `AjustesNav` with `active` taken from the current `/ajustes/<segment>` path (used by the Ajustes layout). */
export function AjustesNavFromPath(props: Omit<AjustesNavProps, "active">) {
  const pathname = usePathname();
  return <AjustesNav {...props} active={ajustesNavKeyFromPath(pathname)} />;
}
