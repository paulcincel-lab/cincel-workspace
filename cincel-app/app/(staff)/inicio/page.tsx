import { redirect } from "next/navigation";

import { InicioClient } from "@/components/inicio/InicioClient";
import { getSessionAccess, requireCapabilityUser } from "@/lib/auth/session";
import { firstNameOf } from "@/lib/inicio/header";
import { loadInicioPage, readFirstLoginState } from "@/lib/loaders/inicio";
import { Hydrate } from "@/lib/query/hydrate";
import { inicioPageOptions } from "@/lib/query/options/inicio";
import { getQueryClient, prefetch } from "@/lib/query/server";

/**
 * /inicio (redesign FE §3.2): the staff home, where sign-in lands. Sends a
 * first-login admin to their setup wizard (issues 671 and 672), then
 * prefetches `qk.inicio()` by calling `loadInicioPage` directly (no action
 * POST) and hands it to the client through `<Hydrate>`. Every style reads the
 * same data, so switching styles never refetches. The photo comes from
 * `qk.me.profile()`, which the shell seeds. The style (and a `?estilo=`
 * preview) comes from the appearance store and the URL (`useStyle`).
 */
export default async function InicioPage() {
  const access = await getSessionAccess();
  if (access.status === "guest" || !access.user) redirect("/login");
  if (access.status === "pending_first_access") redirect("/change-password");
  const user = access.user;

  // A failed read is null: show Inicio as usual.
  const firstLogin = await readFirstLoginState();
  if (firstLogin?.route) redirect(firstLogin.route);

  const viewer = await requireCapabilityUser();
  const qc = getQueryClient();
  await prefetch(qc, inicioPageOptions(), () => loadInicioPage(viewer));

  return (
    <Hydrate qc={qc}>
      <InicioClient
        me={{ firstName: firstNameOf(user.name), name: user.name, role: user.role ?? "" }}
        now={new Date().toISOString()}
      />
    </Hydrate>
  );
}
