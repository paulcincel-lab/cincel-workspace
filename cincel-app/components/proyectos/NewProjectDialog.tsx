"use client";

import type { ComponentProps } from "react";

import type { ProjectCreateModal } from "./ProjectCreateModal";

export type NewProjectDialogProps = Omit<ComponentProps<typeof ProjectCreateModal>, "onClose"> & {
  open: boolean;
  onOpenChange(open: boolean): void;
};

/**
 * "Nuevo proyecto" (redesign FE §3.5): extends `ProjectCreateModal` on
 * `FormDialog` (Project Flow fields).
 *
 * Contract stub: renders nothing until its owning issue implements it.
 */
export function NewProjectDialog(props: NewProjectDialogProps) {
  void props;
  return null;
}
