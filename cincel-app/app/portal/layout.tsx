import { Suspense, type ReactNode } from "react";
import type { Metadata } from "next";
import { cookies } from "next/headers";

import PortalAppearance from "@/components/portal/PortalAppearance";
import PortalShell from "@/components/portal/PortalShell";
import PortalStyleSwitch from "@/components/portal/PortalStyleSwitch";
import { StyleProvider } from "@/components/shell/StyleProvider";
import { getPortalAppearance } from "@/lib/portal/appearance";
import { getPortalUser } from "@/lib/portal/session";
import { getPortalPresentation } from "@/lib/portal/style-server";

/** Portal cookie name (BE §B.2); only its presence is checked here, `getPortalUser()` validates it. */
const PORTAL_SESSION_COOKIE = "cincel_portal_session";

/** Every portal page shows its own tab title instead of the staff app's "Cincel Workspace". */
export const metadata: Metadata = { title: "Portal de clientes · Cincel" };

/**
 * Portal layout (FE §3): its own shell, never the staff sidebar or header.
 *
 * Without a portal cookie the shell renders without the client name (the proxy already sends
 * protected `/portal/*` paths to `/portal/login`, which renders here too). With a cookie,
 * `getPortalUser()` validates it, and a stale one just renders the shell without the name: the layout
 * never redirects, so `/portal/acceder?token=…` and `/portal/login?error=…` keep their query string.
 * Protected pages call `requirePortalUser()` themselves, which clears a stale cookie.
 *
 * The presentation style comes from the `cincel-portal-style` cookie (org default when missing or invalid,
 * FE §3.11) and wraps the shell in `StyleProvider scope="portal"`; a signed-in client gets
 * `EstiloSwitch scope="portal"` in the top bar on the pages that have the three styles. When the organization
 * fixed the style (`allowUserOverride: false`), `fixedByOrg` reaches the provider: the cookie is ignored
 * (`getPortalPresentation`) and `PortalStyleSwitch` renders nothing.
 *
 * The session lookup here (`getPortalUser`, cached per request) is the one that slides the session expiry;
 * the portal query functions only read.
 */
export default async function PortalLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const [user, appearance, presentation] = await Promise.all([
    cookieStore.get(PORTAL_SESSION_COOKIE)?.value ? getPortalUser() : null,
    getPortalAppearance(),
    getPortalPresentation(),
  ]);

  // Organization theme only (FE §3.11): portal clients have no theme or mode override; only the style.
  return (
    <PortalAppearance appearance={appearance}>
      <StyleProvider style={presentation.style} scope="portal" fixedByOrg={presentation.fixedByOrg}>
        <PortalShell
          clientName={user?.name ?? null}
          styleSwitch={
            user ? (
              <Suspense fallback={null}>
                <PortalStyleSwitch />
              </Suspense>
            ) : undefined
          }
        >
          {children}
        </PortalShell>
      </StyleProvider>
    </PortalAppearance>
  );
}
