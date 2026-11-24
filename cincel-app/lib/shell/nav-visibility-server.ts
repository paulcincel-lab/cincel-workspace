import "server-only";

import { cache } from "react";

import { getAppSetting } from "@/lib/repositories/app-settings-repository";
import { NAV_VISIBILITY_SETTING_KEY, parseNavVisibility, type NavVisibility } from "@/lib/shell/nav-visibility";

/**
 * The stored menu visibility, or nothing hidden (also when the DB can't be
 * read, so a failing read never empties the menu). Per-request cache.
 */
export const getNavVisibility = cache(async function getNavVisibility(): Promise<NavVisibility> {
  try {
    return parseNavVisibility(await getAppSetting(NAV_VISIBILITY_SETTING_KEY));
  } catch (error) {
    console.error("[settings] could not read the menu visibility", error);
    return parseNavVisibility(null);
  }
});
