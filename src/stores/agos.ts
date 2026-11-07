import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import type { Role } from '../types';
import { emptyState, SupabaseWorkspaceRepository } from '../services/repository';
const preferenceKey = 'agos-workspace-preferences-v1';
const roles: Role[] = ['LGU Coordinator', 'Barangay Representative', 'Delivery Personnel'];
export const useAgos = defineStore('agos', () => {
  const repository = new SupabaseWorkspaceRepository();
  let preferences: { role?: Role; community?: string; teamId?: string } = {};
  try { preferences = JSON.parse(localStorage.getItem(preferenceKey) || '{}'); } catch { /* UI preferences are optional. */ }
  const state = ref(emptyState());
  const role = ref<Role>(roles.includes(preferences.role as Role) ? preferences.role! : 'LGU Coordinator');
  const community = ref(preferences.community || 'Bucayao');
  const teamId = ref(preferences.teamId || '');
  const notice = ref('');
  const error = ref('');
  const loading = ref(false);
  const saving = ref(false);
  const connected = ref(false);
  const lastSyncedAt = ref<string | null>(null);
  let started = false;
  let refreshing: Promise<void> | null = null;
  let mutationGeneration = 0;
  watch([role, community, teamId], () => {
    try { localStorage.setItem(preferenceKey, JSON.stringify({ role: role.value, community: community.value, teamId: teamId.value })); } catch { /* Never substitute local storage for the database. */ }
  });
  function updatePreferences() {
    if (state.value.barangays.length && !state.value.barangays.some(b => b.name === community.value)) community.value = state.value.barangays[0]!.name;
    if (!state.value.teams.some(t => t.id === teamId.value && t.active)) teamId.value = state.value.teams.find(t => t.active)?.id || '';
  }
  async function refresh() {
    if (saving.value) return;
    if (refreshing) return refreshing;
    const generation = mutationGeneration;
    refreshing = (async () => {
      loading.value = true;
      try {
        const incoming = await repository.load();
        if (incoming.revision >= state.value.revision) state.value = incoming;
        connected.value = true;
        lastSyncedAt.value = new Date().toISOString();
        if (generation === mutationGeneration) error.value = '';
        updatePreferences();
      } catch (cause) {
        if (generation === mutationGeneration) {
          connected.value = false;
          error.value = cause instanceof Error ? cause.message : 'Unable to load the workspace';
        }
      } finally { loading.value = false; refreshing = null; }
    })();
    return refreshing;
  }
  async function initialize() { if (!started) { started = true; await refresh(); } }
  async function act(command: string, payload: Record<string, unknown>): Promise<boolean> {
    if (saving.value) return false;
    if (!connected.value) { error.value = 'Connect to the database before recording an operation.'; return false; }
    saving.value = true; error.value = ''; notice.value = '';
    mutationGeneration++;
    try {
      const result = await repository.mutate(command, payload, { role: role.value, community: community.value, teamId: teamId.value }, state.value.revision);
      if (result.state.revision >= state.value.revision) state.value = result.state;
      notice.value = result.message; connected.value = true;
      lastSyncedAt.value = new Date().toISOString(); updatePreferences();
      return true;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Operation could not be confirmed';
      try { const incoming = await repository.load(); if (incoming.revision >= state.value.revision) state.value = incoming; connected.value = true; lastSyncedAt.value = new Date().toISOString(); updatePreferences(); } catch { connected.value = false; }
      error.value = message; return false;
    } finally { saving.value = false; }
  }
  return { state, role, community, teamId, notice, error, loading, saving, connected, lastSyncedAt, initialize, refresh, act };
});
