import { redirect } from "next/navigation";

import { InicioClient } from "@/components/inicio/InicioClient";
import { StyleProvider } from "@/components/shell/StyleProvider";
import { fetchInicioAction } from "@/lib/actions/dashboard-actions";
import { getSessionAccess } from "@/lib/auth/session";
import { firstNameOf } from "@/lib/inicio/header";
import { staffPhotoUrl } from "@/lib/inicio/photo-url";
import type { PresentationStyle } from "@/lib/types/redesign";
import { getResolvedAppearance } from "@/lib/ui/preferences-server";
import { redirectIfRedesignOff } from "@/lib/ui/redesign-redirect";

type SearchParams = Record<string, string | string[] | undefined>;

const STYLES: readonly PresentationStyle[] = ["visual", "esencial", "analitico"];

/** `?estilo=visual|esencial|analitico` overrides the style for this render only (FE §4.2). */
function estiloOverride(value: string | string[] | undefined): PresentationStyle | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return STYLES.find((s) => s === raw) ?? null;
}

/**
 * /inicio (redesign FE §3.2): new-only route, reachable with the redesign
 * flag on (flag off → the legacy `/dashboard`). Loads everything every style
 * needs in one `fetchInicioAction` call, so switching styles never refetches.
 */
export default async function InicioPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  await redirectIfRedesignOff("/inicio", params);

  const appearance = await getResolvedAppearance();
  if (!appearance.redesignEnabled) redirect("/dashboard");

  const access = await getSessionAccess();
  if (access.status === "guest" || !access.user) redirect("/login");
  if (access.status === "pending_first_access") redirect("/change-password");
  const user = access.user;

  const [data, photoUrl] = await Promise.all([fetchInicioAction(), staffPhotoUrl(user.id)]);
  const override = estiloOverride(params.estilo);

  return (
    <StyleProvider style={override ?? appearance.style} isOverridden={override !== null} scope="staff">
      <InicioClient
        data={data}
        photoUrl={photoUrl}
        me={{ firstName: firstNameOf(user.name), name: user.name, role: user.role ?? "" }}
        now={new Date().toISOString()}
      />
    </StyleProvider>
  );
}
