import { describe, expect, it } from 'vitest';
import type { Delivery, Report, State } from '../types';
import { createEmptyState, today } from '../data/seed';
import { active, approve, available, cancelDelivery, committed, reconcile, recommend, remainingNeed, requested, splitDelivery, unmet } from './operations';

const id = (n: number) => '00000000-0000-0000-0000-' + String(n).padStart(12, '0');
function report(n: number, changes: Partial<Report> = {}): Report {
  return { id: id(n), barangay: n === 1 ? 'Bucayao' : 'Balite', province: 'Oriental Mindoro',
    municipality: 'Calapan City', households: 25, population: 100, local: 0, days: 3,
    planningDays: 1, planningDate: '2026-11-08', urgency: false,
    description: 'Temporary drinking and food preparation water interruption.',
    date: '2026-11-08', status: 'Verified', reason: '', lat: null, lng: null,
    createdAt: '2026-11-08T00:00:00Z', updatedAt: '2026-11-08T00:00:00Z', ...changes };
}
function fixture(): State {
  return { ...createEmptyState(), reports: [report(1), report(2, {population: 50, households: 12})],
    resources: [{id:id(20),name:'Supply A',liters:1000,active:true,notes:'',updated:'2026-11-08'},
      {id:id(21),name:'Supply B',liters:500,active:true,notes:'',updated:'2026-11-08'}] };
}
function reserve(state: State, liters: number): Delivery {
  approve(state, [{reportId:id(1),liters}]);
  return state.deliveries.at(-1)!;
}

describe('Real reference state and planning scope', () => {
  it('starts with official barangay reference data and no invented operational records', () => {
    const state = createEmptyState();
    expect(state.barangays).toHaveLength(62);
    expect(new Set(state.barangays.map(b=>b.psgc)).size).toBe(62);
    expect(state.barangays.reduce((total,b)=>total+b.population,0)).toBe(148558);
    expect(state.barangays.reduce((total,b)=>total+b.households,0)).toBe(37833);
    expect([state.reports,state.resources,state.deliveries,state.teams,state.audit].every(rows=>rows.length===0)).toBe(true);
    expect(state.drinkingBaseline).toBe(3);
    expect(state.cookingBaseline).toBe(3);
    expect(state.baseline).toBe(6);
    const second=createEmptyState();state.barangays[0]!.sourceUrls!.push('changed');
    expect(second.barangays[0]!.sourceUrls).not.toContain('changed');
  });
  it('uses Manila calendar dates at the UTC date boundary', () => {
    expect(today(new Date('2026-11-07T16:30:00Z'))).toBe('2026-11-08');
    expect(today(new Date('2026-11-07T15:30:00Z'))).toBe('2026-11-07');
  });
  it('uses reported affected people and requested assistance days, not census population or elapsed shortage days', () => {
    const state=fixture(), r=state.reports[0]!;
    Object.assign(r,{population:100,local:50,planningDays:3,days:12});
    expect(requested(state,r)).toBe(1650);
    const delivery=reserve(state,600);delivery.status='In Transit';
    reconcile(state,delivery.id,400,'Partially Delivered','Access limited.');
    expect(unmet(state,r)).toBe(1250);
    reserve(state,200);
    expect(remainingNeed(state,r)).toBe(1050);
  });
  it('matches exact SQL decimal arithmetic instead of rounding an exact demand up by a liter', () => {
    const state=fixture();state.drinkingBaseline=.54;state.cookingBaseline=0;state.baseline=.54;
    const r=report(1,{population:450,local:0});
    expect(requested(state,r)).toBe(243);
    state.baseline=6.01;r.population=100;r.planningDays=3;
    expect(requested(state,r)).toBe(1803);
  });
  it('rejects invalid quantities and planning periods', () => {
    const state=fixture(), r=state.reports[0]!;
    for (const change of [{population:-1},{population:1.5},{population:0},{local:NaN},{planningDays:0},{planningDays:15}]) {
      expect(()=>requested(state,{...r,...change})).toThrow();
    }
    expect(()=>recommend(state,-1)).toThrow();
    expect(()=>recommend(state,Infinity)).toThrow();
    state.baseline=0;expect(()=>requested(state,r)).toThrow();
  });
});

