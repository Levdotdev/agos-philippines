import type { State, Report, Delivery } from '../types';

export const active = (d: Delivery) => ['Pending', 'Assigned', 'In Transit'].includes(d.status);
export function positive(n: number, label = 'Quantity') {
  if (!Number.isFinite(n) || n < 0) throw Error(`${label} must be a non-negative number`);
  return n;
}
export function requested(s: Pick<State, 'baseline'>, r: Pick<Report, 'population' | 'local' | 'planningDays'>) {
  positive(r.population, 'Affected population'); positive(r.local, 'Local daily water'); positive(s.baseline, 'Baseline');
  if (!Number.isInteger(r.population) || r.population < 1) throw Error('Affected population must be a positive whole number');
  if (s.baseline <= 0) throw Error('Planning allowance must be positive');
  if (!Number.isInteger(r.planningDays) || r.planningDays < 1 || r.planningDays > 14) throw Error('Planning days must be between 1 and 14');
  // The database stores allowances with two decimal places. Integer hundredths avoid
  // binary floating-point artifacts adding an extra liter at an exact boundary.
  const hundredths = (r.population * Math.round(s.baseline * 100) - r.local * 100) * r.planningDays;
  if (!Number.isSafeInteger(hundredths)) throw Error('Requested quantity exceeds the supported planning range');
  return Math.max(0, Math.ceil(hundredths / 100));
}
export function unmet(s: State, r: Report) {
  return Math.max(0, requested(s, r) - s.deliveries.filter(d => d.reportId === r.id).reduce((sum, d) => sum + d.actual, 0));
}
export function committed(s: State, id?: string) {
  return s.deliveries.filter(active).reduce((sum, d) => sum + (id
    ? d.sources.filter(source => source.resourceId === id).reduce((n, source) => n + source.liters, 0)
    : d.liters), 0);
}
export function available(s: State) {
  return Math.max(0, s.resources.filter(r => r.active).reduce((sum, r) => sum + r.liters, 0) - committed(s));
}
export function remainingNeed(s: State, r: Report) {
  return Math.max(0, unmet(s, r) - s.deliveries.filter(d => d.reportId === r.id && active(d)).reduce((sum, d) => sum + d.liters, 0));
}
/** Advisory preview only. The database independently validates and reserves every approved liter. */
export function recommend(s: State, budget = available(s)) {
  positive(budget, 'Dispatch budget'); positive(s.baseline, 'Baseline');
  const rows = s.reports.filter(r => r.status === 'Verified').map(report => ({ report, need: remainingNeed(s, report), liters: 0 })).filter(r => r.need > 0);
  const total = rows.reduce((sum, r) => sum + r.need, 0);
  const cap = Math.floor(Math.min(budget, available(s), total));
  const exactTotal = BigInt(total), exactCap = BigInt(cap);
  const remainder = new Map<string, bigint>();
  rows.forEach(r => {
    const numerator = exactCap * BigInt(r.need);
    r.liters = total ? Number(numerator / exactTotal) : 0;
    remainder.set(r.report.id, total ? numerator % exactTotal : 0n);
  });
  let left = cap - rows.reduce((sum, r) => sum + r.liters, 0);
  const order = [...rows].sort((a, b) => {
    const first = remainder.get(a.report.id)!, second = remainder.get(b.report.id)!;
    return first === second ? a.report.id.localeCompare(b.report.id) : first > second ? -1 : 1;
  });
  for (const r of order) if (left > 0 && r.liters < r.need) { r.liters++; left--; }
  return rows;
}

