const ZONE = 'America/Managua';


export function todayYmd(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONE }).format(date);
}

export function parseYmd(value?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  return new Date(`${value}T00:00:00.000Z`);
}

export function ymd(date: Date) {
  // Date-only columns are stored at UTC midnight of the Nicaragua calendar day.
  return date.toISOString().slice(0, 10);
}

export function addDays(ymdValue: string, days: number) {
  const date = new Date(`${ymdValue}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

export function businessToday() {
  return parseYmd(todayYmd())!;
}

export function stampFile(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || '00';
  return `${get('day')}-${get('month')}-${get('year')}`;
}

export function atLocalHour(day: Date, hour: number, minute: number) {
  const stamp = new Date(day);
  stamp.setUTCHours(hour + 6, minute, 0, 0);
  return stamp;
}
