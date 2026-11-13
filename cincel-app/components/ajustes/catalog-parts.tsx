"use client";

import { useId, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { PlusIcon } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/shadcn/alert";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/shadcn/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/shadcn/tooltip";
import { cn } from "@/lib/utils";

/**
 * Shared parts of the Ajustes catalogs (Estatus, Puestos, Etapas y fases):
 * the list header, the "•••" row menu, the inline add row, the "Nuevo" pill
 * and the editor footer. One layout for every presentation style.
 */

/** How long a new row keeps its "Nuevo" pill: 24 h from `createdAt`. */
export const NEW_PILL_MS = 24 * 60 * 60 * 1000;

/** True for a row created less than 24 h ago. */
export function isRecentlyCreated(createdAt: string | null | undefined, now: number = Date.now()): boolean {
  if (!createdAt) return false;
  const at = Date.parse(createdAt);
  return Number.isFinite(at) && now - at >= 0 && now - at < NEW_PILL_MS;
}

/** List header: `<h2>` 15 px / 600 + Geist Mono count badge, a 13 px description and the create button on the right. */
export function CatalogListHeader({
  id,
  title,
  count,
  description,
  action,
}: {
  id: string;
  title: string;
  count?: number;
  description: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex items-center gap-2">
          <h2 id={id} className="text-[15px] font-semibold text-foreground">
            {title}
          </h2>
          {count !== undefined ? (
            <Badge variant="count" aria-label={`${count} en total`}>
              {count}
            </Badge>
          ) : null}
        </div>
        <p className="text-[13px] text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}

/** The default "create" button of a list header, with its plus icon. */
export function CatalogCreateButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button type="button" onClick={onClick}>
      <PlusIcon aria-hidden="true" />
      {label}
    </Button>
  );
}

/** The `--secondary` "Nuevo" pill. */
export function NewPill({ label = "Nuevo" }: { label?: string }) {
  return <Badge variant="secondary">{label}</Badge>;
}

/** Right-aligned Geist Mono number. */
export function MonoCount({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("block text-right font-mono text-[13px] tabular-nums", className)}>{children}</span>;
}

export type CatalogRowAction = {
  label: string;
  onSelect: () => void;
  destructive?: boolean;
  /** Why the action can't be used; the item is disabled and this shows as its tooltip. */
  disabledReason?: string | null;
};

/**
 * The row's "•••" menu (`aria-label="Acciones de {nombre}"`). `actionId`
 * goes on the trigger as `data-catalog-action`, so the editor can return
 * focus to it on close (`catalogActionTrigger`).
 */
export function CatalogRowMenu({
  name,
  actionId,
  actions,
}: {
  name: string;
  actionId: string;
  actions: CatalogRowAction[];
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        data-catalog-action={actionId}
        aria-label={`Acciones de ${name}`}
        onClick={(event: MouseEvent) => event.stopPropagation()}
        className="inline-flex size-7 items-center justify-center rounded-md text-sm tracking-widest text-muted-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span aria-hidden="true">•••</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {actions.map((action, index) => {
          const item = (
            <DropdownMenuItem
              key={action.label}
              variant={action.destructive ? "destructive" : "default"}
              disabled={Boolean(action.disabledReason)}
              onClick={(event: MouseEvent) => {
                event.stopPropagation();
                if (!action.disabledReason) action.onSelect();
              }}
            >
              {action.label}
            </DropdownMenuItem>
          );
          return (
            <div key={action.label}>
              {action.destructive && index > 0 ? <DropdownMenuSeparator /> : null}
              {action.disabledReason ? (
                <Tooltip>
                  <TooltipTrigger render={<div />}>{item}</TooltipTrigger>
                  <TooltipContent>{action.disabledReason}</TooltipContent>
                </Tooltip>
              ) : (
                item
              )}
            </div>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The "•••" trigger of a row, to give focus back to it when its editor closes. */
export function catalogActionTrigger(actionId: string | null | undefined): HTMLElement | null {
  if (!actionId || typeof document === "undefined") return null;
  const escaped = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(actionId) : actionId.replace(/"/g, '\\"');
  return document.querySelector<HTMLElement>(`[data-catalog-action="${escaped}"]`);
}

/**
 * Inline add row at the end of a list: plus icon + input. Enter calls
 * `onCreate` with the trimmed text (and clears it once it resolves; the text
 * stays when it throws), Escape clears it.
 */
export function CatalogInlineAdd({
  label,
  placeholder,
  onCreate,
  disabled = false,
  className,
}: {
  label: string;
  placeholder: string;
  onCreate: (text: string) => Promise<unknown> | unknown;
  disabled?: boolean;
  className?: string;
}) {
  const id = useId();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      if (text) {
        event.preventDefault();
        event.stopPropagation();
      }
      setText("");
      return;
    }
    if (event.key !== "Enter" || busy || disabled) return;
    event.preventDefault();
    const value = text.trim();
    if (!value) return;
    setBusy(true);
    try {
      await onCreate(value);
      setText("");
    } catch {
      // The caller shows the error; the text stays so it can be fixed.
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cn("flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground", className)}>
      <PlusIcon aria-hidden="true" className="size-4 shrink-0" />
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={text}
        placeholder={placeholder}
        disabled={disabled || busy}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => void onKeyDown(event)}
        className="h-8 min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-0"
      />
    </div>
  );
}

/**
 * Editor footer: destructive action at the bottom left, ghost "Cancelar" and
 * the default save button on the right, and the save error as a destructive
 * `Alert` above them.
 */
export function CatalogPanelFooter({
  onCancel,
  saveLabel = "Guardar",
  saving = false,
  canSave = true,
  formId,
  onSave,
  error,
  destructive,
}: {
  onCancel: () => void;
  saveLabel?: string;
  saving?: boolean;
  canSave?: boolean;
  /** Submits this form; else `onSave` runs on click. */
  formId?: string;
  onSave?: () => void;
  error?: string | null;
  destructive?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>{destructive}</div>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
          {canSave ? (
            <Button
              type={formId ? "submit" : "button"}
              form={formId}
              disabled={saving}
              onClick={formId ? undefined : onSave}
            >
              {saving ? "Guardando…" : saveLabel}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** The `row-new` flash class for a row created in this session. */
export function rowNewClass(id: string, flashed: ReadonlySet<string>): string | undefined {
  return flashed.has(id) ? "row-new" : undefined;
}

/** Ids of rows created here, for `row-new`; each id stops flashing after 1.6 s. */
export function useFlashedRows() {
  const [flashed, setFlashed] = useState<ReadonlySet<string>>(() => new Set());
  function flash(id: string) {
    setFlashed((current) => new Set(current).add(id));
    setTimeout(() => {
      setFlashed((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }, 1600);
  }
  return { flashed, flash };
}
