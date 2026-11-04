import Link from "next/link";

import { buttonVariants } from "@/components/ui/shadcn/button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/shadcn/card";
import { PORTAL_ROUTE } from "@/lib/auth/public-routes";

/** Portal 404 (FE §3.4): unknown pages and projects the client can't see; rendered inside the portal shell. */
export default function PortalNotFound() {
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>
          <h1>No encontramos esta página</h1>
        </CardTitle>
        <CardDescription>
          Puede que el enlace sea incorrecto o que ya no tengas acceso a este proyecto.
        </CardDescription>
      </CardHeader>
      <CardFooter>
        <Link href={PORTAL_ROUTE} className={buttonVariants()}>
          Volver a mis proyectos
        </Link>
      </CardFooter>
    </Card>
  );
}
