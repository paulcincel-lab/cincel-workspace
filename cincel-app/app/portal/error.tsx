"use client";

import Link from "next/link";

import { Button, buttonVariants } from "@/components/ui/shadcn/button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/shadcn/card";
import { PORTAL_ROUTE } from "@/lib/auth/public-routes";

type PortalErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

/** Portal error boundary (FE §3.4), in Spanish and inside the portal shell. Never shows the error message. */
export default function PortalError({ error, reset }: PortalErrorProps) {
  return (
    <Card className="w-full" role="alert">
      <CardHeader>
        <CardTitle>
          <h1>Algo salió mal</h1>
        </CardTitle>
        <CardDescription>
          No pudimos cargar esta página. Inténtalo de nuevo en unos minutos.
          {error.digest ? ` Referencia: ${error.digest}` : null}
        </CardDescription>
      </CardHeader>
      <CardFooter className="flex flex-wrap gap-2">
        <Button onClick={() => reset()}>Intentar de nuevo</Button>
        <Link href={PORTAL_ROUTE} className={buttonVariants({ variant: "outline" })}>
          Volver a mis proyectos
        </Link>
      </CardFooter>
    </Card>
  );
}
