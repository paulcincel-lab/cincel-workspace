"use client";

import { useState } from "react";

import DrivePickerDialog from "@/components/recursos/DrivePickerDialog";
import { Button } from "@/components/ui/shadcn/button";
import { Input } from "@/components/ui/shadcn/input";
import { useDriveEnabled } from "@/lib/google/use-drive-enabled";
import { TASK_LINK_KIND_LABEL, normalizeTaskLinkUrl } from "@/lib/tasks/task-links";
import type { TaskLinkInput, TaskLinkKind } from "@/lib/types/core";

type Link = { id: string; kind: TaskLinkKind; title: string; url: string };

type Props = {
  links: Link[];
  /** Omit to render read-only. */
  onAdd?: (input: TaskLinkInput) => void;
  onRemove?: (linkId: string) => void;
};

/**
 * Links split into Interno / Cliente, with a form to add one by pasting a URL
 * (or picking it from Google Drive when that's available). Shared by the task
 * drawer and the project ficha.
 */
export function DriveLinksEditor({ links, onAdd, onRemove }: Props) {
  const [kind, setKind] = useState<TaskLinkKind>("interno");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [showDrivePicker, setShowDrivePicker] = useState(false);
  const driveEnabled = useDriveEnabled();

  const add = () => {
    if (!onAdd) return;
    if (!title.trim()) {
      setError("Escribe un nombre para el enlace.");
      return;
    }
    if (!normalizeTaskLinkUrl(url)) {
      setError("El enlace debe empezar con http:// o https://.");
      return;
    }
    setError("");
    onAdd({ kind, title: title.trim(), url: url.trim() });
    setTitle("");
    setUrl("");
  };

  return (
    <div className="space-y-4 rounded-2xl border border-border p-4">
      {(["interno", "cliente"] as const).map((group) => {
        const groupLinks = links.filter((l) => l.kind === group);
        return (
          <div key={group}>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              {TASK_LINK_KIND_LABEL[group]}
            </p>
            {groupLinks.length > 0 ? (
              <ul className="mt-2 space-y-1">
                {groupLinks.map((link) => (
                  <li key={link.id} className="flex items-center justify-between gap-2 text-sm">
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate text-foreground underline"
                      title={link.url}
                    >
                      {link.title}
                    </a>
                    {onRemove ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs text-muted-foreground hover:text-destructive"
                        onClick={() => onRemove(link.id)}
                      >
                        Quitar
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">Sin enlaces.</p>
            )}
          </div>
        );
      })}

      {onAdd ? (
        <div className="space-y-2 rounded-xl border border-dashed border-border p-3">
          <div className="flex gap-2">
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as TaskLinkKind)}
              aria-label="Tipo de enlace"
              className="h-8 rounded-lg border border-input bg-background px-2 text-sm"
            >
              <option value="interno">{TASK_LINK_KIND_LABEL.interno}</option>
              <option value="cliente">{TASK_LINK_KIND_LABEL.cliente}</option>
            </select>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Nombre del enlace"
              className="h-8 text-sm"
            />
          </div>
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://drive.google.com/…"
            className="h-8 text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
          />
          <div className="flex items-center justify-between">
            {driveEnabled ? (
              <Button variant="link" className="h-auto p-0 text-xs" onClick={() => setShowDrivePicker(true)}>
                Elegir de Google Drive
              </Button>
            ) : (
              <span />
            )}
            <Button variant="outline" size="sm" className="h-8" onClick={add}>
              Agregar enlace
            </Button>
          </div>
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </div>
      ) : null}

      <DrivePickerDialog
        open={showDrivePicker}
        onClose={() => setShowDrivePicker(false)}
        onPick={(entry) => {
          setTitle((cur) => cur.trim() || entry.name);
          setUrl(entry.webViewLink);
          setShowDrivePicker(false);
        }}
      />
    </div>
  );
}
