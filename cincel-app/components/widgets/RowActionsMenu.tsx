"use client";

import type { ReactNode } from "react";

import type { TableRowAction } from "@/components/widgets/table-rows";

/**
 * The `⋯` menu at the end of a table row (#1041): shown on row hover or
 * focus, always on touch. Destructive entries come last, in the destructive
 * tone. Built on the shadcn DropdownMenu like `components/v2/table/RowActionsMenu`.
 */
export type RowActionsMenuProps = {
  /** The row's name, for the trigger's label ("Acciones de «…»"). */
  rowLabel: string;
  actions: TableRowAction[];
};

/** Contract stub: renders nothing until the menu lands. */
export function RowActionsMenu(props: RowActionsMenuProps): ReactNode {
  void props;
  return null;
}
