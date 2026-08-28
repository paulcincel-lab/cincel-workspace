import { sql } from "drizzle-orm";
import { bigint, check, index, jsonb, text } from "drizzle-orm/pg-core";
import { core, timestamps } from "./_schema";

type ResourceHistoryItem = Record<string, unknown>;

export const resourceLinks = core.table(
  "resource_links",
  {
    id: text("id").primaryKey(),
    templateKey: text("template_key").notNull(),
    title: text("title").notNull(),
    section: text("section").notNull(),
    subsection: text("subsection"),
    linkType: text("link_type").notNull(),
    appliesTo: text("applies_to").notNull(),
    url: text("url").notNull(),
    status: text("status").notNull().default("vigente"),
    ownerTeamMemberLegacyId: bigint("owner_team_member_legacy_id", {
      mode: "number",
    }),
    personalForTeamMemberLegacyId: bigint("personal_for_team_member_legacy_id", {
      mode: "number",
    }),
    updatedAtLabel: text("updated_at_label"),
    history: jsonb("history")
      .$type<ResourceHistoryItem[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    ...timestamps,
  },
  (t) => [
    check(
      "resource_links_section_check",
      sql`${t.section} in ('mis-documentos', 'mis-favoritos', 'plantillas-diseno', 'formatos-obra', 'mis-vacaciones', 'formacion', 'empresa')`
    ),
    check(
      "resource_links_subsection_check",
      sql`${t.subsection} is null or ${t.subsection} in ('diseno', 'construccion')`
    ),
    check(
      "resource_links_link_type_check",
      sql`${t.linkType} in ('drive_folder', 'drive_file', 'web')`
    ),
    check(
      "resource_links_applies_to_check",
      sql`${t.appliesTo} in ('general', 'diseno', 'construccion', 'ambos')`
    ),
    check(
      "resource_links_status_check",
      sql`${t.status} in ('vigente', 'obsoleto')`
    ),
    index("idx_resource_links_section").on(t.section),
    index("idx_resource_links_subsection").on(t.subsection),
    index("idx_resource_links_status").on(t.status),
    index("idx_resource_links_owner_team_member_legacy_id").on(
      t.ownerTeamMemberLegacyId
    ),
    index("idx_resource_links_personal_for_team_member_legacy_id").on(
      t.personalForTeamMemberLegacyId
    ),
    index("idx_resource_links_deleted_at").on(t.deletedAt),
  ]
);
