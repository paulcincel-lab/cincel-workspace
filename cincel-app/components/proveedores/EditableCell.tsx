"use client";

import { useState } from "react";

/** Inline-editable text cell with click-to-edit, confirm, and cancel. */
export const EditableCell = ({ value, onSave, type = "text" }: {
  value: string;
  onSave: (v: string) => void;
  type?: "text" | "date" | "textarea";
}) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const save = () => { onSave(draft); setEditing(false); };

  if (editing) {
    return (
      <div className="flex gap-1 min-w-[100px]">
        {type === "textarea" ? (
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="flex-1 text-xs border border-blue-400 rounded px-2 py-1 resize-none"
            rows={2}
          />
        ) : (
          <input
            autoFocus
            type={type}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
            className="flex-1 text-xs border border-blue-400 rounded px-2 py-1 min-w-[90px]"
          />
        )}
        <button onClick={save} className="text-emerald-600 font-bold text-sm">✓</button>
        <button onClick={() => { setDraft(value); setEditing(false); }} className="text-gray-400 text-sm">✕</button>
      </div>
    );
  }

  return (
    <div
      onClick={() => { setDraft(value); setEditing(true); }}
      className="cursor-pointer group flex items-center gap-1 min-h-[26px]"
    >
      <span className="text-xs text-gray-700">{value || <span className="text-gray-300">—</span>}</span>
      <span className="opacity-0 group-hover:opacity-60 text-gray-400 text-xs">✎</span>
    </div>
  );
};
