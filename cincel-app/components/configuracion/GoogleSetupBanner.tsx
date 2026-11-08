"use client";

import { useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";

import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/shadcn/alert";
import { Button } from "@/components/ui/shadcn/button";
import { FIRST_LOGIN_WIZARD_ROUTES } from "@/lib/onboarding/first-login";

/**
 * Inicio banner for the bootstrap admin after skipping the Google setup wizard (#671), shown while no Workspace
 * group is mapped. Closing it hides it until the next page load.
 */
export function GoogleSetupBanner() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  const wizardRoute = FIRST_LOGIN_WIZARD_ROUTES.google_groups ?? "/ajustes/google";

  return (
    <Alert className="mb-6">
      <AlertTitle>Nadie puede entrar con Google todavía</AlertTitle>
      <AlertDescription>
        No hay grupos de Google asignados.{" "}
        <Link href={wizardRoute} className="underline underline-offset-4">
          Configurar grupos de Google
        </Link>
      </AlertDescription>
      <AlertAction>
        <Button variant="ghost" size="icon-sm" aria-label="Cerrar aviso" onClick={() => setDismissed(true)}>
          <X aria-hidden="true" />
        </Button>
      </AlertAction>
    </Alert>
  );
}
