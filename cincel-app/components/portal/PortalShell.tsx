import type { ReactNode } from "react";
import Link from "next/link";
import { LogOut } from "lucide-react";

import { buttonVariants } from "@/components/ui/shadcn/button";
import { Separator } from "@/components/ui/shadcn/separator";
import { PORTAL_LOGIN_ROUTE, PORTAL_ROUTE } from "@/lib/auth/public-routes";
import { cn } from "@/lib/utils";

/** GET logout route (BE §B.4.2): clears the portal cookie and session, then redirects to the portal sign-in. */
export const PORTAL_SIGN_OUT_URL = `/api/portal/auth/logout?next=${encodeURIComponent(PORTAL_LOGIN_ROUTE)}`;

type PortalShellProps = {
  /** Signed-in client's name; `null` on the public portal pages (sign-in, magic-link landing). */
  clientName: string | null;
  /** Redesign on (FE §3.11): weights stay at 600 or below. Omitted, the shell renders exactly as before. */
  redesign?: boolean;
  /**
   * Row under the top bar for `EstiloSwitch scope="portal"` (redesign on, signed in), so the header never scrolls
   * sideways at 390 px.
   */
  styleSwitch?: ReactNode;
  children: ReactNode;
};

/**
 * Minimal portal frame (FE §3): logo, client name and **Salir**. Mobile-first, one column, `max-w-3xl`.
 * It never reads staff data, so it is safe for every `/portal` page.
 */
export default function PortalShell({ clientName, redesign = false, styleSwitch, children }: PortalShellProps) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Link href={PORTAL_ROUTE} className="flex min-h-11 min-w-0 flex-col justify-center" aria-label="Cincel, inicio del portal">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Cincel</span>
            <span className={cn("text-lg leading-none tracking-tight", redesign ? "font-semibold" : "font-extrabold")}>
              Portal de clientes
            </span>
          </Link>
          {clientName ? (
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate text-sm text-muted-foreground" title={clientName}>
                {clientName}
              </span>
              <Separator orientation="vertical" className="h-6" />
              {/* Plain anchor, not next/link: a prefetch of the logout route would sign the client out. */}
              <a href={PORTAL_SIGN_OUT_URL} className={cn(buttonVariants({ variant: "ghost", size: "lg" }), "min-h-11")}>
                <LogOut aria-hidden="true" />
                Salir
              </a>
            </div>
          ) : null}
        </div>
        {styleSwitch ?? null}
      </header>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-6">{children}</main>
    </div>
  );
}
