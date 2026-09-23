"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/shadcn/button";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/shadcn/sheet";
import { Input } from "@/components/ui/shadcn/input";

export type DrivePickerEntry = {
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

type Props = {
  open: boolean;
  onClose: () => void;
  onPick: (entry: DrivePickerEntry) => void;
  /** Starting folder; when omitted the server's GOOGLE_DRIVE_ROOT_FOLDER_ID is used. */
  rootFolderId?: string;
};

function formatModified(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
}

type AccountStatus = { oauthAvailable: boolean; connectedEmail: string | null };

export default function DrivePickerDialog({ open, onClose, onPick, rootFolderId }: Props) {
  const [path, setPath] = useState<Crumb[]>([]);
  const [entries, setEntries] = useState<DrivePickerEntry[]>([]);
  const [selected, setSelected] = useState<DrivePickerEntry | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [account, setAccount] = useState<AccountStatus | null>(null);
  const [switchingAccount, setSwitchingAccount] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadAccountStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/google/drive/status");
      const body = await res.json().catch(() => ({}));
      setAccount({ oauthAvailable: Boolean(body?.oauthAvailable), connectedEmail: body?.connectedEmail ?? null });
    } catch {
      setAccount(null);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open) void loadAccountStatus();
  }, [open, loadAccountStatus]);

  const connectGoogleAccount = () => {
    const returnTo = `${window.location.pathname}${window.location.search}`;
    window.location.href = `/api/google/oauth/start?return_to=${encodeURIComponent(returnTo)}`;
  };

  const disconnectGoogleAccount = async () => {
    setSwitchingAccount(true);
    try {
      await fetch("/api/google/oauth/disconnect", { method: "POST" });
      await loadAccountStatus();
      setPath([]);
      setSearch("");
    } finally {
      setSwitchingAccount(false);
    }
  };

  const currentFolderId = path.length > 0 ? path[path.length - 1].id : rootFolderId;

  const load = useCallback(
    async (folderId: string | undefined, query: string) => {
      setLoading(true);
      setError(null);
      setSelected(null);
      try {
        const params = new URLSearchParams();
        if (folderId) params.set("folderId", folderId);
        if (query.trim()) params.set("q", query.trim());
        const res = await fetch(`/api/google/drive/list?${params}`);
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          setEntries([]);
          setError(body.error ?? `Error ${res.status}`);
          return;
        }
        setEntries(body.entries ?? []);
      } catch {
        setEntries([]);
        setError("No se pudo contactar el servidor.");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // (re)load when opened or when the folder / debounced search changes
  useEffect(() => {
    if (!open) return;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(
      () => void load(currentFolderId, search),
      search ? 350 : 0
    );
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, currentFolderId, search]);

  const openFolder = (entry: DrivePickerEntry) => {
    setSearch("");
    setPath((p) => [...p, { id: entry.id, name: entry.name }]);
  };
  const goToCrumb = (index: number) => {
    setSearch("");
    setPath((p) => (index < 0 ? [] : p.slice(0, index + 1)));
  };

  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <SheetContent className="w-[720px] max-w-[720px]" showCloseButton={false}>
        <SheetHeader className="flex-row items-center justify-between space-y-0 border-b border-border p-4">
          <SheetTitle className="text-base font-semibold">Elegir de Google Drive</SheetTitle>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cerrar
          </Button>
        </SheetHeader>

        {account?.oauthAvailable ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
            {account.connectedEmail ? (
              <>
                <span>
                  Conectado como <span className="font-medium text-foreground">{account.connectedEmail}</span>
                </span>
                <span className="flex gap-2">
                  <Button variant="link" className="h-auto p-0 text-xs" onClick={connectGoogleAccount}>
                    Cambiar cuenta
                  </Button>
                  <Button
                    variant="link"
                    className="h-auto p-0 text-xs text-destructive"
                    disabled={switchingAccount}
                    onClick={() => void disconnectGoogleAccount()}
                  >
                    Desconectar
                  </Button>
                </span>
              </>
            ) : (
              <>
                <span>Usando el correo institucional. Puedes conectar tu propia cuenta de Google.</span>
                <Button variant="link" className="h-auto p-0 text-xs" onClick={connectGoogleAccount}>
                  Conectar cuenta de Google
                </Button>
              </>
            )}
          </div>
        ) : null}

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
                      selected?.id === entry.id ? "bg-accent" : ""
                    }`}
                    onClick={() => (entry.isFolder ? openFolder(entry) : setSelected(entry))}
                    onDoubleClick={() => !entry.isFolder && onPick(entry)}
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

        <SheetFooter className="mt-0 flex-row items-center justify-between border-t border-border p-4">
          <span className="truncate text-sm text-muted-foreground">
            {selected ? `Seleccionado: ${selected.name}` : "Selecciona un archivo"}
          </span>
          <Button disabled={!selected} onClick={() => selected && onPick(selected)}>
            Usar este archivo
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
