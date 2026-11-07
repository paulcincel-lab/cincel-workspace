import { redirect } from "next/navigation";

import {
  DISCONNECTED_GMAIL,
  IntegracionesClient,
  IntegracionesCutto,
} from "@/components/ajustes/IntegracionesClient";
import { fetchGmailStatusAction } from "@/lib/actions/gmail-actions";
import { IMPLEMENTED as GMAIL_IMPLEMENTED } from "@/lib/actions/gmail-actions.flags";
import { getSessionAccess, requireCapabilityUser } from "@/lib/auth/session";
import { getPickerDriveStatus } from "@/lib/google/picker-drive";
import { settingsSectionsFor } from "@/lib/shell/settings-sections";
import type { GmailStatus } from "@/lib/types/redesign";
import { redirectIfRedesignOff } from "@/lib/ui/redesign-redirect";

export const dynamic = "force-dynamic";

/** Cards with a lower `order` go above the Cutto link card; the rest (monday) below it. */
const CUTTO_CARD_ORDER = 35;

async function loadGmailStatus(): Promise<GmailStatus> {
  if (!GMAIL_IMPLEMENTED.fetchGmailStatusAction) return DISCONNECTED_GMAIL;
  try {
    return await fetchGmailStatusAction();
  } catch {
    return DISCONNECTED_GMAIL;
  }
}

/**
 * Ajustes › Integraciones (redesign FE §3.8): Gmail, Google Calendar, Google
 * Drive, Cutto (link only) and monday. Personal page (staff session only);
 * the Ajustes layout renders the header and `AjustesNav`. New-only route:
 * with the redesign off it redirects to the legacy equivalent.
 */
export default async function AjustesIntegracionesPage() {
  await redirectIfRedesignOff("/ajustes/integraciones");

  const access = await getSessionAccess();
  if (!access.user) redirect("/login");
  const user = await requireCapabilityUser();

  const sections = settingsSectionsFor("integraciones", user);
  const [gmail, drive] = await Promise.all([
    loadGmailStatus(),
    getPickerDriveStatus({
      staffId: access.user.id,
      email: access.user.email ?? "",
      googleLinked: access.user.googleLinked,
    }),
  ]);

  const above = sections.filter((s) => s.order < CUTTO_CARD_ORDER);
  const below = sections.filter((s) => s.order >= CUTTO_CARD_ORDER);

  return (
    <IntegracionesClient
      gmail={gmail}
      accountEmail={access.user.email ?? null}
      drive={{ configured: drive.configured, hasDriveGrant: drive.hasDriveGrant }}
      googleConfigured={drive.configured}
    >
      {above.map(({ name, Component }) => (
        <Component key={name} />
      ))}
      <IntegracionesCutto />
      {below.map(({ name, Component }) => (
        <Component key={name} />
      ))}
    </IntegracionesClient>
  );
}
