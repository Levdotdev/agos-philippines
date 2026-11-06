import {defineStore} from 'pinia';import {ref,watch} from 'vue';import {seed} from '../data/seed';import type {State,Role} from '../types';import {BrowserDemoRepository} from '../services/repository';
export const useAgos=defineStore('agos',()=>{const repository=new BrowserDemoRepository();let initial=seed();try{initial=repository.load()??initial}catch{}
const state=ref<State>(initial);const role=ref<Role>('LGU Coordinator');const community=ref('Bucayao');const notice=ref('');
watch(state,v=>{try{repository.save(v)}catch{notice.value='Browser storage unavailable. Changes last for this session only.'}},{deep:true});
function run(action:string,fn:(draft:State)=>void){try{const draft=structuredClone(JSON.parse(JSON.stringify(state.value))) as State;fn(draft);draft.audit.unshift({date:new Date().toISOString(),actor:role.value,action});state.value=draft;notice.value=action;}catch(e){notice.value=e instanceof Error?e.message:'Action failed'}}
function reset(){run('Demo data reset',s=>Object.assign(s,seed()))}return {state,role,community,notice,run,reset};});
