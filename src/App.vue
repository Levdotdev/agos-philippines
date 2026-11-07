<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAgos } from './stores/agos';
import { Boxes, ChartNoAxesCombined, ChevronDown, ChevronRight, ClipboardList, Droplets, Globe, LayoutDashboard, Map, MapPin, RefreshCw, ShieldCheck, Truck, Users, Wifi, WifiOff, X } from 'lucide-vue-next';
import type { Role } from './types';
const store = useAgos(), route = useRoute(), router = useRouter();
const profileOpen = ref(false), profile = ref<HTMLElement>();
const roles: Role[] = ['LGU Coordinator', 'Barangay Representative', 'Delivery Personnel'];
const links = [
  ['dashboard', 'Overview', LayoutDashboard], ['reports', 'Shortage reports', ClipboardList],
  ['map', 'Crisis map', Map], ['allocation', 'Water allocation', Droplets],
  ['inventory', 'Water resources', Boxes], ['deliveries', 'Delivery operations', Truck],
  ['communities', 'Barangay directory', Users], ['analytics', 'Reports & analytics', ChartNoAxesCombined],
] as const;
const nav = computed(() => links.filter(([id]) => store.role === 'LGU Coordinator'
  || (store.role === 'Barangay Representative' ? ['dashboard','reports','map','deliveries','communities'].includes(id) : ['dashboard','deliveries'].includes(id))));
