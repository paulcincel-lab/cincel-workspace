"use client";

import { Bell } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type { RowAction } from "@/components/v2/table/RowActionsMenu";
import { RecordTable } from "@/components/widgets/RecordTable";
import { WidgetCard } from "@/components/widgets/WidgetCard";
import { cancelReminderAction, snoozeReminderAction } from "@/lib/actions/my-space-actions";
import { IMPLEMENTED } from "@/lib/actions/my-space-actions.flags";
import { actionErrorText } from "@/lib/errors";
import {
  REMINDER_CHANNEL_LABELS,
  REMINDER_REPEAT_LABELS,
  formatReminderWhen,
  remindersForTodayAndTomorrow,
  snoozeOneHourTarget,
  snoozeTomorrowTarget,
} from "@/lib/my-space/reminder-time";
import type { Reminder } from "@/lib/types/redesign";
import type { RecordTableData } from "@/lib/types/widgets";

export type RemindersListProps = {
  /** The caller's open reminders (the page loads today and tomorrow). */
  reminders: Reminder[];
  /** Reference time for "hoy" / "mañana" (tests); defaults to now. */
  now?: Date;
};

const EMPTY_TEXT = "Sin recordatorios para hoy y mañana";

function linkLabel(r: Reminder): string {
  if (r.taskId) return "Tarea";
  if (r.projectId) return "Proyecto";
  return "—";
}

function contextLabel(r: Reminder): string {
  const parts: string[] = [];
  if (r.repeat !== "none") parts.push(REMINDER_REPEAT_LABELS[r.repeat]);
  if (r.taskId) parts.push("Tarea vinculada");
  else if (r.projectId) parts.push("Proyecto vinculado");
  return parts.join(" · ");
}

/**
 * Right-column "Recordatorios" of /mi-espacio (redesign FE §3.3): open
 * reminders of today and tomorrow in the org time zone, by time, with the
 * overflow menu Posponer 1 h / Mañana / Cancelar (optimistic, rolled back
 * with an error toast). The three styles come from `RecordTable`: Visual and
 * Esencial list text, context and time; Analítico adds Repite, Vinculado and
 * Canales.
 */
export function RemindersList({ reminders, now }: RemindersListProps) {
  const [items, setItems] = useState<Reminder[]>(reminders);
  const [source, setSource] = useState<Reminder[]>(reminders);
  if (source !== reminders) {
    setSource(reminders);
    setItems(reminders);
  }

  if (!IMPLEMENTED.fetchRemindersAction) return null;

  const reference = now ?? new Date();
  const visible = remindersForTodayAndTomorrow(items, reference);

  const replace = (id: string, next: Reminder | null) =>
    setItems((list) => (next ? list.map((r) => (r.id === id ? next : r)) : list.filter((r) => r.id !== id)));

  async function snooze(reminder: Reminder, until: string) {
    replace(reminder.id, { ...reminder, dueAt: until, firedAt: null });
    try {
      const saved = await snoozeReminderAction(reminder.id, until);
      replace(reminder.id, saved);
    } catch (err) {
      replace(reminder.id, reminder);
      toast.error(actionErrorText(err));
    }
  }

  async function cancel(reminder: Reminder) {
    setItems((list) => list.filter((r) => r.id !== reminder.id));
    try {
      await cancelReminderAction(reminder.id);
    } catch (err) {
      setItems((list) => (list.some((r) => r.id === reminder.id) ? list : [...list, reminder]));
      toast.error(actionErrorText(err));
    }
  }

  const byId = new Map(items.map((r) => [r.id, r]));
  const withReminder = (fn: (r: Reminder) => void) => (row: Record<string, unknown>) => {
    const reminder = byId.get(String(row.id));
    if (reminder) fn(reminder);
  };

  const rowActions: RowAction<Record<string, unknown>>[] = [];
  if (IMPLEMENTED.snoozeReminderAction) {
    rowActions.push(
      { label: "Posponer 1 h", onSelect: withReminder((r) => void snooze(r, snoozeOneHourTarget(r.dueAt, new Date()))) },
      { label: "Mañana", onSelect: withReminder((r) => void snooze(r, snoozeTomorrowTarget(new Date()))) }
    );
  }
  if (IMPLEMENTED.cancelReminderAction) {
    rowActions.push({
      label: "Cancelar",
      variant: "destructive",
      separatorBefore: true,
      onSelect: withReminder((r) => void cancel(r)),
    });
  }

  const data: RecordTableData = {
    columns: [
      { key: "texto", label: "Texto" },
      { key: "contexto", label: "Contexto", hideOn: ["analitico"] },
      { key: "cuando", label: "Cuándo", mono: true },
      { key: "repite", label: "Repite", hideOn: ["visual", "esencial"] },
      { key: "vinculado", label: "Vinculado", hideOn: ["visual", "esencial"] },
      { key: "canales", label: "Canales", hideOn: ["visual", "esencial"] },
    ],
    rows: visible.map((r) => ({
      id: r.id,
      texto: r.text,
      contexto: contextLabel(r),
      cuando: formatReminderWhen(r.dueAt, reference),
      repite: REMINDER_REPEAT_LABELS[r.repeat],
      vinculado: linkLabel(r),
      canales: r.channels.map((c) => REMINDER_CHANNEL_LABELS[c]).join(", "),
    })),
  };

  return (
    <WidgetCard title="Recordatorios" icon={Bell}>
      <RecordTable
        data={data}
        density="compacta"
        rowActions={rowActions.length > 0 ? rowActions : undefined}
        emptyState={{ icon: Bell, title: EMPTY_TEXT }}
      />
    </WidgetCard>
  );
}
