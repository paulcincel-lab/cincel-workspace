export function formatDateDMY(value: string): string {
  if (!value) {
    return "—";
  }

  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return value;
  }

  const [, year, month, day] = match;
  return `${day}-${month}-${year}`;
}
