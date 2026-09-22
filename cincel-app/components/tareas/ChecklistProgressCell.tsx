"use client";

type Props = {
  total: number;
  completed: number;
  onClick?: () => void;
};

/** Checklist progress shown as a count; opens the task detail on click when provided. */
export function ChecklistProgressCell({ total, completed, onClick }: Props) {
  if (total === 0) return <span className="text-sm text-muted-foreground">Sin checklist</span>;

  const label = `${completed}/${total} completados`;
  if (!onClick) return <span className="text-sm tabular-nums">{label}</span>;

  return (
    <button type="button" className="text-sm tabular-nums hover:underline" onClick={onClick} title="Ver checklist">
      {label}
    </button>
  );
}
