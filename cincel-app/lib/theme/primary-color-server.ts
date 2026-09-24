import "server-only";

import { getAppSetting } from "@/lib/repositories/app-settings-repository";
import { isPrimaryColorToken, PRIMARY_COLOR_SETTING_KEY, type PrimaryColorToken } from "@/lib/theme/primary-color";

/** The stored primary color, or null for the default (also when the DB can't be read). */
export async function getPrimaryColor(): Promise<PrimaryColorToken | null> {
  try {
    const value = await getAppSetting(PRIMARY_COLOR_SETTING_KEY);
    return isPrimaryColorToken(value) ? value : null;
  } catch (error) {
    console.error("[theme] could not read the primary color", error);
    return null;
  }
}