const currentPage = computed(() => String(route.params.page || 'dashboard'));
const initials = computed(() => store.role === 'LGU Coordinator' ? 'LC' : store.role === 'Barangay Representative' ? 'BR' : 'DP');
const selectedTeam = computed(() => store.state.teams.find(team => team.id === store.teamId));
const context = computed(() => store.role === 'Barangay Representative' ? store.community : store.role === 'Delivery Personnel' ? selectedTeam.value?.name || 'Choose a delivery team' : 'Citywide response');
const connectionLabel = computed(() => store.loading ? 'Connecting' : store.saving ? 'Saving' : store.connected ? 'Connected' : 'Not connected');
function changeRole() { void router.push('/dashboard'); }
function changeContext() { void router.push('/dashboard'); }
function closeProfile(event: MouseEvent) { if (!profile.value?.contains(event.target as Node)) profileOpen.value = false; }
function escape(event: KeyboardEvent) { if (event.key === 'Escape') profileOpen.value = false; }
function refresh() { if (!store.saving) void store.refresh(); }
function focusRefresh() { if (document.visibilityState === 'visible') refresh(); }
let refreshTimer: ReturnType<typeof setInterval> | undefined;
watch([() => store.role, currentPage], () => { if (!nav.value.some(([id]) => id === currentPage.value)) void router.replace('/dashboard'); });
onMounted(() => {
  void store.initialize();
  document.addEventListener('click', closeProfile);
  document.addEventListener('keydown', escape);
  window.addEventListener('focus', focusRefresh);
  refreshTimer = setInterval(focusRefresh, 30000);
});
onBeforeUnmount(() => {
  document.removeEventListener('click', closeProfile);
  document.removeEventListener('keydown', escape);
  window.removeEventListener('focus', focusRefresh);
  clearInterval(refreshTimer);
});
</script>
<template>
  <div class="shell">
    <aside class="workspace-sidebar">
      <RouterLink class="brand" to="/dashboard" aria-label="AGOS Philippines home"><img src="/agos-crisis-location.png" alt="AGOS Philippines crisis location wave logo" width="1312" height="1199"></RouterLink>
      <p class="side-label">POTABLE WATER RESPONSE</p>
      <nav aria-label="Main navigation">
        <RouterLink v-for="[id,label,icon] in nav" :key="id" :to="'/'+id" :class="{selected:currentPage===id}" :title="label">
          <component :is="icon" :size="19"/><span>{{label}}</span><ChevronRight v-if="currentPage===id" class="nav-chevron" :size="14"/>
        </RouterLink>
      </nav>
      <div class="pilot"><div class="pilot-location"><MapPin :size="15"/> CALAPAN CITY</div><p>Smarter water response.<br>Stronger communities.</p><div class="pilot-coverage"><Globe :size="16"/><span>{{store.state.barangays.length||62}} barangays, one shared response.</span></div></div>
      <div class="sidebar-bottom"><ShieldCheck :size="19"/><span>Every liter accounted for<small>Transparent, coordinated assistance</small></span></div>
    </aside>
    <main class="workspace-main">
      <header class="workspace-header">
        <div class="breadcrumb"><span>Calapan City</span><ChevronRight :size="14"/><b>{{links.find(([id])=>id===currentPage)?.[1]||'Overview'}}</b></div>
        <div class="header-right">
          <button class="connection-status" :class="{offline:!store.connected&&!store.loading}" :title="store.connected?'Refresh shared records':'Retry database connection'" :disabled="store.loading||store.saving" @click="refresh">
            <RefreshCw v-if="store.loading||store.saving" :size="14" class="spinning"/><Wifi v-else-if="store.connected" :size="14"/><WifiOff v-else :size="14"/><span>{{connectionLabel}}</span>
          </button>
          <div ref="profile" class="profile-wrap">
            <button class="profile-trigger" aria-label="Open workspace profile" aria-controls="workspace-profile" :aria-expanded="profileOpen" @click="profileOpen=!profileOpen"><span class="profile-caption"><b>{{store.role}}</b><small>{{context}}</small></span><span class="avatar">{{initials}}</span><ChevronDown :size="14"/></button>
            <section v-if="profileOpen" id="workspace-profile" class="profile-menu" aria-label="Workspace profile">
              <div class="profile-menu-heading"><span class="avatar large">{{initials}}</span><div><h2>Workspace profile</h2><p>Choose your response tools.</p></div><button class="icon-button" aria-label="Close profile" @click="profileOpen=false"><X :size="18"/></button></div>
              <label>Workspace role<select v-model="store.role" aria-label="Workspace role" :disabled="store.saving" @change="changeRole"><option v-for="role in roles" :key="role">{{role}}</option></select></label>
              <label v-if="store.role==='Barangay Representative'">Your barangay<select v-model="store.community" aria-label="Your barangay" :disabled="store.saving" @change="changeContext"><option v-for="barangay in store.state.barangays" :key="barangay.id" :value="barangay.name">{{barangay.name}}</option></select></label>
              <label v-if="store.role==='Delivery Personnel'">Your delivery team<select v-model="store.teamId" aria-label="Your delivery team" :disabled="store.saving" @change="changeContext"><option value="">Choose a team</option><option v-for="team in store.state.teams.filter(team=>team.active)" :key="team.id" :value="team.id">{{team.name}}</option></select><small v-if="!store.state.teams.some(team=>team.active)" class="muted">An LGU coordinator can add teams in Water resources.</small></label>
              <div class="profile-scope"><MapPin :size="15"/><span>{{context}}<small>Calapan City · Oriental Mindoro</small></span></div>
              <p class="open-workspace-note">This is a shared workspace without sign-in. Roles select tools and views; they do not restrict access.</p>
            </section>
          </div>
        </div>
      </header>
      <div v-if="store.error" class="connection-error" role="alert"><WifiOff :size="18"/><div><b>{{store.connected ? 'The action was not saved.' : 'We couldn’t sync the workspace.'}}</b><p>{{store.error}}</p></div><button class="secondary" :disabled="store.loading||store.saving" @click="refresh">{{store.connected ? 'Refresh' : 'Retry'}}</button></div>
      <div v-if="store.notice" class="toast" role="status"><span>{{store.notice}}</span><button aria-label="Dismiss notification" @click="store.notice=''"><X :size="16"/></button></div>
      <RouterView/>
      <footer><b>AGOS Philippines</b><span>Drinking + food preparation · Calapan City</span><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">Map data © OpenStreetMap</a></footer>
    </main>
  </div>
</template>

