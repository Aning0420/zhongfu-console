export function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addLocalDays(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T12:00:00`);
  date.setDate(date.getDate() + days);
  return localDateKey(date);
}

export function millisecondsUntilNextLocalDay(date = new Date()): number {
  const nextDay = new Date(date);
  nextDay.setHours(24, 0, 0, 50);
  return Math.max(50, nextDay.getTime() - date.getTime());
}