/** Pure business-rule implementation used by tests; production writes always use the bounded RPC. */
export function approve(s: State, items: { reportId: string; liters: number }[]) {
  const total = items.reduce((sum, x) => sum + positive(x.liters), 0);
  if (!total || total > available(s)) throw Error('Allocation exceeds available inventory or is empty');
  if (new Set(items.map(x => x.reportId)).size !== items.length) throw Error('Duplicate report in approval');
  for (const x of items) {
    const r = s.reports.find(r => r.id === x.reportId);
    if (!r || r.status !== 'Verified') throw Error('Verification required');
    if (!Number.isInteger(x.liters) || x.liters > remainingNeed(s, r)) throw Error('Duplicate or excessive allocation');
  }
  const free = s.resources.filter(r => r.active).map(r => ({ id: r.id, liters: r.liters - committed(s, r.id) }));
  for (const x of items.filter(x => x.liters > 0)) {
    let remain = x.liters;
    const sources: Delivery['sources'] = [];
    for (const r of free) {
      const take = Math.min(remain, r.liters);
      if (take > 0) { sources.push({ resourceId: r.id, liters: take }); r.liters -= take; remain -= take; }
    }
    if (remain) throw Error('Source reservation failed');
    s.deliveries.push({ id: crypto.randomUUID(), reportId: x.reportId, liters: x.liters, actual: 0, status: 'Pending', teamId: '', person: '', vehicle: '', scheduled: '', completed: '', notes: '', sources, receipt: null });
  }
}
export function reconcile(s: State, id: string, actual: number, status: 'Completed' | 'Failed' | 'Partially Delivered', notes: string) {
  const d = s.deliveries.find(d => d.id === id);
  if (!d || d.status !== 'In Transit') throw Error('Delivery must be in transit and unconfirmed');
  positive(actual);
  if (!['Completed', 'Failed', 'Partially Delivered'].includes(status)) throw Error('Choose a valid delivery outcome');
  if (actual > d.liters || !Number.isInteger(actual)) throw Error('Actual liters must be an integer within assigned quantity');
  if (status === 'Completed' && actual !== d.liters) throw Error('Use partial delivery for an incomplete quantity');
  if (status === 'Failed' && actual !== 0) throw Error('Failed delivery must record zero liters');
  if (status === 'Partially Delivered' && (actual <= 0 || actual >= d.liters)) throw Error('Partial quantity must be between zero and assigned liters');
  if (status !== 'Completed' && !notes.trim()) throw Error('Explain failed or partial delivery');
  const sources = [...d.sources].sort((a, b) => a.resourceId.localeCompare(b.resourceId));
  let remaining = actual;
  for (const source of sources) {
    const resource = s.resources.find(r => r.id === source.resourceId);
    if (!resource) throw Error('Supply record missing');
    const take = Math.min(remaining, source.liters);
    if (resource.liters < take) throw Error('Insufficient source inventory');
    remaining -= take;
  }
  if (remaining) throw Error('Incomplete source reservations');
  remaining = actual;
  for (const source of sources) {
    const take = Math.min(remaining, source.liters);
    s.resources.find(r => r.id === source.resourceId)!.liters -= take;
    remaining -= take;
  }
  Object.assign(d, { actual, status, notes, completed: new Date().toISOString() });
}
export function cancelDelivery(s: State, id: string, reason: string) {
  const d = s.deliveries.find(d => d.id === id);
  if (!d || !['Pending', 'Assigned'].includes(d.status)) throw Error('Only pending or assigned deliveries can be cancelled');
  if (!reason.trim()) throw Error('Cancellation reason required');
  Object.assign(d, { status: 'Cancelled', notes: reason, completed: new Date().toISOString() });
}
export function splitDelivery(s: State, id: string, chunk: number) {
  const d = s.deliveries.find(d => d.id === id);
  if (!d || d.status !== 'Pending') throw Error('Only pending deliveries can be split');
  if (!Number.isInteger(chunk) || chunk <= 0 || chunk >= d.liters || Math.ceil(d.liters / chunk) > 50) throw Error('Choose a smaller positive trip size that produces no more than 50 trips');
  const sourcePool = d.sources.map(source => ({ ...source })).sort((a, b) => a.resourceId.localeCompare(b.resourceId));
  const total = d.liters;
  const pieces: Delivery[] = [];
  for (let remaining = total; remaining > 0; remaining -= chunk) {
    const liters = Math.min(chunk, remaining);
    let unassigned = liters;
    const sources: Delivery['sources'] = [];
    for (const source of sourcePool) {
      const take = Math.min(source.liters, unassigned);
      if (take) { sources.push({ resourceId: source.resourceId, liters: take }); source.liters -= take; unassigned -= take; }
    }
    if (unassigned) throw Error('Incomplete source reservations');
    pieces.push({ ...d, id: pieces.length ? crypto.randomUUID() : id, liters, sources });
  }
  s.deliveries.splice(s.deliveries.indexOf(d), 1, ...pieces);
}
