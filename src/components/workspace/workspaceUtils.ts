/** Dates in reports are calendar dates, not the browser's local timezone. */
export function manilaDateKey(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(parsed);
  const part = (key: string) => parts.find(item => item.type === key)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function planningEndDate(start: string, days: number) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !Number.isInteger(days) || days < 1) return '';
  const parsed = new Date(`${start}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== start) return '';
  parsed.setUTCDate(parsed.getUTCDate() + days - 1);
  return parsed.toISOString().slice(0, 10);
}

/** The date filter includes requests whose assistance periods overlap it. */
export function planningPeriodOverlaps(start: string, days: number, from = '', to = '') {
  if (from && to && from > to) return false;
  const end = planningEndDate(start, days);
  return !!end && (!from || end >= from) && (!to || start <= to);
}

/** Quoting alone does not stop spreadsheet formula execution. */
export function csvCell(value: unknown) {
  let text = String(value ?? '');
  if (typeof value !== 'number' && /^\s*[=+@\-\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function csvDocument(rows: unknown[][]) {
  return '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n');
}
