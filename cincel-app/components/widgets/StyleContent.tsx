"use client";

import type { ReactNode } from "react";

import { useStyle } from "@/components/shell/StyleProvider";
import { cn } from "@/lib/utils";

/**
 * Page content column (redesign FE §15.2 "Max content width"): full width in
 * Visual and Analítico, centered at 980 px in Esencial.
 */
export function StyleContent({ className, children }: { className?: string; children: ReactNode }) {
  const { style } = useStyle();
  return (
    <div className={cn("w-full", style === "esencial" && "mx-auto max-w-[980px]", className)}>{children}</div>
  );
}
