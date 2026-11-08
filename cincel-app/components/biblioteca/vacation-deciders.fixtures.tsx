import type { QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";

import type { TeamRequestRow } from "@/components/biblioteca/TeamRequests";
import { qk } from "@/lib/query/keys";
import { createTestQueryClient } from "@/lib/query/test-utils";
import type { VacationSettingsView } from "@/lib/types/redesign";

/** Test fixtures of "Solicitudes del equipo" and "Días de vacaciones". */

export const VIEWER_ID = "11111111-1111-4111-8111-111111111111";
export const ANA_ID = "22222222-2222-4222-8222-222222222222";
export const LUIS_ID = "33333333-3333-4333-8333-333333333333";

export function pendingRequestsFixture(): TeamRequestRow[] {
  return [
    {
      id: "req-ana",
      staffId: ANA_ID,
      name: "Ana Torres",
      from: "2026-12-14",
      to: "2026-12-18",
      kind: "vacaciones",
      comment: "Viaje familiar",
      status: "pendiente",
      days: 5,
      createdAt: "2026-11-02T16:00:00.000Z",
    },
    {
      id: "req-own",
      staffId: VIEWER_ID,
      name: "Paul Cincel",
      from: "2026-12-21",
      to: "2026-12-22",
      kind: "personal",
      comment: "Trámite",
      status: "pendiente",
      days: 2,
    },
    {
      id: "req-luis",
      staffId: LUIS_ID,
      name: "Luis Méndez",
      from: "2026-11-20",
      to: "2026-11-20",
      kind: "enfermedad",
      comment: "",
      status: "pendiente",
      days: 1,
    },
  ];
}

export function vacationSettingsFixture(): VacationSettingsView {
  return {
    daysPerYear: 12,
    overrides: [
      { staffId: ANA_ID, name: "Ana Torres", days: 15 },
      { staffId: LUIS_ID, name: "Luis Méndez", days: null },
    ],
  };
}

/**
 * Plain stand-ins for the shared pattern shells, so the tests exercise this
 * feature's behavior whatever the shells' visual implementation is.
 */
export const patternMocks = {
  FormDialog(props: {
    title: string;
    description?: string;
    open: boolean;
    onOpenChange(o: boolean): void;
    onSubmit(): Promise<void>;
    submitLabel: string;
    pending?: boolean;
    children: ReactNode;
  }) {
    if (!props.open) return null;
    return (
      <div role="dialog" aria-label={props.title}>
        <h2>{props.title}</h2>
        {props.description ? <p>{props.description}</p> : null}
        {props.children}
        <button type="button" onClick={() => props.onOpenChange(false)}>
          Cancelar
        </button>
        <button type="button" disabled={props.pending} onClick={() => void props.onSubmit()}>
          {props.submitLabel}
        </button>
      </div>
    );
  },
  SettingsSection(props: { title: string; description?: string; actions?: ReactNode; children: ReactNode }) {
    return (
      <section aria-label={props.title}>
        <h2>{props.title}</h2>
        {props.description ? <p>{props.description}</p> : null}
        {props.actions}
        {props.children}
      </section>
    );
  },
  SettingsRow(props: { label: string; description?: string; control: ReactNode; htmlFor?: string }) {
    return (
      <div>
        <label htmlFor={props.htmlFor}>{props.label}</label>
        {props.description ? <p>{props.description}</p> : null}
        {props.control}
      </div>
    );
  },
  EmptyState(props: { title: string; description?: string }) {
    return (
      <div>
        <p>{props.title}</p>
        {props.description ? <p>{props.description}</p> : null}
      </div>
    );
  },
};

/** A test client with `vacations.pending` and `vacations.settings` seeded, as the Mis vacaciones page leaves them. */
export function seededDeciderClient(
  data: { requests?: TeamRequestRow[]; settings?: VacationSettingsView | null } = {},
): QueryClient {
  const client = createTestQueryClient();
  client.setQueryData(qk.vacations.pending(), data.requests ?? pendingRequestsFixture());
  client.setQueryData(qk.vacations.settings(), data.settings === undefined ? vacationSettingsFixture() : data.settings);
  return client;
}
