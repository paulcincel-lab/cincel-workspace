"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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

export default function DrivePickerDialog({ open, onClose, onPick, rootFolderId }: Props) {
  const [path, setPath] = useState<Crumb[]>([]);
  const [entries, setEntries] = useState<DrivePickerEntry[]>([]);
  const [selected, setSelected] = useState<DrivePickerEntry | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  if (!open) return null;

  const openFolder = (entry: DrivePickerEntry) => {
    setSearch("");
    setPath((p) => [...p, { id: entry.id, name: entry.name }]);
  };
  const goToCrumb = (index: number) => {
    setSearch("");
    setPath((p) => (index < 0 ? [] : p.slice(0, index + 1)));
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <div className="flex h-[80vh] w-full max-w-3xl flex-col rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 p-4">
          <h3 className="text-base font-semibold text-slate-900">Elegir de Google Drive</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            Cerrar
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-2 text-sm">
          <button type="button" onClick={() => goToCrumb(-1)} className="font-medium text-blue-700 hover:underline">
            Inicio
          </button>
          {path.map((crumb, i) => (
            <span key={crumb.id} className="flex items-center gap-2">
              <span className="text-slate-400">/</span>
              <button
                type="button"
                onClick={() => goToCrumb(i)}
                className="text-blue-700 hover:underline"
              >
                {crumb.name}
              </button>
            </span>
          ))}
        </div>

        <div className="border-b border-slate-100 p-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre…"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <p className="p-4 text-sm text-slate-500">Cargando…</p>
          ) : error ? (
            <p className="p-4 text-sm text-red-600">{error}</p>
          ) : entries.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">Carpeta vacía.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {entries.map((entry) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    onClick={() => (entry.isFolder ? openFolder(entry) : setSelected(entry))}
                    onDoubleClick={() => !entry.isFolder && onPick(entry)}
                    className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                      selected?.id === entry.id ? "bg-blue-50" : ""
                    }`}
                  >
                    {entry.iconLink ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={entry.iconLink} alt="" className="h-4 w-4 shrink-0" />
                    ) : (
                      <span className="text-slate-400">{entry.isFolder ? "📁" : "📄"}</span>
                    )}
                    <span className="flex-1 truncate text-slate-800">{entry.name}</span>
                    {entry.isFolder ? (
                      <span className="text-xs text-slate-400">›</span>
                    ) : (
                      <span className="text-xs text-slate-400">{formatModified(entry.modifiedTime)}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 p-4">
          <span className="truncate text-sm text-slate-500">
            {selected ? `Seleccionado: ${selected.name}` : "Selecciona un archivo"}
          </span>
          <button
            type="button"
            disabled={!selected}
            onClick={() => selected && onPick(selected)}
            className={`rounded-lg px-4 py-2 text-sm font-medium text-white ${
              selected ? "bg-blue-600 hover:bg-blue-700" : "cursor-not-allowed bg-slate-300"
            }`}
          >
            Usar este archivo
          </button>
        </div>
      </div>
    </div>
  );
}
