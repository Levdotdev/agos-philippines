import { computed, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useAgos } from '../../stores/agos';
import { active, available, committed, recommend, requested, unmet } from '../../services/operations';
import type { Command, Delivery, Report, ReportStatus, Resource, Team } from '../../types';
import { csvDocument, manilaDateKey, planningEndDate, planningPeriodOverlaps } from './workspaceUtils';

export function manilaToday() {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const part = (key: string) => parts.find(item => item.type === key)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function useWorkspace() {
  const store = useAgos();
  const route = useRoute();
  const s = computed(() => store.state);
  const page = computed(() => String(route.params.page || 'dashboard'));
  const coordinator = computed(() => store.role === 'LGU Coordinator');
  const barangay = computed(() => store.role === 'Barangay Representative');
  const personnel = computed(() => store.role === 'Delivery Personnel');
  const pageNames: Record<string, string> = {
    dashboard: 'Response overview', reports: 'Potable water requests', map: 'Water crisis map',
    allocation: 'Allocation engine', inventory: 'Water resources & teams', deliveries: 'Delivery operations',
    analytics: 'Reports & analytics', communities: 'Calapan barangay directory',
  };
  const allowed = computed(() => Object.hasOwn(pageNames, page.value) && (
    coordinator.value || ['dashboard', 'deliveries'].includes(page.value)
    || (barangay.value && ['reports', 'map', 'communities'].includes(page.value))
  ));
  const title = computed(() => page.value === 'dashboard'
    ? barangay.value ? `${store.community || 'Your barangay'} workspace`
      : personnel.value ? 'Delivery team workspace' : 'Calapan response overview'
    : pageNames[page.value] || 'Page not found');
  const reference = computed(() => s.value.barangays.find(item => item.name === store.community));
  const selectedTeam = computed(() => s.value.teams.find(item => item.id === store.teamId));
  const activeTeams = computed(() => s.value.teams.filter(item => item.active));
  const activeResources = computed(() => s.value.resources.filter(item => item.active));
  const disabled = computed(() => store.loading || store.saving || !store.connected);
  const reports = computed(() => s.value.reports.filter(report => {
    if (barangay.value) return report.barangay === store.community;
    if (personnel.value) return !!store.teamId && s.value.deliveries.some(delivery =>
      delivery.reportId === report.id && delivery.teamId === store.teamId);
    return true;
  }).sort((left, right) => right.date.localeCompare(left.date) || right.id.localeCompare(left.id)));
  const visibleDeliveries = computed(() => s.value.deliveries.filter(delivery =>
    reports.value.some(report => report.id === delivery.reportId)
    && (!personnel.value || (!!store.teamId && delivery.teamId === store.teamId))));
  const verified = computed(() => reports.value.filter(report => report.status === 'Verified'));
  const pending = computed(() => reports.value.filter(report => report.status === 'Pending'));
  const corrections = computed(() => reports.value.filter(report => report.status === 'Correction requested'));
  const delivered = computed(() => visibleDeliveries.value.reduce((sum, delivery) => sum + delivery.actual, 0));
  const totalNeed = computed(() => verified.value.reduce((sum, report) => sum + unmet(s.value, report), 0));
  const scopedCommitted = computed(() => visibleDeliveries.value.filter(active).reduce((sum, delivery) => sum + delivery.liters, 0));
  const openReports = computed(() => reports.value.filter(report => ['Pending', 'Verified', 'Correction requested'].includes(report.status)));
  const receiptPending = computed(() => visibleDeliveries.value.filter(delivery =>
    ['Completed', 'Partially Delivered'].includes(delivery.status) && !delivery.receipt));
  const nextDeliveries = computed(() => visibleDeliveries.value.filter(active).sort((left, right) =>
    (left.scheduled || '9999').localeCompare(right.scheduled || '9999')));
  const affectedBarangays = computed(() => new Set(verified.value.filter(report => unmet(s.value, report) > 0).map(report => report.barangay)).size);
  const totalPopulation = computed(() => s.value.barangays.reduce((sum, item) => sum + item.population, 0));
  const totalHouseholds = computed(() => s.value.barangays.reduce((sum, item) => sum + item.households, 0));
  const focusReports = computed(() => verified.value.filter(report => unmet(s.value, report) > 0)
    .sort((left, right) => unmet(s.value, right) - unmet(s.value, left)).slice(0, 12));
  const search = ref('');
  const filter = ref('All statuses');
  const dateFilter = ref('');
  const filtered = computed(() => reports.value.filter(report =>
    (filter.value === 'All statuses' || report.status === filter.value)
    && (!dateFilter.value || manilaDateKey(report.date) === dateFilter.value)
    && `${report.barangay} ${report.id} ${report.description}`.toLowerCase().includes(search.value.toLowerCase())));
  const deliverySearch = ref('');
  const deliveryFilter = ref('All statuses');
  const filteredDeliveries = computed(() => visibleDeliveries.value.filter(delivery =>
    (deliveryFilter.value === 'All statuses' || delivery.status === deliveryFilter.value)
    && `${reportName(delivery.reportId)} ${delivery.id} ${delivery.person} ${delivery.vehicle}`
      .toLowerCase().includes(deliverySearch.value.toLowerCase())));
  const directorySearch = ref('');
  const directory = computed(() => s.value.barangays.filter(item =>
    `${item.name} ${item.psgc}`.toLowerCase().includes(directorySearch.value.toLowerCase())));
  const fromDate = ref('');
  const toDate = ref('');
  const invalidDateRange = computed(() => !!fromDate.value && !!toDate.value && fromDate.value > toDate.value);
  const analyticsReports = computed(() => reports.value.filter(report =>
    planningPeriodOverlaps(report.planningDate, report.planningDays, fromDate.value, toDate.value)));
  const analyticsDeliveries = computed(() => visibleDeliveries.value.filter(delivery =>
    analyticsReports.value.some(report => report.id === delivery.reportId)));
  const analyticsNeed = computed(() => analyticsReports.value.filter(report => report.status === 'Verified')
    .reduce((sum, report) => sum + unmet(s.value, report), 0));
  const analyticsActual = computed(() => analyticsDeliveries.value.reduce((sum, delivery) => sum + delivery.actual, 0));
  const analyticsCommitted = computed(() => analyticsDeliveries.value.filter(active).reduce((sum, delivery) => sum + delivery.liters, 0));
  const completionRate = computed(() => {
    const finalized = analyticsDeliveries.value.filter(delivery => ['Completed', 'Partially Delivered', 'Failed'].includes(delivery.status));
    return finalized.length ? Math.round(finalized.filter(delivery => delivery.status === 'Completed').length / finalized.length * 100) : 0;
  });
  const scopedAudit = computed(() => s.value.audit.filter(item => coordinator.value
    || (barangay.value ? item.community === store.community : !!store.teamId && item.teamId === store.teamId)));

  const fmt = (value: number | null | undefined) => Number(value || 0).toLocaleString('en-PH', { maximumFractionDigits: 1 });
  const shortId = (id: string) => id.length > 14 ? id.slice(0, 8).toUpperCase() : id;
  const prettyDate = (value: string, time = false) => {
    if (!value) return 'Not scheduled';
    const date = new Date(value.length === 10 ? `${value}T00:00:00+08:00` : value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString('en-PH', {
      timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric',
      ...(time ? { hour: 'numeric', minute: '2-digit' } as const : {}),
    });
  };
  function statusClass(status: string) {
    if (['Verified', 'Completed', 'Resolved'].includes(status)) return 'teal';
    if (['Assigned', 'In Transit'].includes(status)) return 'blue';
    if (['Rejected', 'Failed', 'Cancelled', 'Withdrawn'].includes(status)) return 'neutral';
    return 'amber';
  }
  function reportName(id: string) { return s.value.reports.find(report => report.id === id)?.barangay || shortId(id); }
  function periodNeed(report: Report) { return requested(s.value, report); }
  function reportActual(id: string) { return s.value.deliveries.filter(delivery => delivery.reportId === id).reduce((sum, delivery) => sum + delivery.actual, 0); }
  function reportCommitted(id: string) { return s.value.deliveries.filter(delivery => delivery.reportId === id && active(delivery)).reduce((sum, delivery) => sum + delivery.liters, 0); }
  function progress(report: Report) { return periodNeed(report) ? Math.min(100, Math.round(reportActual(report.id) / periodNeed(report) * 100)) : 100; }

  const formError = ref('');
  async function perform(command: Command, payload: Record<string, unknown>) {
    formError.value = '';
    const success = await store.act(command, payload);
    if (!success) formError.value = store.error || 'The change could not be saved. Please try again.';
    return success;
  }
  const showReportForm = ref(false);
  const editingId = ref('');
  const detailId = ref('');
  const detail = computed(() => reports.value.find(report => report.id === detailId.value));
  const decisionReason = ref('');
  const reportForm = reactive({
    households: 0, population: 0, local: 0, days: 1, planningDays: 1,
    planningDate: manilaToday(), urgency: false, description: '', lat: null as number | null, lng: null as number | null,
  });
  const formNeed = computed(() => {
    try { return requested(s.value, reportForm); }
    catch { return 0; }
  });
  function newReport() {
    formError.value = '';
    editingId.value = '';
    Object.assign(reportForm, {
      households: 0, population: 0, local: 0, days: 1, planningDays: 1,
      planningDate: manilaToday(), urgency: false, description: '', lat: reference.value?.lat ?? null, lng: reference.value?.lng ?? null,
    });
    showReportForm.value = true;
  }
  function editReport(report: Report) {
    editingId.value = report.id;
    Object.assign(reportForm, report);
    detailId.value = '';
    formError.value = '';
    showReportForm.value = true;
  }
  function openReport(report: Report) {
    formError.value = '';
    decisionReason.value = '';
    detailId.value = report.id;
  }
  async function submitReport() {
    formError.value = '';
    if (!Number.isInteger(reportForm.households) || reportForm.households < 1
      || !Number.isInteger(reportForm.population) || reportForm.population < reportForm.households) {
      formError.value = 'Enter positive whole-number household and people counts. Affected people must be at least the number of households.';
      return;
    }
    if (!planningEndDate(reportForm.planningDate, reportForm.planningDays)) {
      formError.value = 'Choose a valid assistance start date and a positive whole number of planning days.';
      return;
    }
    if (reports.value.some(report => report.id !== editingId.value
      && ['Pending', 'Verified', 'Correction requested'].includes(report.status)
      && planningPeriodOverlaps(report.planningDate, report.planningDays, reportForm.planningDate,
        planningEndDate(reportForm.planningDate, reportForm.planningDays)))) {
      formError.value = 'An open request already covers this assistance period. Update that request or ask the coordinator to resolve it before creating an overlapping request.';
      return;
    }
    const payload = {
      ...reportForm, id: editingId.value || undefined, barangay: store.community,
      province: 'Oriental Mindoro', municipality: 'Calapan City',
      lat: reportForm.lat === null || String(reportForm.lat) === '' ? null : Number(reportForm.lat),
      lng: reportForm.lng === null || String(reportForm.lng) === '' ? null : Number(reportForm.lng),
    };
    if (await perform(editingId.value ? 'report.update' : 'report.create', payload)) {
      showReportForm.value = false;
      editingId.value = '';
    }
  }
  async function review(status: ReportStatus) {
    if (detail.value && await perform('report.review', { id: detail.value.id, status, reason: decisionReason.value })) detailId.value = '';
  }
  async function closeReport(command: 'report.withdraw' | 'report.resolve') {
    if (detail.value && await perform(command, { id: detail.value.id, reason: decisionReason.value })) detailId.value = '';
  }

  const budget = ref(0);
  const drinkingBaseline = ref(s.value.drinkingBaseline);
  const cookingBaseline = ref(s.value.cookingBaseline);
  const baselineReason = ref('');
  const overrideReason = ref('');
  const edits = reactive<Record<string, number>>({});
  const recommendations = computed(() => recommend(s.value, Math.max(0, Number(budget.value) || 0)));
  const eligibleNeed = computed(() => recommendations.value.reduce((sum, row) => sum + row.need, 0));
  const proposed = computed(() => recommendations.value.reduce((sum, row) => sum + row.liters, 0));
  const selectedAllocation = computed(() => recommendations.value.reduce((sum, row) => sum + Number(edits[row.report.id] ?? row.liters), 0));
  const changedAllocation = computed(() => recommendations.value.some(row => (edits[row.report.id] ?? row.liters) !== row.liters));
  const budgetValid = computed(() => Number.isInteger(budget.value) && budget.value >= 0 && budget.value <= available(s.value));
  const allocationValid = computed(() => budgetValid.value && selectedAllocation.value > 0 && selectedAllocation.value <= budget.value
    && selectedAllocation.value <= available(s.value)
    && recommendations.value.every(row => Number.isInteger(edits[row.report.id] ?? row.liters)
      && (edits[row.report.id] ?? row.liters) >= 0 && (edits[row.report.id] ?? row.liters) <= row.need)
    && (!changedAllocation.value || !!overrideReason.value.trim()));
  function resetAllocation() {
    Object.keys(edits).forEach(key => delete edits[key]);
    overrideReason.value = '';
    budget.value = Math.floor(available(s.value));
  }
  function editAllocation(reportId: string, event: Event) {
    const value = (event.target as HTMLInputElement).value;
    if (!value.trim()) delete edits[reportId];
    else edits[reportId] = Number(value);
  }
  async function saveBaseline() {
    if (!Number.isFinite(drinkingBaseline.value) || !Number.isFinite(cookingBaseline.value)
      || drinkingBaseline.value < 0.5 || drinkingBaseline.value > 30
      || cookingBaseline.value < 0 || cookingBaseline.value > 30) {
      formError.value = 'Choose a drinking allowance from 0.5 to 30 L and a food-preparation allowance from 0 to 30 L per person per day.';
      return;
    }
    if (await perform('settings.update', { drinkingBaseline: drinkingBaseline.value, cookingBaseline: cookingBaseline.value, reason: baselineReason.value })) baselineReason.value = '';
  }
  async function allocate() {
    const items = recommendations.value.map(row => ({ reportId: row.report.id, liters: Number(edits[row.report.id] ?? row.liters) }));
    if (await perform('allocation.approve', { items, reason: overrideReason.value, budget: budget.value })) resetAllocation();
  }

  const resourceId = ref('');
  const showResource = ref(false);
  const resourceForm = reactive({ name: '', liters: 0, notes: '' });
  const editingResource = computed(() => s.value.resources.find(item => item.id === resourceId.value));
  function openResource(resource?: Resource) {
    formError.value = '';
    resourceId.value = resource?.id || '';
    Object.assign(resourceForm, { name: resource?.name || '', liters: resource?.liters || 0, notes: resource?.notes || '' });
    showResource.value = true;
  }
  async function saveResource() {
    if (await perform(resourceId.value ? 'resource.update' : 'resource.create', { id: resourceId.value || undefined, ...resourceForm })) showResource.value = false;
  }
  async function archiveResource() {
    if (await perform('resource.archive', { id: resourceId.value, reason: resourceForm.notes })) showResource.value = false;
  }
  const showTeam = ref(false);
  const editingTeamId = ref('');
  const teamForm = reactive({ name: '', vehicle: '', capacity: 0, active: true });
  function openTeam(team?: Team) {
    formError.value = '';
    editingTeamId.value = team?.id || '';
    Object.assign(teamForm, { name: team?.name || '', vehicle: team?.vehicle || '', capacity: team?.capacity || 0, active: team?.active ?? true });
    showTeam.value = true;
  }
  async function saveTeam() {
    if (await perform(editingTeamId.value ? 'team.update' : 'team.create', { id: editingTeamId.value || undefined, ...teamForm })) showTeam.value = false;
  }

  const deliveryId = ref('');
  const deliveryDetail = computed(() => visibleDeliveries.value.find(delivery => delivery.id === deliveryId.value));
  const task = reactive({ teamId: '', vehicle: '', scheduled: manilaToday(), actual: 0, status: 'Completed' as 'Completed' | 'Partially Delivered' | 'Failed', notes: '', reason: '', receiptLiters: 0, receiptNotes: '', splitLiters: 0 });
  const assignmentTeam = computed(() => s.value.teams.find(team => team.id === task.teamId));
  function assignmentTeamChanged() {
    if (assignmentTeam.value) task.vehicle = assignmentTeam.value.vehicle;
  }
  function openDelivery(delivery: Delivery) {
    formError.value = '';
    deliveryId.value = delivery.id;
    Object.assign(task, {
      teamId: delivery.teamId || '', vehicle: delivery.vehicle || '', scheduled: delivery.scheduled?.slice(0, 10) || manilaToday(),
      actual: delivery.liters, status: 'Completed', notes: '', reason: '', receiptLiters: delivery.actual, receiptNotes: '', splitLiters: 0,
    });
  }
  async function assignDelivery() {
    if (deliveryDetail.value && await perform('delivery.assign', { id: deliveryDetail.value.id, teamId: task.teamId, vehicle: task.vehicle, scheduled: task.scheduled })) deliveryId.value = '';
  }
  async function startDelivery() {
    if (deliveryDetail.value && await perform('delivery.start', { id: deliveryDetail.value.id })) deliveryId.value = '';
  }
  async function confirmDelivery() {
    if (deliveryDetail.value && await perform('delivery.confirm', { id: deliveryDetail.value.id, actual: task.actual, status: task.status, notes: task.notes })) deliveryId.value = '';
  }
  async function cancelDelivery() {
    if (deliveryDetail.value && await perform('delivery.cancel', { id: deliveryDetail.value.id, reason: task.reason })) deliveryId.value = '';
  }
  async function receiveDelivery() {
    if (deliveryDetail.value && await perform('delivery.receipt', { id: deliveryDetail.value.id, liters: task.receiptLiters, notes: task.receiptNotes })) deliveryId.value = '';
  }
  async function splitDelivery() {
    if (deliveryDetail.value && await perform('delivery.split', { id: deliveryDetail.value.id, liters: task.splitLiters })) deliveryId.value = '';
  }

  function downloadCsv(rows: unknown[][], filename: string) {
    const csv = csvDocument(rows);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${filename}-${manilaToday()}.csv`;
    anchor.hidden = true;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  function exportReports() {
    const rows = page.value === 'analytics' ? analyticsReports.value : filtered.value;
    downloadCsv([
      ['Report ID', 'Barangay', 'Status', 'Reported date', 'Planning start', 'Planning days', 'Affected households', 'Affected people', 'Local potable water liters/day', 'Unmet potable liters', 'Reserved potable liters', 'Delivered potable liters', 'Urgency', 'Review note'],
      ...rows.map(report => [report.id, report.barangay, report.status, report.date, report.planningDate, report.planningDays, report.households, report.population, report.local, unmet(s.value, report), reportCommitted(report.id), reportActual(report.id), report.urgency ? 'Elevated' : 'Standard', report.reason]),
    ], 'agos-shortage-reports');
  }
  function exportDeliveries() {
    const rows = page.value === 'analytics' ? analyticsDeliveries.value : filteredDeliveries.value;
    downloadCsv([
      ['Delivery ID', 'Report ID', 'Barangay', 'Status', 'Assigned liters', 'Delivered liters', 'Team', 'Vehicle', 'Scheduled', 'Completed', 'Notes', 'Receipt liters', 'Receipt notes', 'Receipt confirmed'],
      ...rows.map(delivery => [delivery.id, delivery.reportId, reportName(delivery.reportId), delivery.status, delivery.liters, delivery.actual, delivery.person, delivery.vehicle, delivery.scheduled, delivery.completed, delivery.notes, delivery.receipt?.liters ?? '', delivery.receipt?.notes ?? '', delivery.receipt?.confirmedAt ?? '']),
    ], 'agos-delivery-operations');
  }
  function exportDirectory() {
    downloadCsv([
      ['PSGC', 'Barangay', 'Total population', 'Household population', 'Households', 'Reference date', 'Source URL', 'Latitude', 'Longitude', 'Coordinate source', 'Coordinate accuracy'],
      ...directory.value.map(item => [item.psgc, item.name, item.population, item.householdPopulation, item.households, item.referenceDate, item.sourceUrl, item.lat, item.lng, item.coordinateSource || '', item.coordinateAccuracy || '']),
    ], 'calapan-barangay-reference');
  }
  function exportAudit() {
    downloadCsv([['Date', 'Workspace context', 'Action', 'Command', 'Barangay', 'Team ID'], ...scopedAudit.value.map(item =>
      [item.date, item.actor, item.action, item.command || '', item.community || '', item.teamId || ''])], 'agos-decision-history');
  }

  function closeDialogs() {
    showReportForm.value = false;
    detailId.value = '';
    deliveryId.value = '';
    showResource.value = false;
    showTeam.value = false;
    formError.value = '';
  }
  watch([page, () => store.role, () => store.community, () => store.teamId], () => {
    closeDialogs(); search.value = ''; filter.value = 'All statuses'; dateFilter.value = '';
    deliverySearch.value = ''; deliveryFilter.value = 'All statuses';
  });
  watch(() => s.value.drinkingBaseline, value => { drinkingBaseline.value = value; });
  watch(() => s.value.cookingBaseline, value => { cookingBaseline.value = value; });
  watch(() => store.connected, connected => { if (connected && !budget.value) budget.value = Math.floor(available(s.value)); });
  watch(() => task.status, value => {
    if (value === 'Failed') task.actual = 0;
    if (value === 'Completed' && deliveryDetail.value) task.actual = deliveryDetail.value.liters;
    if (value === 'Partially Delivered' && deliveryDetail.value
      && (task.actual <= 0 || task.actual >= deliveryDetail.value.liters)) task.actual = 0;
  });

  return {
    store, s, page, title, allowed, coordinator, barangay, personnel, reference, selectedTeam,
    activeTeams, activeResources, disabled, reports, verified, pending, corrections, visibleDeliveries,
    delivered, totalNeed, scopedCommitted, openReports, receiptPending, nextDeliveries, affectedBarangays,
    totalPopulation, totalHouseholds, focusReports, search, filter, dateFilter, filtered,
    deliverySearch, deliveryFilter, filteredDeliveries, directorySearch, directory,
    fromDate, toDate, invalidDateRange, analyticsReports, analyticsDeliveries, analyticsNeed, analyticsActual, analyticsCommitted,
    completionRate, scopedAudit, fmt, shortId, prettyDate, statusClass, reportName, periodNeed, reportActual,
    reportCommitted, progress, planningEndDate, active, available, committed, unmet,
    formError, showReportForm, editingId, detailId, detail, decisionReason, reportForm, formNeed,
    newReport, editReport, openReport, submitReport, review, closeReport,
    budget, drinkingBaseline, cookingBaseline, baselineReason, overrideReason, edits, recommendations, eligibleNeed, proposed,
    selectedAllocation, changedAllocation, budgetValid, allocationValid, resetAllocation, editAllocation, saveBaseline, allocate,
    resourceId, showResource, resourceForm, editingResource, openResource, saveResource, archiveResource,
    showTeam, editingTeamId, teamForm, openTeam, saveTeam,
    deliveryId, deliveryDetail, task, assignmentTeam, assignmentTeamChanged, openDelivery, assignDelivery, startDelivery,
    confirmDelivery, cancelDelivery, receiveDelivery, splitDelivery,
    exportReports, exportDeliveries, exportDirectory, exportAudit,
    reportStatuses: ['Pending', 'Verified', 'Correction requested', 'Rejected', 'Resolved', 'Withdrawn'],
    deliveryStatuses: ['Pending', 'Assigned', 'In Transit', 'Completed', 'Partially Delivered', 'Failed', 'Cancelled'],
    today: manilaToday,
  };
}
