import type {State,Report,Delivery} from '../types';
export const active=(d:Delivery)=>['Pending','Assigned','In Transit'].includes(d.status);
export function positive(n:number,label='Quantity'){if(!Number.isFinite(n)||n<0)throw Error(`${label} must be a non-negative number`);return n}
export function unmet(s:State,r:Report){return Math.max(0,r.population*s.baseline-r.local-s.deliveries.filter(d=>d.reportId===r.id).reduce((a,d)=>a+d.actual,0))}
export function committed(s:State,id?:string){return s.deliveries.filter(active).reduce((a,d)=>a+(id?d.sources.filter(x=>x.resourceId===id).reduce((v,x)=>v+x.liters,0):d.liters),0)}
export function available(s:State){return Math.max(0,s.resources.reduce((a,r)=>a+r.liters,0)-committed(s))}
export function recommend(s:State,budget=available(s)){
positive(budget);positive(s.baseline);s.reports.forEach(r=>{positive(r.population);positive(r.local)});
const rows=s.reports.filter(r=>r.status==='Verified').map(r=>({report:r,need:Math.max(0,unmet(s,r)-s.deliveries.filter(d=>d.reportId===r.id&&active(d)).reduce((a,d)=>a+d.liters,0)),liters:0})).filter(r=>r.need>0);
const total=rows.reduce((a,r)=>a+r.need,0);const cap=Math.floor(Math.min(budget,available(s),total));
rows.forEach(r=>r.liters=total?Math.floor(cap*r.need/total):0);
let left=cap-rows.reduce((a,r)=>a+r.liters,0);
const order=[...rows].sort((a,b)=>(cap*b.need/total-b.liters)-(cap*a.need/total-a.liters)||a.report.id.localeCompare(b.report.id));
for(const r of order){if(left>0&&r.liters<r.need){r.liters++;left--}}
return rows;
}
export function approve(s:State,items:{reportId:string;liters:number}[]){
const total=items.reduce((a,x)=>a+positive(x.liters),0);if(!total||total>available(s))throw Error('Allocation exceeds available inventory or is empty');
if(new Set(items.map(x=>x.reportId)).size!==items.length)throw Error('Duplicate community in approval');
for(const x of items){const r=s.reports.find(r=>r.id===x.reportId);if(!r||r.status!=='Verified')throw Error('Verification required');if(!Number.isInteger(x.liters)||x.liters>unmet(s,r)-s.deliveries.filter(d=>d.reportId===r.id&&active(d)).reduce((a,d)=>a+d.liters,0))throw Error('Duplicate or excessive allocation');}
const free=s.resources.map(r=>({id:r.id,liters:r.liters-committed(s,r.id)}));
for(const x of items.filter(x=>x.liters>0)){let remain=x.liters;const sources:Delivery['sources']=[];for(const r of free){const take=Math.min(remain,r.liters);if(take){sources.push({resourceId:r.id,liters:take});r.liters-=take;remain-=take}}
s.deliveries.push({id:crypto.randomUUID(),reportId:x.reportId,liters:x.liters,actual:0,status:'Pending',person:'',vehicle:'',scheduled:'',completed:'',notes:'',sources});}
}
export function reconcile(s:State,id:string,actual:number,status:'Completed'|'Failed'|'Partially Delivered',notes:string){
const d=s.deliveries.find(d=>d.id===id);if(!d||!active(d)||d.status!=='In Transit')throw Error('Delivery must be in transit and unconfirmed');positive(actual);if(actual>d.liters||!Number.isInteger(actual))throw Error('Actual liters must be an integer within assigned quantity');if(status==='Completed'&&actual!==d.liters)throw Error('Use partial delivery for an incomplete quantity');if(status==='Failed'&&actual!==0)throw Error('Failed delivery must record zero liters');if(status==='Partially Delivered'&&(actual<=0||actual>=d.liters))throw Error('Partial quantity must be between zero and assigned liters');if(status!=='Completed'&&!notes.trim())throw Error('Explain failed or partial delivery');
let remaining=actual;for(const source of d.sources){const r=s.resources.find(r=>r.id===source.resourceId);if(!r)throw Error('Supply record missing');const take=Math.min(remaining,source.liters);if(r.liters<take)throw Error('Insufficient source inventory');remaining-=take;}
remaining=actual;for(const source of d.sources){const take=Math.min(remaining,source.liters);s.resources.find(r=>r.id===source.resourceId)!.liters-=take;remaining-=take;}
d.actual=actual;d.status=status;d.notes=notes;d.completed=new Date().toISOString();
}
