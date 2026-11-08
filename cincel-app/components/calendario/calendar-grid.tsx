/**
 * Month-grid presentation helpers shared by the calendar widgets
 * (`AgendaWidget`): the Monday-first cells of a month, the weekday header
 * row and the "≈" estimated-time marker.
 */
import { dateKey, getWeekdayLabels } from "@/lib/calendar/calendar-service";

/**
 * Tasks only store dates, so the calendar shows an estimated time (see
 * calendar-service.ts). The leading "≈" marks it as approximate everywhere.
 */
export function approxTime(time: string): string {
  return `≈${time}`;
}

/** One cell of a Monday-first month grid (presentation only; shared with `AgendaWidget`). */
export type MonthCell<T> = {
  key: string;
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  dayNumber: number;
  events: T[];
};

/**
 * The Monday-first cells of the month containing `month`, leading and
 * trailing days included. `keyOf` turns a local day into the key used by
 * `eventsByDate` (defaults to the calendar service `dateKey`).
 */
export function buildMonthCells<T>(
  month: Date,
  eventsByDate: Map<string, T[]>,
  today: Date,
  keyOf: (date: Date) => string = dateKey
): MonthCell<T>[] {
  const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);
  const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const leadingEmpty = (monthStart.getDay() + 6) % 7;
  const daysInMonth = monthEnd.getDate();
  const totalCells = Math.ceil((leadingEmpty + daysInMonth) / 7) * 7;

  const gridStart = new Date(monthStart);
  gridStart.setDate(monthStart.getDate() - leadingEmpty);
  const todayKey = keyOf(today);

  return Array.from({ length: totalCells }).map((_, index) => {
    const currentDate = new Date(gridStart);
    currentDate.setDate(gridStart.getDate() + index);
    const key = keyOf(currentDate);

    return {
      key,
      date: currentDate,
      isCurrentMonth: currentDate.getMonth() === monthStart.getMonth(),
      isToday: key === todayKey,
      dayNumber: currentDate.getDate(),
      events: eventsByDate.get(key) ?? [],
    };
  });
}

/** Weekday header row of the month grid (lun. … dom.). */
export function CalendarWeekdayHeader() {
  return (
    <div className="grid grid-cols-7 border-b border-border text-center text-sm font-semibold text-foreground">
      {getWeekdayLabels().map((label) => (
        <div key={label} className="border-r border-border py-2 last:border-r-0">{label}</div>
      ))}
    </div>
  );
}
