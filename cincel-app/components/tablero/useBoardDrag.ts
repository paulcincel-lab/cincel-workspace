"use client";

import { useState, type DragEvent } from "react";

/** What a board card spreads onto its root element. */
export type BoardCardDragProps = { draggable: boolean; onDragStart(): void; onDragEnd(): void };

/**
 * Drag-and-drop between board columns, shared by the legacy `/tablero` page
 * and `TaskBoardWidget`. Tracks the card being dragged and the column under
 * it; dropping hands `(taskId, columnKey)` to `onDrop`, which decides what a
 * move means (server-confirmed on the legacy page, optimistic in the widget).
 */
export function useBoardDrag<T extends { id: string }>({
  canDrag,
  onDrop,
}: {
  canDrag(task: T): boolean;
  onDrop(taskId: string, columnKey: string): void | Promise<void>;
}) {
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  function cardProps(task: T): BoardCardDragProps {
    const draggable = canDrag(task);
    return {
      draggable,
      onDragStart: () => {
        if (!draggable) return;
        setDraggingTaskId(task.id);
      },
      onDragEnd: () => {
        setDraggingTaskId(null);
        setDragOverKey(null);
      },
    };
  }

  function columnProps(key: string) {
    return {
      onDragOver: (e: DragEvent) => {
        if (!draggingTaskId) return;
        e.preventDefault();
        setDragOverKey(key);
      },
      onDragLeave: () => setDragOverKey((cur) => (cur === key ? null : cur)),
      onDrop: (e: DragEvent) => {
        e.preventDefault();
        const taskId = draggingTaskId;
        setDraggingTaskId(null);
        setDragOverKey(null);
        if (!taskId) return;
        void onDrop(taskId, key);
      },
    };
  }

  return { draggingTaskId, dragOverKey, cardProps, columnProps };
}
