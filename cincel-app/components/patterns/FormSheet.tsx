"use client";

import type { ReactNode } from "react";

/**
 * Right `Sheet` form shell (redesign FE §4.11): sticky footer "Cancelar" +
 * submit, inline `Alert` for errors through `actionErrorText`.
 *
 * Contract stub: renders nothing until its owning issue implements it.
 */
export type FormSheetProps = {
  title: string;
  description?: string;
  open: boolean;
  onOpenChange(o: boolean): void;
  onSubmit(): Promise<void>;
  submitLabel: string;
  pending?: boolean;
  error?: string | null;
  size?: "md" | "lg";
  children: ReactNode;
};

export function FormSheet(props: FormSheetProps) {
  void props;
  return null;
}
