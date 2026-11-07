import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { effectScope, nextTick, type EffectScope } from 'vue';
import { createEmptyState } from '../../data/seed';
import { useAgos } from '../../stores/agos';
import type { Delivery, Report, Role } from '../../types';
import { useWorkspace } from './useWorkspace';

const route = vi.hoisted(() => ({ params: { page: 'dashboard' } }));
vi.mock('vue-router', () => ({ useRoute: () => route }));

let scope: EffectScope;
function report(id: string, barangay = 'Bucayao', planningDate = '2026-11-08', planningDays = 1): Report {
  return { id, barangay, province: 'Oriental Mindoro', municipality: 'Calapan City', households: 10,
    population: 40, local: 0, days: 1, planningDate, planningDays, urgency: false,
    description: 'Recorded shortage affecting the reported households.', date: '2026-11-08', status: 'Pending',
    reason: '', lat: null, lng: null, createdAt: '2026-11-08T00:00:00Z', updatedAt: '2026-11-08T00:00:00Z' };
}
function delivery(id: string, reportId: string, teamId = ''): Delivery {
  return { id, reportId, teamId, liters: 100, actual: 0, status: 'Assigned', person: 'Operating team',
    vehicle: 'Custom vehicle', scheduled: '2026-11-09', completed: '', notes: '', sources: [], receipt: null };
}
function workspace(role: Role = 'LGU Coordinator', page = 'dashboard') {
  route.params.page = page;
  const store = useAgos();
  store.state = createEmptyState();
  store.role = role;
  store.community = 'Bucayao';
  store.connected = true;
  scope = effectScope();
  const workspace = scope.run(useWorkspace)!;
  return { store, workspace };
}
beforeEach(() => {
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined });
  setActivePinia(createPinia());
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-08T04:00:00Z'));
});
afterEach(() => { scope?.stop(); vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('Role-specific shared workspace views', () => {
  it('scopes barangay operational data while leaving the official city directory readable', () => {
    const { store, workspace: w } = workspace('Barangay Representative', 'map');
    store.state.reports = [report('own'), report('other', 'Tawiran')];
    store.state.deliveries = [delivery('own-trip', 'own'), delivery('other-trip', 'other')];
    expect(w.allowed.value).toBe(true);
    expect(w.reports.value.map(row => row.id)).toEqual(['own']);
    expect(w.visibleDeliveries.value.map(row => row.id)).toEqual(['own-trip']);
    expect(w.directory.value).toHaveLength(62);
    expect(w.reference.value?.name).toBe('Bucayao');
  });
  it('limits delivery personnel to the team selected in the profile', () => {
    const { store, workspace: w } = workspace('Delivery Personnel');
    store.state.reports = [report('a'), report('b', 'Tawiran')];
    store.state.deliveries = [delivery('team-a-trip', 'a', 'team-a'), delivery('team-b-trip', 'b', 'team-b')];
    store.teamId = 'team-a';
    expect(w.reports.value.map(row => row.id)).toEqual(['a']);
    expect(w.visibleDeliveries.value.map(row => row.id)).toEqual(['team-a-trip']);
    store.teamId = '';
    expect(w.visibleDeliveries.value).toEqual([]);
  });
  it('starts a new request with actual-affected-count fields empty rather than census totals', () => {
    const { workspace: w } = workspace('Barangay Representative');
    w.newReport();
    expect(w.reportForm.households).toBe(0);
    expect(w.reportForm.population).toBe(0);
    expect(w.reportForm.local).toBe(0);
    expect(w.reportForm.planningDate).toBe('2026-11-08');
    expect(w.reportForm.lat).toBe(w.reference.value?.lat);
    expect(w.formNeed.value).toBe(0);
  });
});

describe('Operational form behavior', () => {
  it('catches overlapping open assistance periods before sending another create operation', async () => {
    const { store, workspace: w } = workspace('Barangay Representative');
    store.state.reports = [report('existing', 'Bucayao', '2026-11-08', 3)];
    const act = vi.spyOn(store, 'act').mockResolvedValue(true);
    w.newReport();
    Object.assign(w.reportForm, { population: 40, households: 10, planningDate: '2026-11-10', planningDays: 2 });
    await w.submitReport();
    expect(act).not.toHaveBeenCalled();
    expect(w.formError.value).toContain('overlapping request');
    expect(w.showReportForm.value).toBe(true);
  });
  it('keeps the form and the server explanation when a mutation fails, and closes only after success', async () => {
    const { store, workspace: w } = workspace('Barangay Representative');
    const act = vi.spyOn(store, 'act').mockImplementation(async () => { store.error = 'Workspace changed. Review current records.'; return false; });
    w.newReport();
    Object.assign(w.reportForm, { population: 40, households: 10 });
    await w.submitReport();
    expect(w.showReportForm.value).toBe(true);
    expect(w.formError.value).toContain('Workspace changed');
    act.mockResolvedValueOnce(true);
    await w.submitReport();
    expect(w.showReportForm.value).toBe(false);
    expect(act.mock.lastCall?.[0]).toBe('report.create');
    expect(act.mock.lastCall?.[1].barangay).toBe('Bucayao');
  });
  it('preserves an existing custom assignment vehicle until a team is deliberately selected', async () => {
    const { store, workspace: w } = workspace();
    store.state.reports = [report('request')];
    store.state.teams = [{ id: 'team-a', name: 'Team A', vehicle: 'Default tanker', capacity: 500, active: true }];
    const trip = delivery('trip', 'request', 'team-a');
    store.state.deliveries = [trip];
    w.openDelivery(trip);
    await nextTick();
    expect(w.task.vehicle).toBe('Custom vehicle');
    w.assignmentTeamChanged();
    expect(w.task.vehicle).toBe('Default tanker');
  });
  it('requires a new measured actual quantity when choosing a partial outcome', async () => {
    const { store, workspace: w } = workspace('Delivery Personnel');
    store.teamId = 'team-a';
    await nextTick();
    store.state.reports = [report('request')];
    const trip = { ...delivery('trip', 'request', 'team-a'), status: 'In Transit' as const };
    store.state.deliveries = [trip];
    w.openDelivery(trip);
    w.task.status = 'Partially Delivered';
    await nextTick();
    expect(w.task.actual).toBe(0);
    w.task.status = 'Completed';
    await nextTick();
    expect(w.task.actual).toBe(100);
  });
  it('restores the recommended quantity when a manual allocation override is cleared', () => {
    const { workspace: w } = workspace();
    w.edits['report-id'] = 25;
    w.editAllocation('report-id', { target: { value: '' } } as unknown as Event);
    expect(w.edits['report-id']).toBeUndefined();
  });
});
