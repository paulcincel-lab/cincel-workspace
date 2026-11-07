import Link from "next/link";
import { Link2Off } from "lucide-react";

import { buttonVariants } from "@/components/ui/shadcn/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/shadcn/card";
import { PORTAL_ROUTE } from "@/lib/auth/public-routes";
import { cn } from "@/lib/utils";

export const PORTAL_NOT_FOUND_TITLE = "No encontramos esta página";
export const PORTAL_NOT_FOUND_DESCRIPTION =
  "Puede que el enlace sea incorrecto o que ya no tengas acceso a este proyecto.";
export const PORTAL_NOT_FOUND_BACK_LABEL = "Volver a mis proyectos";
export const PORTAL_NOT_FOUND_HELP = "¿Necesitas ayuda? Escríbele a tu contacto en Cincel.";

type PortalNotFoundViewProps = {
  /** Organization redesign on: the restyled card of canvas `Portal404`. Off: today's card, unchanged. */
  redesign: boolean;
};

/** Portal 404 (FE §3.4, §3.11): unknown pages and projects the client can't see; rendered inside the portal shell. */
export default function PortalNotFoundView({ redesign }: PortalNotFoundViewProps) {
  if (!redesign) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>
            <h1>{PORTAL_NOT_FOUND_TITLE}</h1>
          </CardTitle>
          <CardDescription>{PORTAL_NOT_FOUND_DESCRIPTION}</CardDescription>
        </CardHeader>
        <CardFooter>
          <Link href={PORTAL_ROUTE} className={buttonVariants()}>
            {PORTAL_NOT_FOUND_BACK_LABEL}
          </Link>
        </CardFooter>
      </Card>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center py-6">
      <Card className="w-full max-w-md text-center">
        <CardHeader className="justify-items-center gap-3">
          <span className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Link2Off aria-hidden="true" className="size-6" />
          </span>
          <p className="font-mono text-xs text-muted-foreground">Error 404</p>
          <CardTitle>
            <h1 className="text-xl font-semibold tracking-tight">{PORTAL_NOT_FOUND_TITLE}</h1>
          </CardTitle>
          <CardDescription>{PORTAL_NOT_FOUND_DESCRIPTION}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Link href={PORTAL_ROUTE} className={cn(buttonVariants({ size: "lg" }), "min-h-11 w-full")}>
            {PORTAL_NOT_FOUND_BACK_LABEL}
          </Link>
          <p className="text-sm text-muted-foreground">{PORTAL_NOT_FOUND_HELP}</p>
        </CardContent>
      </Card>
    </div>
  );
}
