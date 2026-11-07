"use client";

import { createContext, useContext } from "react";

import type { GeneralSettingsEditor } from "@/components/configuracion/use-general-settings-editor";

/**
 * The Ajustes › General editor, shared with the page's registry sections
 * (`lib/shell/settings-sections/general/*`) so every field saves with the one
 * "Guardar cambios" of the page.
 */
export const GeneralSettingsEditorContext = createContext<GeneralSettingsEditor | null>(null);

export function useGeneralSettingsEditorContext(): GeneralSettingsEditor {
  const editor = useContext(GeneralSettingsEditorContext);
  if (!editor) throw new Error("useGeneralSettingsEditorContext must be used inside AjustesGeneralClient");
  return editor;
}
