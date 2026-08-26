"use client";

import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";

type Props = {
  /** Label for aria-label on the dialog element. */
  label: string;
  onClose: () => void;
  /** Ref to the element that triggered this dialog, so focus returns on close. */
  triggerRef?: React.RefObject<HTMLElement | null>;
  children: ReactNode;
  className?: string;
};

const FOCUSABLE_SELECTORS = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

/**
 * Accessible dialog overlay. Provides:
 * - role="dialog" + aria-modal + aria-label
 * - Escape key closes the dialog
 * - Focus trap while open
 * - Focus return to triggerRef on close
 */
export default function DialogOverlay({ label, onClose, triggerRef, children, className }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const focusableElements = dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS);
    const first = focusableElements[0];

    first?.focus();

    const trigger = triggerRef?.current;
    return () => {
      trigger?.focus();
    };
  }, [triggerRef]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      onClose();
      return;
    }

    if (event.key === "Tab") {
      const dialog = dialogRef.current;
      if (!dialog) return;

      const focusableElements = Array.from(
        dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS)
      );

      if (focusableElements.length === 0) return;

      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];

      if (event.shiftKey) {
        if (document.activeElement === first) {
          event.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
  };

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onKeyDown={handleKeyDown}
      className={className}
    >
      {children}
    </div>
  );
}
