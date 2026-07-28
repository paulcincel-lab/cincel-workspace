import { getSupabaseClient } from "@/lib/supabase/client";
import { isSupabaseEnabled } from "@/lib/supabase/data-source";
import { SupabaseOperationError } from "@/lib/supabase/errors";
import type { ResourceLink } from "@/lib/types/resource";

export type { ResourceLink };

type SupabaseResourceLink = {
  id: string;
  template_key: string;
  title: string;
  section: ResourceLink["section"];
  subsection: ResourceLink["subsection"];
  link_type: ResourceLink["linkType"];
  applies_to: ResourceLink["appliesTo"];
  url: string;
  status: ResourceLink["status"];
  owner_team_member_legacy_id: number | null;
  personal_for_team_member_legacy_id: number | null;
  updated_at_label: string | null;
  history: ResourceLink["history"] | null;
};

function mapResourceRow(row: SupabaseResourceLink): ResourceLink {
  return {
    id: row.id,
    templateKey: row.template_key,
    title: row.title,
    section: row.section,
    subsection: row.subsection,
    linkType: row.link_type,
    appliesTo: row.applies_to,
    url: row.url,
    status: row.status,
    ownerTeamMemberId: row.owner_team_member_legacy_id,
    personalForTeamMemberId: row.personal_for_team_member_legacy_id,
    updatedAt: row.updated_at_label ?? "",
    history: Array.isArray(row.history) ? row.history : [],
  };
}

function assertSupabaseEnabled() {
  if (!isSupabaseEnabled()) {
    throw new SupabaseOperationError(
      "resources.assertSupabaseEnabled",
      "NEXT_PUBLIC_CINCEL_DATA_SOURCE no está en supabase"
    );
  }

  const client = getSupabaseClient();
  if (!client) {
    throw new SupabaseOperationError(
      "resources.assertSupabaseEnabled",
      "Cliente Supabase no configurado"
    );
  }

  return client;
}

export async function fetchResourceLinks(): Promise<ResourceLink[]> {
  const client = assertSupabaseEnabled();

  const { data, error } = await client
    .schema("core")
    .from("resource_links")
    .select(
      `
      id, template_key, title, section, subsection, link_type,
      applies_to, url, status,
      owner_team_member_legacy_id, personal_for_team_member_legacy_id,
      updated_at_label, history
    `
    )
    .is("deleted_at", null)
    .order("section", { ascending: true })
    .order("title", { ascending: true });

  if (error || !data) {
    throw new SupabaseOperationError(
      "fetchResourceLinks",
      error?.message ?? "No se recibieron datos de core.resource_links"
    );
  }

  return (data as unknown as SupabaseResourceLink[]).map(mapResourceRow);
}

export async function saveResourceLinks(links: ResourceLink[]): Promise<void> {
  const client = assertSupabaseEnabled();

  const rows = links.map((link) => ({
    id: link.id,
    template_key: link.templateKey,
    title: link.title,
    section: link.section,
    subsection: link.subsection,
    link_type: link.linkType,
    applies_to: link.appliesTo,
    url: link.url,
    status: link.status,
    owner_team_member_legacy_id: link.ownerTeamMemberId,
    personal_for_team_member_legacy_id: link.personalForTeamMemberId,
    updated_at_label: link.updatedAt || null,
    history: link.history ?? [],
  }));

  const { error } = await client
    .schema("core")
    .from("resource_links")
    .upsert(rows, { onConflict: "id" });

  if (error) {
    throw new SupabaseOperationError("saveResourceLinks", error.message);
  }
}

export async function deleteResourceLink(id: string): Promise<void> {
  const client = assertSupabaseEnabled();

  const { error } = await client
    .schema("core")
    .from("resource_links")
    .delete()
    .eq("id", id);

  if (error) {
    throw new SupabaseOperationError("deleteResourceLink", error.message);
  }
}
