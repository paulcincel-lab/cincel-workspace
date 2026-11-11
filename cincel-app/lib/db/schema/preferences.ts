import { sql } from "drizzle-orm";
import { boolean, check, numeric, text, time, uuid } from "drizzle-orm/pg-core";
import { bytea, colorMode, core, density, presentationStyle, stamps, themeId } from "./_schema";
import { staff } from "./people";

/** UI preferences per staff (redesign BE §3.3). A missing row means all defaults. */
export const userPreferences = core.table(
  "user_preferences",
  {
    staffId: uuid("staff_id")
      .primaryKey()
      .references(() => staff.id, { onDelete: "cascade" }),
    /** null = org theme. */
    theme: themeId("theme"),
    mode: colorMode("mode").notNull().default("light"),
    /** null = org default style. */
    style: presentationStyle("style"),
    density: density("density").notNull().default("comoda"),
    textSize: numeric("text_size", { precision: 3, scale: 1, mode: "number" }).notNull().default(14),
    /**
     * The retired per-user redesign opt-in. Nothing reads or writes it since the
     * cleanup phase; the column stays (no migration drops it).
     */
    retiredRedesignOptIn: boolean("redesign_enabled"),
    /** Quiet hours: both null or both set. */
    quietFrom: time("quiet_from"),
    quietTo: time("quiet_to"),
    /** "Ocultar completadas" in the task tables (#1039). */
    hideCompletedTasks: boolean("hide_completed_tasks").notNull().default(false),
    ...stamps,
  },
  (t) => [
    check("user_preferences_text_size_check", sql`${t.textSize} in (13, 13.5, 14, 14.5, 15, 15.5, 16)`),
    check("user_preferences_quiet_pair_check", sql`(${t.quietFrom} is null) = (${t.quietTo} is null)`),
  ]
);

/** Profile photo bytes per staff (BE §3.4); `sha256` is the ETag. */
export const staffPhotos = core.table(
  "staff_photos",
  {
    staffId: uuid("staff_id")
      .primaryKey()
      .references(() => staff.id, { onDelete: "cascade" }),
    mime: text("mime").notNull(),
    bytes: bytea("bytes").notNull(),
    sha256: text("sha256").notNull(),
    ...stamps,
  },
  (t) => [
    check("staff_photos_mime_check", sql`${t.mime} in ('image/jpeg','image/png','image/webp')`),
    check("staff_photos_size_check", sql`octet_length(${t.bytes}) <= 1048576`),
  ]
);
