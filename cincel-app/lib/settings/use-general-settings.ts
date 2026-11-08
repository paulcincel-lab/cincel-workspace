"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";

import { orgGeneralOptions } from "@/lib/query/options/org";
import {
  GENERAL_SETTINGS_DEFAULTS,
  type GeneralSettings,
  type LoadedGeneralSettings,
} from "@/lib/settings/general-settings";

/**
 * Seeds `qk.org.general()` with the root layout's server value before its
 * children render, so `useGeneralSettings()` has data on the first render
 * (server and client alike) and makes no request on mount. A later layout
 * render with a different value (after `revalidatePath('/','layout')`)
 * replaces the cached one.
 */
export function GeneralSettingsSeed({ value, children }: { value: LoadedGeneralSettings; children: ReactNode }) {
  const queryClient = useQueryClient();
  const { queryKey } = orgGeneralOptions();

  useState(() => {
    if (queryClient.getQueryData(queryKey) === undefined) {
      queryClient.setQueryData(queryKey, value);
    }
    return null;
  });

  useEffect(() => {
    const cached = queryClient.getQueryData(queryKey);
    if (JSON.stringify(cached) !== JSON.stringify(value)) {
      queryClient.setQueryData(queryKey, value);
    }
    // `queryKey` is a fresh constant tuple each render; the value is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient, value]);

  return children;
}

/**
 * The company's general settings as stored on the server, read from
 * `qk.org.general()`. Only an invalidation or `setQueryData` changes them;
 * nothing refetches on mount, focus or reconnect.
 */
export function useGeneralSettings(): GeneralSettings {
  const { data } = useQuery({
    ...orgGeneralOptions(),
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  return data?.settings ?? GENERAL_SETTINGS_DEFAULTS;
}
