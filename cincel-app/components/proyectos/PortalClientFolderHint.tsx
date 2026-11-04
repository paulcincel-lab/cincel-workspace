"use client";

import { useEffect, useState } from "react";
import { FolderOpen, Info } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/shadcn/alert";
import { Button, buttonVariants } from "@/components/ui/shadcn/button";
import { getProjectClientFolderUrlAction } from "@/lib/actions/portal-actions";

const HINT = "Todo lo que pongas en 02 Cliente lo verán los clientes invitados a este proyecto.";
const OPEN_LABEL = "Abrir carpeta del cliente en Drive";
const MISSING = "La carpeta del cliente todavía no existe en Drive.";

/** Clientes tab hint (FE §2.4): what clients see, plus a link to the project's "02 Cliente" folder. */
export function PortalClientFolderHint({ projectId }: { projectId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getProjectClientFolderUrlAction(projectId)
      .then((next) => {
        if (!cancelled) setUrl(next);
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  return (
    <Alert>
      <Info />
      <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <span>{HINT}</span>
        {url ? (
          <a href={url} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline", size: "sm" })}>
            <FolderOpen />
            {OPEN_LABEL}
          </a>
        ) : (
          <Button variant="outline" size="sm" disabled title={loaded ? MISSING : undefined}>
            <FolderOpen />
            {OPEN_LABEL}
          </Button>
        )}
      </AlertDescription>
      {loaded && !url ? <AlertDescription>{MISSING}</AlertDescription> : null}
    </Alert>
  );
}
