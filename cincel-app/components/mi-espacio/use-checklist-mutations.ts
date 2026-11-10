"use client";

import { addChecklistItemAction, toggleChecklistItemAction } from "@/lib/actions/my-space-actions";
import { useActionMutation } from "@/lib/query/mutation";
import {
  restoreSnapshot,
  snapshotChecklists,
  updateCachedChecklist,
  type ChecklistsData,
  type Snapshot,
} from "@/lib/query/options/mi-espacio";
import type { Checklist, ChecklistItem } from "@/lib/types/redesign";

function withItem(checklist: Checklist, itemId: string, patch: Partial<ChecklistItem>): Checklist {
  return {
    ...checklist,
    items: checklist.items.map((item) => (item.id === itemId ? { ...item, ...patch } : item)),
  };
}

/**
 * The checklist writes of Mi espacio, shared by `ChecklistCard` and the
 * Esencial checklist card. A toggle patches `me.checklists` at once and rolls
 * back with the error toast; an added item is appended from the result.
 */
export function useChecklistMutations(checklistId: string, options: { onAdded?(): void; onAddError?(text: string): void } = {}) {
  const toggle = useActionMutation<{ itemId: string; done: boolean }, ChecklistItem, Snapshot<ChecklistsData>>(
    ({ itemId, done }) => toggleChecklistItemAction(itemId, done),
    {
      optimistic: {
        async onMutate(qc, { itemId, done }) {
          const snap = await snapshotChecklists(qc);
          updateCachedChecklist(qc, checklistId, (c) => withItem(c, itemId, { done }));
          return snap;
        },
        rollback: restoreSnapshot,
      },
      setData: (qc, saved, { itemId }) => updateCachedChecklist(qc, checklistId, (c) => withItem(c, itemId, saved)),
    },
  );

  const add = useActionMutation<string, ChecklistItem>((text) => addChecklistItemAction(checklistId, text), {
    setData: (qc, item) => {
      updateCachedChecklist(qc, checklistId, (c) => ({ ...c, items: [...c.items.filter((i) => i.id !== item.id), item] }));
      options.onAdded?.();
    },
    onFormError: options.onAddError,
  });

  return { toggle, add };
}
