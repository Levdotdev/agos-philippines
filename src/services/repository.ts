import type {State} from '../types';
export interface DemoRepository {load():State|null;save(state:State):void;}
export class BrowserDemoRepository implements DemoRepository {
 constructor(private readonly key='agos-demo-v1'){}
 load():State|null {const raw=localStorage.getItem(this.key);if(!raw)return null;const v=JSON.parse(raw);if(!Array.isArray(v.reports)||!Array.isArray(v.resources)||!Array.isArray(v.deliveries)||!Array.isArray(v.audit)||!Number.isFinite(v.baseline))throw Error('Invalid stored demo');return v as State;}
 save(state:State){localStorage.setItem(this.key,JSON.stringify(state));}
}
