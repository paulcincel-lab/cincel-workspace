"use server";

import { toActionResult } from "@/lib/actions/action-result";
import { requireCapabilityUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { setTableColumnWidths } from "@/lib/repositories/preferences-repository";
import type { TableColumnWidths } from "@/lib/types/redesign";
import { sanitizeTableWidths } from "@/lib/ui/table-widths";
import { parseInput } from "@/lib/validation/redesign";
import { SetTableColumnWidthsSchema } from "@/lib/validation/table-widths";
import type { ActionResult } from "@/lib/types/schedule";

/**
 * Remember (or, with `widths: null`, forget) the column widths of one table
 * for the caller (#1125). `tableId` and the column keys are short identifiers;
 * widths are whole px. Returns every table's widths so the client can show
 * them without a refetch. No revalidation. Auth: staff. Errors: `INVALID`.
 */
export async function setTableColumnWidthsAction(
  ...args: Parameters<typeof setTableColumnWidthsActionImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof setTableColumnWidthsActionImpl>>>> {
  return toActionResult(() => setTableColumnWidthsActionImpl(...args));
}

async function setTableColumnWidthsActionImpl(input: {
  tableId: string;
  widths: Record<string, number> | null;
}): Promise<{ tableColumnWidths: TableColumnWidths }> {
  const user = await requireCapabilityUser();
  const parsed = parseInput(SetTableColumnWidthsSchema, input);
  const widths = parsed.widths && Object.keys(parsed.widths).length > 0 ? sanitizeTableWidths(parsed.widths) : null;
  const row = await setTableColumnWidths(db, user.member.id, parsed.tableId, widths);
  return { tableColumnWidths: row.tableColumnWidths ?? {} };
}
