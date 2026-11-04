"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/shadcn/alert";
import { Button } from "@/components/ui/shadcn/button";
import { Input } from "@/components/ui/shadcn/input";

export type DriveBrowserEntry = {
  id: string;
  name: string;
  mimeType: string;
  iconLink: string | null;
  thumbnailLink: string | null;
  webViewLink: string;
  modifiedTime: string | null;
  isFolder: boolean;
};

type Crumb = { id: string; name: string };
type AccountStatus = { hasDriveGrant: boolean };

type Props = {
  /** Only loads while true (a closed sheet shouldn't fetch). */
  active: boolean;
  /** Starting folder; when omitted the server's GOOGLE_DRIVE_ROOT_FOLDER_ID is used. */
  rootFolderId?: string;
  /** Highlighted file, controlled by the parent. */
  selectedId?: string | null;
  onFileClick?: (entry: DriveBrowserEntry) => void;
  onFileDoubleClick?: (entry: DriveBrowserEntry) => void;
  /** Fires whenever the visible folder or search changes, so a parent can clear its selection. */
  onNavigate?: () => void;
};

function formatModified(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
}

/** Incremental Drive consent; Google sends the staff member back to the current page. */
export function driveConsentUrl(returnTo: string): string {
  return `/api/auth/google/start?scope=drive&return_to=${encodeURIComponent(returnTo)}`;
}

/**
 * Browse Drive — folder navigation and search. Shared by the Drive picker
 * sheet and Recursos' inline Drive view. It always uses the staff member's own
 * Google grant (`GET /api/google/drive/status`): without it, or on a 403
 * `needs_consent` from the list route, the browser shows **Conectar Google Drive**.
 */
export default function DriveBrowser({
  active,
  rootFolderId,
  selectedId,
  onFileClick,
  onFileDoubleClick,
  onNavigate,
}: Props) {
  const [path, setPath] = useState<Crumb[]>([]);
  const [entries, setEntries] = useState<DriveBrowserEntry[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [account, setAccount] = useState<AccountStatus | null>(null);
  const [needsConsent, setNeedsConsent] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentFolderId = path.length > 0 ? path[path.length - 1].id : rootFolderId;

  const loadAccountStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/google/drive/status");
      if (!res.ok) {
        setAccount(null);
        return;
      }
      const body = await res.json().catch(() => ({}));
      setAccount({ hasDriveGrant: Boolean(body?.hasDriveGrant) });
    } catch {
      setAccount(null);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (active) void loadAccountStatus();
  }, [active, loadAccountStatus]);

  const connectGoogleDrive = () => {
    window.location.href = driveConsentUrl(`${window.location.pathname}${window.location.search}`);
  };

  const load = useCallback(
    async (folderId: string | undefined, query: string) => {
      setLoading(true);
      setError(null);
      onNavigate?.();
      try {
        const params = new URLSearchParams();
        if (folderId) params.set("folderId", folderId);
        if (query.trim()) params.set("q", query.trim());
        const res = await fetch(`/api/google/drive/list?${params}`);
        const body = await res.json().catch(() => ({}));
        if (res.status === 403 && body?.error === "needs_consent") {
          setEntries([]);
          setNeedsConsent(true);
          return;
        }
        if (!res.ok) {
          setEntries([]);
          setError(body.error ?? `Error ${res.status}`);
          return;
        }
        setNeedsConsent(false);
        setEntries(body.entries ?? []);
      } catch {
        setEntries([]);
        setError("No se pudo contactar el servidor.");
      } finally {
        setLoading(false);
      }
    },
    [onNavigate]
  );

  // (re)load when activated or when the folder / debounced search changes
  useEffect(() => {
    if (!active) return;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => void load(currentFolderId, search), search ? 350 : 0);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, currentFolderId, search]);

  const openFolder = (entry: DriveBrowserEntry) => {
    setSearch("");
    setPath((p) => [...p, { id: entry.id, name: entry.name }]);
  };
  const goToCrumb = (index: number) => {
    setSearch("");
    setPath((p) => (index < 0 ? [] : p.slice(0, index + 1)));
  };

  if (needsConsent || account?.hasDriveGrant === false) {
    return (
      <div className="flex min-h-0 flex-1 flex-col p-4">
        <Alert>
          <AlertTitle>Conecta tu Google Drive</AlertTitle>
          <AlertDescription>
            Para ver tus archivos aquí, da permiso de solo lectura a tu Google Drive.
          </AlertDescription>
        </Alert>
        <div className="pt-3">
          <Button onClick={connectGoogleDrive}>Conectar Google Drive</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2 text-sm">
        <Button variant="link" className="h-auto p-0 font-medium" onClick={() => goToCrumb(-1)}>
          Inicio
        </Button>
        {path.map((crumb, i) => (
          <span key={crumb.id} className="flex items-center gap-2">
            <span className="text-muted-foreground">/</span>
            <Button variant="link" className="h-auto p-0" onClick={() => goToCrumb(i)}>
              {crumb.name}
            </Button>
          </span>
        ))}
      </div>

      <div className="border-b border-border p-3">
        <Input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre…"
        />
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <p className="p-4 text-sm text-muted-foreground">Cargando…</p>
        ) : error ? (
          <p className="p-4 text-sm text-destructive">{error}</p>
        ) : entries.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">Carpeta vacía.</p>
        ) : (
          <ul className="divide-y divide-border">
            {entries.map((entry) => (
              <li key={entry.id}>
                <Button
                  variant="ghost"
                  className={`h-auto w-full justify-start gap-3 px-3 py-2 text-left text-sm font-normal ${
                    selectedId === entry.id ? "bg-accent" : ""
                  }`}
                  onClick={() => (entry.isFolder ? openFolder(entry) : onFileClick?.(entry))}
                  onDoubleClick={() => !entry.isFolder && onFileDoubleClick?.(entry)}
                >
                  {entry.iconLink ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={entry.iconLink} alt="" className="h-4 w-4 shrink-0" />
                  ) : (
                    <span className="text-muted-foreground">{entry.isFolder ? "📁" : "📄"}</span>
                  )}
                  <span className="flex-1 truncate text-foreground">{entry.name}</span>
                  {entry.isFolder ? (
                    <span className="text-xs text-muted-foreground">›</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">{formatModified(entry.modifiedTime)}</span>
                  )}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
