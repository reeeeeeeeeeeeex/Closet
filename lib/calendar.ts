// Preserve the selected day when jumping months, clamping e.g. Jan 31 to Feb 28.
export function dayInMonth(date: string, year: number, month: number): string {
  const day = Math.min(Number(date.slice(8, 10)) || 1, new Date(year, month + 1, 0).getDate());
  return `${String(year).padStart(4, "0")}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