describe('Fair allocation and reservations', () => {
  it('allocates scarce stock exactly with stable UUID tie-breaking', () => {
    const state=fixture();state.reports=[report(3,{population:1}),report(1,{population:1}),report(2,{population:1})];
    const rows=recommend(state,2);
    expect(rows.map(row=>[row.report.id,row.liters])).toEqual([[id(3),0],[id(1),1],[id(2),1]]);
    expect(rows.reduce((sum,row)=>sum+row.liters,0)).toBe(2);
    expect(recommend(state,2)).toEqual(rows);
  });
  it('retains exact largest-remainder shares when multiplication exceeds safe floating-point precision', () => {
    const state=fixture();state.baseline=60;
    state.resources=[{id:id(20),name:'Supply A',liters:1000000000,active:true,notes:'',updated:''}];
    state.reports=[0,1,2].map((offset)=>report(offset+1,{population:9000000+offset,planningDays:14}));
    expect(recommend(state,1000000000).map(row=>row.liters)).toEqual([333333296,333333333,333333371]);
  });
  it('excludes unverified and closed requests, inactive stocks, and active commitments', () => {
    const state=fixture();state.reports.push(report(3,{status:'Pending'}),report(4,{status:'Resolved'}),report(5,{status:'Rejected'}));
    state.resources[1]!.active=false;
    reserve(state,400);
    expect(available(state)).toBe(600);
    expect(remainingNeed(state,state.reports[0]!)).toBe(200);
    expect(recommend(state,10000).map(row=>row.report.id)).toEqual([id(1),id(2)]);
    expect(recommend(state,10000).reduce((sum,row)=>sum+row.liters,0)).toBe(500);
    expect(recommend(state,0).every(row=>row.liters===0)).toBe(true);
  });
  it('rejects duplicate, unverified, fractional, excessive, negative or empty approvals without changing state', () => {
    const state=fixture();state.reports[1]!.status='Pending';
    const invalid=[
      [{reportId:id(2),liters:1}], [{reportId:id(1),liters:601}],
      [{reportId:id(1),liters:.5}], [{reportId:id(1),liters:-1}], [],
      [{reportId:id(1),liters:1},{reportId:id(1),liters:1}],
      [{reportId:id(99),liters:1}],
    ];
    for (const items of invalid) {
      const before=structuredClone(state);
      expect(()=>approve(state,items)).toThrow();expect(state).toEqual(before);
    }
    reserve(state,400);expect(()=>approve(state,[{reportId:id(1),liters:201}])).toThrow();
  });
  it('reserves across individual sources without consuming physical stock', () => {
    const state=fixture();state.resources[0]!.liters=60;state.resources[1]!.liters=40;
    const delivery=reserve(state,100);
    expect(delivery.sources).toEqual([{resourceId:id(20),liters:60},{resourceId:id(21),liters:40}]);
    expect(committed(state,id(20))).toBe(60);expect(available(state)).toBe(0);
    expect(state.resources.map(source=>source.liters)).toEqual([60,40]);
  });
});

