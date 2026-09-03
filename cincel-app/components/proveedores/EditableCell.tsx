"use client";

import InlineEditable from "@/components/ui/InlineEditable";

/** Inline-editable text cell with click-to-edit, confirm, and cancel. */
export const EditableCell = ({ value, onSave, type = "text" }: {
  value: string;
  onSave: (v: string) => void;
  type?: "text" | "date" | "textarea";
}) => {
  return (
    <InlineEditable
      value={value}
      onCommit={onSave}
      renderDisplay={(displayValue) => (
        <div className="group flex min-h-[26px] cursor-pointer items-center gap-1">
          <span className="text-xs text-gray-700">{displayValue || <span className="text-gray-300">—</span>}</span>
          <span className="text-xs text-gray-400 opacity-0 group-hover:opacity-60">✎</span>
        </div>
      )}
      renderEditor={({ value: draft, onChange, onBlur, onCancel, onKeyDown }) => (
        <div className="flex min-w-[100px] gap-1">
          {type === "textarea" ? (
            <textarea
              autoFocus
              value={draft}
              onChange={(e) => onChange(e.target.value)}
              className="flex-1 resize-none rounded border border-blue-400 px-2 py-1 text-xs"
              rows={2}
            />
          ) : (
            <input
              autoFocus
              type={type}
              value={draft}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={onKeyDown}
              className="min-w-[90px] flex-1 rounded border border-blue-400 px-2 py-1 text-xs"
            />
          )}
          <button type="button" onClick={onBlur} className="text-sm font-bold text-emerald-600">✓</button>
          <button type="button" onClick={onCancel} className="text-sm text-gray-400">✕</button>
        </div>
      )}
    />
  );
};
