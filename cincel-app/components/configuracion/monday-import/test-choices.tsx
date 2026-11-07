/** Shared fixtures for the Equivalencias component tests: a three-tramo catalog and a native select stand-in. */
import type { MondayImportChoices } from "@/lib/types/monday-import";

export const PRESALE = "11111111-1111-4111-8111-111111111111";
export const DISENO = "22222222-2222-4222-8222-222222222222";
export const CONSTRUCCION = "33333333-3333-4333-8333-333333333333";
export const ANTEPROYECTO = "44444444-4444-4444-8444-444444444444";
export const EJECUTIVO = "55555555-5555-4555-8555-555555555555";
export const OBRA_NEGRA = "66666666-6666-4666-8666-666666666666";
export const PLANOS_TEMPLATE = "77777777-7777-4777-8777-777777777777";

export const testChoices = {
  statuses: [],
  workflows: [
    { id: PRESALE, name: "Presale", phases: [] },
    {
      id: DISENO,
      name: "Diseño",
      phases: [
        { id: ANTEPROYECTO, name: "Anteproyecto", sortOrder: 1 },
        { id: EJECUTIVO, name: "Ejecutivo", sortOrder: 2 },
      ],
    },
    { id: CONSTRUCCION, name: "Construcción", phases: [{ id: OBRA_NEGRA, name: "Obra negra", sortOrder: 1 }] },
  ],
  templates: [{ id: PLANOS_TEMPLATE, workflowId: DISENO, phaseId: EJECUTIVO, name: "Planos" }],
  positions: [],
  clients: [
    { id: "88888888-8888-4888-8888-888888888888", name: "Familia Pérez" },
    { id: "99999999-9999-4999-8999-999999999999", name: "Grupo Norte" },
  ],
  staff: [],
  providerSubtypes: [],
  statusMap: {},
} as unknown as MondayImportChoices;

/** A native select in place of the shadcn one, so tests read options and change values directly. */
export function NativeChoiceSelect({
  label,
  value,
  choices,
  onChange,
}: {
  label: string;
  value: string | null;
  choices: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <select aria-label={label} value={value ?? ""} onChange={(event) => onChange(event.target.value)}>
      <option value="">Elige una opción</option>
      {choices.map((choice) => (
        <option key={choice.value} value={choice.value}>
          {choice.label}
        </option>
      ))}
    </select>
  );
}
