"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";

/** "{nombre} movido a la posición {n} de {total}" (the live announcement after each move and on drop). */
export function movedAnnouncement(label: string, position: number, total: number): string {
  return `${label} movido a la posición ${position} de ${total}`;
}

/** Moves `id` one step up (-1) or down (+1) in `order`; the same array when it can't move. */
export function moveId(order: readonly string[], id: string, delta: -1 | 1): string[] {
  const from = order.indexOf(id);
  const to = from + delta;
  if (from === -1 || to < 0 || to >= order.length) return [...order];
  const next = [...order];
  next.splice(to, 0, next.splice(from, 1)[0]);
  return next;
}

export type KeyboardReorderOptions = {
  /** Every row id, in the order shown. */
  ids: readonly string[];
  /** The row's name, for "Mover {nombre}" and the announcements. */
  labelOf: (id: string) => string;
  /** Called once on drop with the new order, only when it changed. */
  onReorder: (orderedIds: string[]) => void;
};

/**
 * Keyboard reorder for a list of drag handles (Ajustes catalogs, `DataTable`'s
 * `onReorderRows`): Space lifts the focused row, ↑ / ↓ move it, Space drops it
 * (the new order is reported once), Escape puts it back. While a row is
 * lifted, `order` is the preview order to render. Every move and the drop are
 * announced in `announcement`, to render in an `aria-live="polite"` region.
 */
export function useKeyboardReorder({ ids, labelOf, onReorder }: KeyboardReorderOptions) {
  const [liftedId, setLiftedId] = useState<string | null>(null);
  const [preview, setPreview] = useState<string[] | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const handles = useRef(new Map<string, HTMLElement>());
  const order = preview ?? [...ids];

  // A moved row is re-inserted in the DOM, which can drop focus: keep it on the lifted handle.
  useEffect(() => {
    if (!liftedId) return;
    const handle = handles.current.get(liftedId);
    if (handle && document.activeElement !== handle) handle.focus();
  }, [liftedId, preview]);

  const cancel = useCallback(() => {
    setLiftedId(null);
    setPreview(null);
  }, []);

  function onKeyDown(id: string, event: KeyboardEvent<HTMLElement>) {
    const label = labelOf(id);
    if (event.key === " " || event.key === "Spacebar") {
      event.preventDefault();
      event.stopPropagation();
      if (liftedId === null) {
        setLiftedId(id);
        setPreview([...ids]);
        setAnnouncement(`${label} levantado. Usa las flechas para moverlo y Espacio para soltarlo.`);
        return;
      }
      const final = preview ?? [...ids];
      const position = final.indexOf(liftedId) + 1;
      const changed = final.some((value, index) => value !== ids[index]);
      setAnnouncement(movedAnnouncement(labelOf(liftedId), position, final.length));
      cancel();
      if (changed) onReorder(final);
      return;
    }
    if (liftedId === null) return;
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      event.stopPropagation();
      const next = moveId(order, liftedId, event.key === "ArrowUp" ? -1 : 1);
      setPreview(next);
      setAnnouncement(movedAnnouncement(labelOf(liftedId), next.indexOf(liftedId) + 1, next.length));
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setAnnouncement(`${labelOf(liftedId)} vuelve a su lugar.`);
      cancel();
    }
  }

  /** Props of one row's drag handle button. */
  function handleProps(id: string) {
    return {
      "aria-label": `Mover ${labelOf(id)}`,
      "aria-pressed": liftedId === id,
      ref: (node: HTMLElement | null) => {
        if (node) handles.current.set(id, node);
        else handles.current.delete(id);
      },
      onKeyDown: (event: KeyboardEvent<HTMLElement>) => onKeyDown(id, event),
    };
  }

  return { order, liftedId, announcement, handleProps, cancel };
}
