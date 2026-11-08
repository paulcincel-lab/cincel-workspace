import { AjustesGeneralClient } from "@/components/ajustes/AjustesGeneralClient";
import { requireCapabilityUser } from "@/lib/auth/session";
import { loadAjustesGeneral } from "@/lib/loaders/ajustes";
import { Hydrate } from "@/lib/query/hydrate";
import { ajustesGeneralOptions } from "@/lib/query/options/ajustes";
import { getQueryClient, prefetch } from "@/lib/query/server";
import { GENERAL_SECTIONS } from "@/lib/shell/settings-sections/general";
import { visibleSettingsSections } from "@/lib/shell/settings-sections/visible";

export const dynamic = "force-dynamic";

/**
 * Ajustes › General (redesign FE §3.8, frame `AjustesGeneral`): company data,
 * regional settings, system info and the avatar-menu links. The segment layout
 * guards it with `canManageGeneralSettings`; the Ajustes layout renders
 * `AjustesNav`.
 *
 * The settings are `qk.org.general()`, which the root layout already read and
 * seeded, so this page does not read them again: it only prefetches the
 * capability flags (`qk.ajustes.page('general')`) and hydrates them.
 */
export default async function AjustesGeneralPage() {
  const user = await requireCapabilityUser();
  const qc = getQueryClient();
  await prefetch(qc, ajustesGeneralOptions(), () => loadAjustesGeneral(user));
  const sections = visibleSettingsSections(GENERAL_SECTIONS, user);

  return (
    <Hydrate qc={qc}>
      <AjustesGeneralClient>
        {sections.map(({ name, Component }) => (
          <Component key={name} />
        ))}
      </AjustesGeneralClient>
    </Hydrate>
  );
}
