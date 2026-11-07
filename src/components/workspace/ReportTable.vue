<script setup lang="ts">
import { ArrowUpRight } from 'lucide-vue-next';
import { active, unmet } from '../../services/operations';
import type { Report, State } from '../../types';
import { planningEndDate } from './workspaceUtils';

const props = defineProps<{ reports: Report[]; state: State; compact?: boolean }>();
defineEmits<{ open: [report: Report] }>();
const fmt = (value: number) => value.toLocaleString('en-PH', { maximumFractionDigits: 1 });
const reserved = (id: string) => props.state.deliveries.filter(delivery => delivery.reportId === id && active(delivery))
  .reduce((sum, delivery) => sum + delivery.liters, 0);
const statusClass = (status: string) => ['Verified', 'Resolved'].includes(status) ? 'teal'
  : ['Rejected', 'Withdrawn'].includes(status) ? 'neutral' : 'amber';
</script>

<template>
  <div class="table-scroll">
    <table>
      <thead><tr>
        <th>REQUEST / BARANGAY</th><th>AFFECTED PEOPLE</th><th v-if="!compact">PLANNING PERIOD</th>
        <th>UNMET NEED</th><th v-if="!compact">COMMITTED</th><th>STATUS</th><th><span class="sr-only">Details</span></th>
      </tr></thead>
      <tbody>
        <tr v-for="report in reports" :key="report.id">
          <td><b>{{ report.barangay }}</b><small>{{ report.id.slice(0, 8).toUpperCase() }} · {{ report.date.slice(0, 10) }}</small></td>
          <td>{{ fmt(report.population) }}<small>{{ fmt(report.households) }} households</small></td>
          <td v-if="!compact">{{ report.planningDate }}<template v-if="report.planningDays>1"> – {{ planningEndDate(report.planningDate,report.planningDays) }}</template><small>{{ report.planningDays }} day{{ report.planningDays === 1 ? '' : 's' }} · {{ report.urgency ? 'Elevated urgency' : 'Standard urgency' }}</small></td>
          <td>{{ fmt(unmet(state, report)) }} L</td>
          <td v-if="!compact">{{ fmt(reserved(report.id)) }} L</td>
          <td><span :class="['badge', statusClass(report.status)]">{{ report.status }}</span></td>
          <td><button type="button" class="text-button" :aria-label="'View request for ' + report.barangay" @click="$emit('open', report)">View <ArrowUpRight :size="14" /></button></td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
