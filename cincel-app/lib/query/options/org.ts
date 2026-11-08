import { queryOptions } from "@tanstack/react-query";

import { fetchGeneralSettingsAction } from "@/lib/actions/app-settings-actions";
import { qk } from "@/lib/query/keys";
import type { LoadedGeneralSettings } from "@/lib/settings/general-settings";

/**
 * The company's general settings (plan §4.5: 5 min stale). The root layout
 * seeds the cache through `<GeneralSettingsSeed>`, so the client never asks
 * for them on mount; the Ajustes › General save writes the result back with
 * `setQueryData(qk.org.general())`.
 */
export function orgGeneralOptions() {
  return queryOptions<LoadedGeneralSettings>({
    queryKey: qk.org.general(),
    queryFn: () => fetchGeneralSettingsAction(),
    staleTime: 5 * 60_000,
  });
}
