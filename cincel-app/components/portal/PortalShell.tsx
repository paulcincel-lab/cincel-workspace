import type { ReactNode } from "react";
import Link from "next/link";

import PortalSignOutLink from "@/components/portal/PortalSignOutLink";
import { PORTAL_LOGIN_ROUTE, PORTAL_ROUTE } from "@/lib/auth/public-routes";
import { portalInitials } from "@/lib/portal/overview";

/** GET logout route (BE §B.4.2): clears the portal cookie and session, then redirects to the portal sign-in. */
export const PORTAL_SIGN_OUT_URL = `/api/portal/auth/logout?next=${encodeURIComponent(PORTAL_LOGIN_ROUTE)}`;

export const PORTAL_SHELL_COPY = {
  portal: "Portal de clientes",
  home: "Cincel, inicio del portal",
  salir: "Salir",
} as const;

/** The single 768 px column the sign-in pages, the project list and the error pages keep. */
export function PortalPageColumn({ children }: { children: ReactNode }) {
  return <div className="mx-auto flex w-full min-w-0 max-w-3xl flex-1 flex-col px-4 py-6">{children}</div>;
}

export type PortalShellProps = {
  /** Signed-in client's name; `null` on the public portal pages (sign-in, magic-link landing). */
  clientName: string | null;
  /** The client's company (`PortalUser.companyName`); null when there is none or it equals the name. */
  companyName: string | null;
  /** `PortalProjectMenu`: renders itself only on `/portal/proyectos/[id]`. */
  projectMenu?: ReactNode;
  /** `PortalStyleSwitch`: renders itself only on the project's Resumen, never when the org fixed the style. */
  styleSwitch?: ReactNode;
  children: ReactNode;
};

/**
 * Portal frame (FE §3, Portal Visual): one `card` bar with the logo, `Portal de clientes · {company}`, the
 * project menu, the style switch, the client's avatar and **Salir**. Inner width 1240 px; at 390 px it wraps to
 * two rows (logo · avatar · Salir, then the project menu and the style switch), so nothing scrolls sideways.
 * `<main>` sets no width: each portal page keeps its own. Never reads staff data, so it is safe for every
 * `/portal` page.
 */
export default function PortalShell({ clientName, companyName, projectMenu, styleSwitch, children }: PortalShellProps) {
  const portalLine = companyName ? `${PORTAL_SHELL_COPY.portal} · ${companyName}` : PORTAL_SHELL_COPY.portal;
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex w-full max-w-[1240px] flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 sm:px-8 sm:py-3.5">
          <Link
            href={PORTAL_ROUTE}
            aria-label={PORTAL_SHELL_COPY.home}
            className="order-1 flex min-h-11 items-center text-lg font-semibold tracking-[0.32em]"
          >
            CINCEL
          </Link>
          <span aria-hidden="true" className="order-1 hidden h-5 w-px bg-border sm:block" />
          <span
            data-slot="portal-company"
            className="order-1 hidden min-w-0 truncate text-[13.5px] text-muted-foreground sm:block"
            title={portalLine}
          >
            {portalLine}
          </span>
          {projectMenu || styleSwitch ? (
            // Second row at 390 px (order-3, full width); inline from 640 px.
            <div className="order-3 flex w-full min-w-0 items-center gap-3 sm:order-1 sm:w-auto sm:flex-1">
              <div className="flex min-w-0 flex-1 sm:flex-none">{projectMenu ?? null}</div>
              <span aria-hidden="true" className="hidden flex-1 sm:block" />
              {styleSwitch ?? null}
            </div>
          ) : (
            <span aria-hidden="true" className="order-1 flex-1" />
          )}
          {clientName ? (
            <div className="order-2 ml-auto flex min-w-0 items-center gap-3 sm:ml-0">
              <span className="flex min-w-0 items-center gap-2 text-[13px]">
                <span
                  aria-hidden="true"
                  className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground"
                >
                  {portalInitials(clientName)}
                </span>
                <span className="sr-only truncate sm:not-sr-only" title={clientName}>
                  {clientName}
                </span>
              </span>
              {/* Plain anchor, not next/link: a prefetch of the logout route would sign the client out. */}
              <PortalSignOutLink
                href={PORTAL_SIGN_OUT_URL}
                className="inline-flex min-h-11 items-center text-[13px] text-muted-foreground hover:text-foreground"
              >
                {PORTAL_SHELL_COPY.salir}
              </PortalSignOutLink>
            </div>
          ) : null}
        </div>
      </header>
      <main className="flex w-full min-w-0 flex-1 flex-col">{children}</main>
    </div>
  );
}
