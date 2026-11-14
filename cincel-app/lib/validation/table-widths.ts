import { z } from "zod";

import { MAX_COLUMN_WIDTH } from "@/lib/ui/table-widths";

/** Table ids and column keys are short identifiers, never free text. */
const TABLE_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const COLUMN_KEY_PATTERN = /^[A-Za-z0-9_.:-]{1,64}$/;

/** The widest any column may be saved; each column's own max is applied when the table renders. */
const MAX_SAVED_WIDTH = Math.max(MAX_COLUMN_WIDTH, 1200);
const MIN_SAVED_WIDTH = 24;
const MAX_COLUMNS_PER_TABLE = 40;

/**
 * `setTableColumnWidthsAction` input: one table's widths, or `null` to forget
 * them ("Restablecer anchos"). Widths are whole px.
 */
export const SetTableColumnWidthsSchema = z
  .object({
    tableId: z.string().regex(TABLE_ID_PATTERN),
    widths: z
      .record(z.string().regex(COLUMN_KEY_PATTERN), z.number().min(MIN_SAVED_WIDTH).max(MAX_SAVED_WIDTH))
      .refine((widths) => Object.keys(widths).length <= MAX_COLUMNS_PER_TABLE, "TOO_MANY_COLUMNS")
      .nullable(),
  })
  .strict();

export type SetTableColumnWidthsInput = z.infer<typeof SetTableColumnWidthsSchema>;
