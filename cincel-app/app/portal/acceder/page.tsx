import type { Metadata } from "next";
import Link from "next/link";

import { Alert, AlertDescription } from "@/components/ui/shadcn/alert";
import { Button, buttonVariants } from "@/components/ui/shadcn/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/shadcn/card";
import { PORTAL_LOGIN_ROUTE } from "@/lib/auth/public-routes";
import { PORTAL_LINK_INVALID_MESSAGE } from "@/lib/portal/auth-flow";
import { cn } from "@/lib/utils";

/** Only this POST consumes the link (#506). */
const PORTAL_VERIFY_ENDPOINT = "/api/portal/auth/verify";

/** The token is in the URL: never send it on as a Referer. */
export const metadata: Metadata = { referrer: "no-referrer" };

type PortalAccessPageProps = {
  searchParams: Promise<{ token?: string | string[] }>;
};

/**
 * `/portal/acceder?token=` (#534), the page the sign-in email links to. It only renders a form; the client
 * signs in by pressing **Entrar al portal**, which posts the token to the verify route (303 to the portal,
 * or to `/portal/login?error=link`). Nothing submits on load, so mail link scanners can't spend the token.
 */
export default async function PortalAccessPage({ searchParams }: PortalAccessPageProps) {
  const raw = (await searchParams).token;
  const token = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";

  return (
    <Card className="mx-auto w-full max-w-md">
      <CardHeader>
        <CardTitle>Entrar al portal</CardTitle>
        <CardDescription>
          {token ? "Presiona el botón para entrar con este enlace." : "Este enlace no está completo."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {token ? (
          <form method="post" action={PORTAL_VERIFY_ENDPOINT}>
            <input type="hidden" name="token" value={token} />
            <Button type="submit" size="lg" className="min-h-11 w-full">
              Entrar al portal
            </Button>
          </form>
        ) : (
          <>
            <Alert variant="destructive">
              <AlertDescription>{PORTAL_LINK_INVALID_MESSAGE}</AlertDescription>
            </Alert>
            <Link href={PORTAL_LOGIN_ROUTE} className={cn(buttonVariants({ variant: "outline", size: "lg" }), "min-h-11 w-full")}>
              Pedir un enlace nuevo
            </Link>
          </>
        )}
      </CardContent>
    </Card>
  );
}