describe('Delivery reconciliation, cancellation and splitting', () => {
  it('completes a delivery once and consumes actual physical liters once', () => {
    const state=fixture(), delivery=reserve(state,400);delivery.status='In Transit';
    reconcile(state,delivery.id,400,'Completed','Handover recorded.');
    expect(delivery.actual).toBe(400);expect(active(delivery)).toBe(false);
    expect(state.resources[0]!.liters).toBe(600);expect(committed(state)).toBe(0);
    expect(unmet(state,state.reports[0]!)).toBe(200);
    expect(()=>reconcile(state,delivery.id,400,'Completed','Again')).toThrow();
    expect(state.resources[0]!.liters).toBe(600);
  });
  it('releases unused reservations on partial or failed outcomes', () => {
    const state=fixture(), partial=reserve(state,400);partial.status='In Transit';
    const before=available(state);
    reconcile(state,partial.id,250,'Partially Delivered','Road closure.');
    expect(available(state)).toBe(before+150);
    expect(state.resources[0]!.liters).toBe(750);
    const failed=reserve(state,200);failed.status='In Transit';
    const stock=state.resources.reduce((sum,r)=>sum+r.liters,0), reserved=committed(state);
    reconcile(state,failed.id,0,'Failed','Vehicle fault.');
    expect(state.resources.reduce((sum,r)=>sum+r.liters,0)).toBe(stock);
    expect(committed(state)).toBe(reserved-200);
  });
  it('validates all outcomes before changing a delivery or any source', () => {
    const state=fixture(), delivery=reserve(state,400);delivery.status='In Transit';
    const invalid:[number,'Completed'|'Failed'|'Partially Delivered',string][]=[
      [399,'Completed',''],[1,'Failed','Reason'],[0,'Partially Delivered','Reason'],
      [400,'Partially Delivered','Reason'],[200,'Partially Delivered',''],[NaN,'Completed',''],[401,'Completed',''],
    ];
    for(const [actual,status,notes] of invalid){
      const before=structuredClone(state);expect(()=>reconcile(state,delivery.id,actual,status,notes)).toThrow();expect(state).toEqual(before);
    }
    state.deliveries[0]!.sources=[{resourceId:id(20),liters:50}];
    const before=structuredClone(state);expect(()=>reconcile(state,delivery.id,400,'Completed','')).toThrow();expect(state).toEqual(before);
  });
  it('cancels pending/assigned deliveries without consuming stock and never cancels an in-transit trip', () => {
    const state=fixture(), delivery=reserve(state,400), stock=state.resources[0]!.liters;
    expect(()=>cancelDelivery(state,delivery.id,'')).toThrow();
    cancelDelivery(state,delivery.id,'No longer required.');
    expect(available(state)).toBe(1500);expect(state.resources[0]!.liters).toBe(stock);
    expect(delivery.status).toBe('Cancelled');
    const transit=reserve(state,300);transit.status='In Transit';
    expect(()=>cancelDelivery(state,transit.id,'Reason')).toThrow();
  });
  it('splits pending trips while preserving exact per-source reservations and total need', () => {
    const state=fixture();state.resources[0]!.liters=250;state.resources[1]!.liters=250;
    const delivery=reserve(state,500), before=available(state), need=remainingNeed(state,state.reports[0]!);
    splitDelivery(state,delivery.id,200);
    expect(state.deliveries.map(d=>d.liters)).toEqual([200,200,100]);
    expect(new Set(state.deliveries.map(d=>d.id)).size).toBe(3);
    expect(state.deliveries[0]!.id).toBe(delivery.id);
    expect(committed(state)).toBe(500);expect(committed(state,id(20))).toBe(250);expect(committed(state,id(21))).toBe(250);
    expect(available(state)).toBe(before);expect(remainingNeed(state,state.reports[0]!)).toBe(need);
    for (const trip of state.deliveries) expect(trip.sources.reduce((sum,source)=>sum+source.liters,0)).toBe(trip.liters);
  });
  it('rejects zero, oversized, excessive or already-assigned splits without changing state', () => {
    const state=fixture(), delivery=reserve(state,600);
    for(const chunk of [0,-1,600,601,10,1.5]){
      const before=structuredClone(state);expect(()=>splitDelivery(state,delivery.id,chunk)).toThrow();expect(state).toEqual(before);
    }
    delivery.status='Assigned';expect(()=>splitDelivery(state,delivery.id,200)).toThrow();
  });
  it('uses the same stable per-source order as the database when splitting and reconciling', () => {
    const state=fixture();state.resources=[state.resources[1]!,state.resources[0]!];
    state.resources.forEach(source=>source.liters=50);
    const delivery=reserve(state,100);
    splitDelivery(state,delivery.id,60);
    expect(state.deliveries[0]!.sources).toEqual([{resourceId:id(20),liters:50},{resourceId:id(21),liters:10}]);
    state.deliveries[0]!.status='In Transit';
    reconcile(state,delivery.id,40,'Partially Delivered','Source-order parity check.');
    expect(state.resources.find(source=>source.id===id(20))!.liters).toBe(10);
    expect(state.resources.find(source=>source.id===id(21))!.liters).toBe(50);
  });
});

