/**
 * Test stand-ins and fixtures for the Control de horario tests. The pattern
 * and widget stand-ins follow their contracts (FE §4.10.1, §4.11) so the
 * tests cover this page on its own: `RecordTable` drops `hideOn` columns for
 * the current style and shows the totals row only in Analítico.
 */
import type { ReactNode } from "react";

import { useStyle } from "@/components/shell/StyleProvider";
import type { RecordTableProps } from "@/components/widgets/RecordTable";
import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import type { TeamHoursRow, TimeTrackingSettings } from "@/lib/types/redesign";

export function SettingsSection({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-label={title}>
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
      {actions}
      {children}
    </section>
  );
}

export function SettingsRow({ label, description, control }: { label: string; description?: string; control: ReactNode }) {
  return (
    <div data-testid="settings-row">
      <span>{label}</span>
      {description ? <span>{description}</span> : null}
      {control}
    </div>
  );
}

function cellText(value: unknown, format: string | undefined): string {
  if (value === null || value === undefined) return "";
  if (format === "percent") return `${String(value)}%`;
  if (format === "hours") return `${String(value)} h`;
  return String(value);
}

export function RecordTable({ data }: RecordTableProps) {
  const { style } = useStyle();
  const columns = data.columns.filter((column) => !column.hideOn?.includes(style));
  const totals = style === "analitico" && data.totals && data.totals !== "auto" ? data.totals : null;
  return (
    <table data-style={style}>
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column.key} scope="col">
              {column.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.rows.map((row) => (
          <tr key={String(row.id)}>
            {columns.map((column) => (
              <td key={column.key}>{cellText(row[column.key], column.format)}</td>
            ))}
          </tr>
        ))}
        {totals ? (
          <tr data-testid="totals">
            {columns.map((column) => (
              <td key={column.key}>{cellText(totals[column.key], column.format)}</td>
            ))}
          </tr>
        ) : null}
      </tbody>
    </table>
  );
}

// ── Fixtures ────────────────────────────────────────────────────────────────

export const WEEK = "2026-11-02";

const WEEK_DATES = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"];

function days(hours: number[]): TeamHoursRow["days"] {
  return WEEK_DATES.map((date, i) => ({ date, hours: hours[i] ?? 0 }));
}

export const TEAM_ROWS: TeamHoursRow[] = [
  { staffId: "s-paul", name: "Paul Langarica", days: days([8.5, 8.2, 9, 8, 7.8]), total: 41.5, target: 40, lateCount: 0, status: "completo", needsReview: false },
  { staffId: "s-juanma", name: "Juanma", days: days([8, 7.5, 8, 6.5, 5.2]), total: 35.2, target: 40, lateCount: 2, status: "incompleto", needsReview: false },
  { staffId: "s-maria", name: "María González", days: days([0, 0, 0, 0, 0]), total: 0, target: 40, lateCount: 0, status: "sin_registro", needsReview: false },
];

export const SETTINGS: TimeTrackingSettings = {
  enabled: true,
  requiredFrom: "2027-01-04",
  dayStart: "09:00",
  dayEnd: "18:00",
  hoursPerDay: 8,
  lateToleranceMin: 15,
  workDays: [1, 2, 3, 4, 5],
  promptAtLogin: true,
  autoCloseAt: "20:00",
  lunchMinutes: 60,
  exemptRoles: [],
};

export function testUser(access: string): AuthenticatedUser {
  return {
    member: {
      id: "staff-1",
      name: "Ana López",
      role: access,
      area: "",
      capacity: 0,
      availability: "",
      active: true,
      institutionalEmail: "ana@cincel.mx",
      phone: "",
    },
    email: "ana@cincel.mx",
    access,
  } as AuthenticatedUser;
}
