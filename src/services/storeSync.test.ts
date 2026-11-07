import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { createEmptyState } from '../data/seed';
import type { State } from '../types';
const { load, mutate } = vi.hoisted(() => ({load:vi.fn(),mutate:vi.fn()}));
vi.mock('./repository', async importOriginal => {
  const original = await importOriginal<typeof import('./repository')>();
  return {...original,SupabaseWorkspaceRepository:class {load=load;mutate=mutate;}};
});
import { useAgos } from '../stores/agos';
function snapshot(revision:number, resourceName?:string):State {
  const state=createEmptyState();state.revision=revision;
  if(resourceName)state.resources.push({id:'source-1',name:resourceName,liters:100,active:true,notes:'',updated:'2026-11-08'});
  return state;
}
function deferred<T>() {
  let resolve!:(value:T)=>void,reject!:(cause:unknown)=>void;
  const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
}
beforeEach(()=>{vi.stubGlobal('localStorage',{getItem:vi.fn(()=>null),setItem:vi.fn()});setActivePinia(createPinia());load.mockReset();mutate.mockReset();});
describe('Shared workspace synchronization',()=>{
  it('keeps official references but refuses writes when the first connection fails',async()=>{
    load.mockRejectedValue(new Error('Network unavailable'));
    const store=useAgos();await store.initialize();
    expect(store.connected).toBe(false);expect(store.state.barangays).toHaveLength(62);
    expect(store.state.resources).toEqual([]);expect(store.state.reports).toEqual([]);
    expect(await store.act('resource.create',{name:'Unavailable',liters:1})).toBe(false);
    expect(mutate).not.toHaveBeenCalled();
  });
  it('never replaces a successful mutation with an older in-flight refresh',async()=>{
    load.mockResolvedValueOnce(snapshot(5));const store=useAgos();await store.initialize();
    const old=deferred<State>();load.mockReturnValueOnce(old.promise);
    const refreshing=store.refresh();
    mutate.mockResolvedValueOnce({state:snapshot(6,'New shared source'),message:'Supply saved'});
    expect(await store.act('resource.create',{name:'New shared source',liters:100})).toBe(true);
    old.resolve(snapshot(5));await refreshing;
    expect(store.state.revision).toBe(6);expect(store.state.resources[0]?.name).toBe('New shared source');
    expect(store.notice).toBe('Supply saved');expect(store.error).toBe('');
  });
  it('an outdated refresh failure does not disconnect a newly successful mutation',async()=>{
    load.mockResolvedValueOnce(snapshot(2));const store=useAgos();await store.initialize();
    const old=deferred<State>();load.mockReturnValueOnce(old.promise);const refreshing=store.refresh();
    mutate.mockResolvedValueOnce({state:snapshot(3,'Confirmed'),message:'Saved'});
    await store.act('resource.create',{name:'Confirmed',liters:100});
    old.reject(new Error('Earlier request timed out'));await refreshing;
    expect(store.connected).toBe(true);expect(store.state.revision).toBe(3);expect(store.error).toBe('');
  });
  it('a delayed mutation response does not replace an even newer shared snapshot',async()=>{
    load.mockResolvedValueOnce(snapshot(5));const store=useAgos();await store.initialize();
    const newer=deferred<State>(), response=deferred<{state:State;message:string}>();
    load.mockReturnValueOnce(newer.promise);const refreshing=store.refresh();
    mutate.mockReturnValueOnce(response.promise);const saving=store.act('resource.create',{name:'Own saved source',liters:100});
    newer.resolve(snapshot(7,'Newer shared state'));await refreshing;
    response.resolve({state:snapshot(6,'Own saved source'),message:'Own supply saved'});await saving;
    expect(store.state.revision).toBe(7);expect(store.state.resources[0]?.name).toBe('Newer shared state');
    expect(store.notice).toBe('Own supply saved');
  });
  it('refreshes uncertain writes and shows the failure without pretending that no operation happened',async()=>{
    load.mockResolvedValueOnce(snapshot(1));const store=useAgos();await store.initialize();
    mutate.mockRejectedValueOnce(new Error('Response was interrupted'));
    load.mockResolvedValueOnce(snapshot(2,'Persisted despite interrupted response'));
    expect(await store.act('resource.create',{name:'Persisted despite interrupted response',liters:100})).toBe(false);
    expect(store.state.revision).toBe(2);expect(store.state.resources).toHaveLength(1);
    expect(store.connected).toBe(true);expect(store.error).toBe('Response was interrupted');expect(store.saving).toBe(false);
  });
  it('does not let an earlier successful refresh erase a later mutation error',async()=>{
    load.mockResolvedValueOnce(snapshot(1));const store=useAgos();await store.initialize();
    const old=deferred<State>();load.mockReturnValueOnce(old.promise);const refreshing=store.refresh();
    mutate.mockRejectedValueOnce(new Error('Reservation conflict'));load.mockResolvedValueOnce(snapshot(2));
    await store.act('allocation.approve',{items:[]});old.resolve(snapshot(1));await refreshing;
    expect(store.state.revision).toBe(2);expect(store.error).toBe('Reservation conflict');
  });
  it('deduplicates overlapping refreshes instead of issuing parallel snapshot requests',async()=>{
    load.mockResolvedValueOnce(snapshot(1));const store=useAgos();await store.initialize();
    const current=deferred<State>();load.mockReturnValueOnce(current.promise);
    const first=store.refresh(),second=store.refresh();expect(load).toHaveBeenCalledTimes(2);
    current.resolve(snapshot(2));await Promise.all([first,second]);expect(store.state.revision).toBe(2);
  });
  it('sends declared profile context and current revision, and prevents overlapping saves',async()=>{
    load.mockResolvedValueOnce(snapshot(4));const store=useAgos();await store.initialize();
    store.role='Barangay Representative';store.community='Balite';
    const pending=deferred<{state:State;message:string}>();mutate.mockReturnValueOnce(pending.promise);
    const first=store.act('report.create',{population:100});
    expect(await store.act('report.create',{population:100})).toBe(false);
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0]).toEqual(['report.create',{population:100},{role:'Barangay Representative',community:'Balite',teamId:''},4]);
    pending.resolve({state:snapshot(5),message:'Report submitted'});expect(await first).toBe(true);
  });
});

