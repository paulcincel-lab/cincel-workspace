"use client";

import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";

import { Input } from "@/components/ui/shadcn/input";
import { createSubtaskAction } from "@/lib/actions/tasks-actions";
import { resolveActivitiesCapabilities } from "@/lib/auth/permissions";
import { useActionMutation } from "@/lib/query/mutation";
import { selectAuthenticatedUser, useSessionStore } from "@/lib/stores/session-store";
import type { SubtaskInput, TaskDetail } from "@/lib/types/core";

import { quickAddSubtaskInvalidations } from "./quick-add-create";
import { subtaskErrorMessage } from "./TaskSubtasks";

export const ADD_SUBTASK_PLACEHOLDER = "Agregar subtarea…";
export const ADD_SUBTASK_LINK = "+ Agregar subtarea";
export const ADD_SUBTASK_LABEL = "Título de la nueva subtarea";

/** Whether the viewer may create tasks (`activities.canCreateActivity`); the action re-checks it. */
export function useCanCreateSubtask(): boolean {
  const user = useSessionStore(selectAuthenticatedUser);
  return useMemo(() => (user ? resolveActivitiesCapabilities(user).canCreateActivity : false), [user]);
}

type Props = {
  /** The task that gets the subtask (a top-level task; a subtask answers `NESTED`). */
  parentId: string;
  /** The parent's project (its Tareas views refresh after a create). */
  projectId: string;
  /** `field`: the input is always shown. `link`: a "+ Agregar subtarea" link opens it. */
  variant?: "field" | "link";
  /** Focus the input on mount (`link` always does when it opens). */
  autoFocus?: boolean;
  /** Called after the subtask was created. */
  onCreated?(): void;
  className?: string;
};

/**
 * Adds the first subtask of a task without opening its sheet (#1107): Enter
 * creates through `createSubtaskAction` (the parent's project, etapa and
 * fase), Escape cancels. The new title shows as a pending line until the
 * parent's detail and lists refresh; `NESTED` and `FORBIDDEN` show under the
 * field.
 */
export function AddSubtaskInline({ parentId, projectId, variant = "field", autoFocus = false, onCreated, className }: Props) {
  const errorId = useId();
  const linkRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(variant === "field");
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");

  const create = useActionMutation<SubtaskInput, TaskDetail>(
    (input) => createSubtaskAction(parentId, input),
    {
      invalidate: () => quickAddSubtaskInvalidations(parentId, projectId),
      onFormError: () => undefined,
    },
  );

  const submit = async () => {
    const text = title.trim();
    if (!text || create.isPending) return;
    setError("");
    try {
      await create.mutateAsync({ title: text });
      setTitle("");
      onCreated?.();
    } catch (err) {
      setError(subtaskErrorMessage(err));
    }
  };

  const cancel = () => {
    setTitle("");
    setError("");
    if (variant === "link") {
      setOpen(false);
      // The link is back after this render; focus returns to it.
      requestAnimationFrame(() => linkRef.current?.focus());
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Enter") {
      event.preventDefault();
      void submit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      cancel();
    }
  };

  if (!open) {
    return (
      <button
        ref={linkRef}
        type="button"
        data-slot="add-subtask-link"
        onClick={() => setOpen(true)}
        className={`text-left text-xs text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring ${className ?? ""}`}
      >
        {ADD_SUBTASK_LINK}
      </button>
    );
  }

  return (
    <div data-slot="add-subtask-inline" className={`flex min-w-0 flex-col gap-1 ${className ?? ""}`}>
      <Input
        autoFocus={autoFocus || variant === "link"}
        value={title}
        disabled={create.isPending}
        placeholder={ADD_SUBTASK_PLACEHOLDER}
        aria-label={ADD_SUBTASK_LABEL}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className="h-8 text-sm"
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={onKeyDown}
      />
      {create.isPending ? (
        <p role="status" className="text-xs text-muted-foreground">
          {`Agregando «${title.trim()}»…`}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
