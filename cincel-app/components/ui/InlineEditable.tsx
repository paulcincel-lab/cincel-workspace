"use client";

import { type KeyboardEvent, type ReactNode, useState } from "react";

type Props = {
  value: string;
  onCommit: (value: string) => void;
  renderDisplay: (value: string) => ReactNode;
  renderEditor: (args: {
    value: string;
    onChange: (value: string) => void;
    onBlur: () => void;
    onCancel: () => void;
    onKeyDown: (event: KeyboardEvent) => void;
  }) => ReactNode;
  commitOnChange?: boolean;
  className?: string;
  displayClassName?: string;
  editTriggerLabel?: string;
};

export default function InlineEditable({
  value,
  onCommit,
  renderDisplay,
  renderEditor,
  commitOnChange = false,
  className,
  displayClassName,
  editTriggerLabel,
}: Props) {
  const [draft, setDraft] = useState(value);
  const [isEditing, setIsEditing] = useState(false);

  const commitValue = (nextValue: string) => {
    const normalizedDraft = nextValue.trim();
    const normalizedValue = value.trim();

    if (normalizedDraft !== normalizedValue) {
      onCommit(normalizedDraft);
    }

    setIsEditing(false);
  };

  const handleChange = (nextValue: string) => {
    setDraft(nextValue);

    if (commitOnChange) {
      const normalizedValue = nextValue.trim();
      const normalizedCurrent = value.trim();

      if (normalizedValue !== normalizedCurrent) {
        onCommit(normalizedValue);
      }

      setIsEditing(false);
    }
  };

  const handleBlur = () => {
    if (!commitOnChange) {
      commitValue(draft);
    }
  };

  const handleCancel = () => {
    setDraft(value);
    setIsEditing(false);
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commitValue(draft);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      handleCancel();
    }
  };

  if (!isEditing) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(value);
          setIsEditing(true);
        }}
        className={`w-full text-left ${displayClassName ?? ""}`.trim()}
        aria-label={editTriggerLabel}
      >
        {renderDisplay(value)}
      </button>
    );
  }

  return (
    <div className={className}>
      {renderEditor({
        value: draft,
        onChange: handleChange,
        onBlur: handleBlur,
        onCancel: handleCancel,
        onKeyDown: handleKeyDown,
      })}
    </div>
  );
}
