import type { State, WorkspaceContext } from '../types';
import { supabaseConfig } from '../config/supabase';
import { createEmptyState } from '../data/seed';

export interface MutationResult { state: State; message: string }
export interface WorkspaceRepository {
  load(): Promise<State>;
  mutate(command: string, payload: Record<string, unknown>, context: WorkspaceContext, revision: number): Promise<MutationResult>;
}
export function emptyState(): State {
  return createEmptyState();
}
function validateState(value: unknown): State {
  const state = value as State;
  if (!state || !Number.isFinite(state.baseline) || !Number.isFinite(state.drinkingBaseline) || !Number.isFinite(state.cookingBaseline)
    || Math.abs(state.baseline - state.drinkingBaseline - state.cookingBaseline) > 0.001
    || !Number.isSafeInteger(state.revision) || state.revision < 0
    || !['reports', 'resources', 'teams', 'deliveries', 'audit', 'barangays'].every(key => Array.isArray(state[key as keyof State]))) {
    throw Error('The database returned an unsupported workspace format. Apply the AGOS schema before continuing.');
  }
  return state;
}
/** Only a publishable key is used. No sign-in session or browser-stored operational data. */
export class SupabaseWorkspaceRepository implements WorkspaceRepository {
  private readonly url: string;
  private readonly key: string;
  constructor() {
    this.url = String(import.meta.env.VITE_SUPABASE_URL || supabaseConfig.url || '').replace(/\/$/, '');
    this.key = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || supabaseConfig.publishableKey || '');
  }
  private async rpc(name: string, payload: Record<string, unknown>): Promise<unknown> {
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(this.url) || !this.key) {
      throw Error('Database connection is not configured. Set the project URL and publishable key.');
    }
    if (this.key.startsWith('sb_secret_')) throw Error('A secret key cannot be used in the browser. Configure a publishable key.');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const headers: Record<string, string> = { apikey: this.key, 'Content-Type': 'application/json' };
      if (this.key.startsWith('eyJ')) {
        let role = '';
        try { role = JSON.parse(atob(this.key.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/'))).role; } catch { throw Error('Invalid public API key'); }
        if (role !== 'anon') throw Error('Only a publishable or legacy anon key is permitted in the browser');
        headers.Authorization = `Bearer ${this.key}`;
      }
      const response = await fetch(`${this.url}/rest/v1/rpc/${name}`, { method: 'POST', headers, body: JSON.stringify(payload), signal: controller.signal, cache: 'no-store' });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        const message = body?.message || body?.error || `Database request failed (${response.status})`;
        if (String(message).includes('schema cache') || response.status === 404) throw Error('AGOS database setup is incomplete. The workspace functions are not available yet.');
        throw Error(String(message));
      }
      return body;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw Error('Database request timed out. Refresh to check whether the action was recorded before retrying.');
      if (error instanceof TypeError) throw Error('Cannot reach the database. Check your connection; changes have not been confirmed.');
      throw error;
    } finally { clearTimeout(timeout); }
  }
  async load(): Promise<State> { return validateState(await this.rpc('agos_snapshot', {})); }
  async mutate(command: string, payload: Record<string, unknown>, context: WorkspaceContext, revision: number): Promise<MutationResult> {
    const result = await this.rpc('agos_mutate', { p_command: command, p_payload: payload, p_context: context, p_expected_revision: revision }) as MutationResult;
    return { state: validateState(result?.state), message: String(result?.message || 'Changes saved') };
  }
}
