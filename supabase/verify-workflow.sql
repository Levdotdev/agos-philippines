-- Run only against a fresh AGOS setup after seeding its official 62 barangays.
-- Every synthetic operational record, helper and test result is rolled back.
-- No real shortage, supply or delivery record survives this script.
begin;
create temporary table agos_test_results(label text primary key);
create or replace function pg_temp.agos_check(label text, ok boolean)
returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'AGOS assertion failed: %',label; end if;
  insert into agos_test_results values(label);
end $$;
create or replace function pg_temp.agos_call(command text,payload jsonb,context jsonb)
returns jsonb language sql as $$
  select public.agos_mutate(command,payload,context,(select revision from public.agos_settings where singleton));
$$;
create or replace function pg_temp.agos_reject(label text,command text,payload jsonb,context jsonb,fragment text,revision bigint default null)
returns void language plpgsql as $$
declare before_state jsonb:=public.agos_snapshot(); rejected boolean:=false;
begin
  begin
    perform public.agos_mutate(command,payload,context,coalesce(revision,(before_state->>'revision')::bigint));
  exception when others then
    if position(lower(fragment) in lower(sqlerrm))=0 then raise exception 'Unexpected error for %: %',label,sqlerrm; end if;
    rejected:=true;
  end;
  perform pg_temp.agos_check(label,rejected and public.agos_snapshot()=before_state);
end $$;

do $$
declare
  lgu jsonb:='{"role":"LGU Coordinator","community":"Bucayao","teamId":""}';
  br jsonb:='{"role":"Barangay Representative","community":"Bucayao","teamId":""}';
  balite jsonb:='{"role":"Barangay Representative","community":"Balite","teamId":""}';
  dp jsonb;
  payload jsonb:='{"households":20,"population":100,"local":100,"days":7,"planningDays":3,"planningDate":"2099-11-08","description":"Contract verification only; all records roll back.","lat":null,"lng":null}';
  first_report uuid; second_report uuid; adjacent_report uuid; supply uuid; crew uuid;
  first_trip uuid; second_trip uuid; third_trip uuid; other_trip uuid;
  before_sources jsonb; qty bigint; total_stock bigint; tbl text; before_revision bigint;
begin
  if exists(select 1 from public.agos_reports) or exists(select 1 from public.agos_resources) or exists(select 1 from public.agos_deliveries) or exists(select 1 from public.agos_teams) then
    raise exception 'This initial-setup verification requires an empty operational workspace. Use an isolated verification database once real operations have begun.';
  end if;
  perform pg_temp.agos_check('62 official barangays and census totals',
    (select count(*)=62 and sum(population)=148558 and sum(households)=37833 and sum(household_population)=148031 from public.agos_barangays));
  perform pg_temp.agos_check('Drinking and preparation defaults exclude bathing',
    (select drinking_baseline=3 and cooking_baseline=3 and baseline=6 from public.agos_settings));
  foreach tbl in array array['agos_settings','agos_barangays','agos_reports','agos_resources','agos_teams','agos_deliveries','agos_delivery_sources','agos_audit'] loop
    perform pg_temp.agos_check('No anonymous direct writes: '||tbl,not has_table_privilege('anon','public.'||tbl,'INSERT,UPDATE,DELETE'));
    perform pg_temp.agos_check('RLS enabled: '||tbl,(select relrowsecurity from pg_class where oid=('public.'||tbl)::regclass));
  end loop;
  perform pg_temp.agos_check('Anonymous bounded API is callable',has_function_privilege('anon','public.agos_mutate(text,jsonb,jsonb,bigint)','EXECUTE'));
  perform pg_temp.agos_check('Private helper is not callable by anonymous users',not has_function_privilege('anon','agos_private.integer_arg(jsonb,text,bigint,bigint,bigint)','EXECUTE'));
  perform pg_temp.agos_reject('Reject unknown role','resource.create','{"name":"Test","liters":1}','{"role":"Owner"}','workspace role');
  perform pg_temp.agos_reject('Reject nonobject payload','report.create','[]',br,'Invalid operation payload');
  perform pg_temp.agos_reject('Reject wrong workflow','report.create',payload,lgu,'Barangay Representative');
  perform pg_temp.agos_reject('Reject fractional people','report.create',payload||'{"population":1.5}',br,'whole number');
  perform pg_temp.agos_reject('Reject zero affected people','report.create',payload||'{"population":0}',br,'whole number');
  perform pg_temp.agos_reject('Reject households greater than people','report.create',payload||'{"households":101}',br,'households cannot exceed');
  perform pg_temp.agos_reject('Reject invalid planning length','report.create',payload||'{"planningDays":0}',br,'whole number');
  perform pg_temp.agos_reject('Reject infinite planning date','report.create',payload||'{"planningDate":"infinity"}',br,'planning date');
  perform pg_temp.agos_reject('Reject incomplete coordinate pair','report.create',payload||'{"lat":null,"lng":121}',br,'valid coordinates');
  perform pg_temp.agos_call('report.create',payload,br);
  select id into first_report from public.agos_reports where barangay='Bucayao' and planning_date='2099-11-08';
  perform pg_temp.agos_check('Explicit null coordinates stay unknown',(select lat is null and lng is null from public.agos_reports where id=first_report));
  perform pg_temp.agos_check('Affected-count planning demand is 1500 L',agos_private.unmet_need(first_report)=1500);
  perform pg_temp.agos_reject('Reject overlapping active periods','report.create',payload||'{"planningDate":"2099-11-09","planningDays":1}',br,'active report');
  perform pg_temp.agos_call('report.create',payload||'{"planningDate":"2099-11-11","planningDays":1}',br);
  select id into adjacent_report from public.agos_reports where barangay='Bucayao' and planning_date='2099-11-11';
  perform pg_temp.agos_check('Adjacent nonoverlapping request is allowed',adjacent_report is not null);
  perform pg_temp.agos_reject('Reject missing withdrawal reason','report.withdraw',jsonb_build_object('id',adjacent_report),br,'reason');
  perform pg_temp.agos_call('report.withdraw',jsonb_build_object('id',adjacent_report,'reason','Test adjacent request withdrawal.'),br);
  perform pg_temp.agos_call('report.review',jsonb_build_object('id',first_report,'status','Correction requested','reason','Clarify measured household count.'),lgu);
  perform pg_temp.agos_call('report.update',payload||jsonb_build_object('id',first_report,'description','Corrected aggregate household count; verification transaction only.'),br);
  perform pg_temp.agos_check('Correction reason survives resubmission in immutable audit',
    exists(select 1 from public.agos_audit where action like '%Clarify measured household count.%')
    and (select reason='' and status='Pending' from public.agos_reports where id=first_report));
  perform pg_temp.agos_call('report.review',jsonb_build_object('id',first_report,'status','Verified','reason','Counts reviewed.'),lgu);
  perform pg_temp.agos_reject('Cannot edit an already verified request','report.update',payload||jsonb_build_object('id',first_report),br,'Only your pending');
  perform pg_temp.agos_call('report.create',payload||'{"local":0,"planningDays":1}',balite);
  select id into second_report from public.agos_reports where barangay='Balite';
  perform pg_temp.agos_call('report.review',jsonb_build_object('id',second_report,'status','Verified','reason','Balite counts reviewed.'),lgu);
  perform pg_temp.agos_check('Review audit uses actual report barangay, not LGU profile preference',
    exists(select 1 from public.agos_audit where command='report.review' and community='Balite'));
  perform pg_temp.agos_call('resource.create','{"name":"Verification source A","liters":1000,"notes":"Contract test, rollback only."}',lgu);
  perform pg_temp.agos_call('resource.create','{"name":"Verification source B","liters":500,"notes":"Contract test, rollback only."}',lgu);
  perform pg_temp.agos_call('team.create','{"name":"Verification crew","capacity":400,"vehicle":"VERIFY-01"}',lgu);
  select id into crew from public.agos_teams where name='Verification crew';
  dp:=jsonb_build_object('role','Delivery Personnel','community','','teamId',crew);
  perform pg_temp.agos_reject('Reject fractional stock','resource.create','{"name":"Invalid source","liters":1.5}',lgu,'whole number');
  perform pg_temp.agos_reject('Reject allocation without override explanation','allocation.approve',
    jsonb_build_object('items',jsonb_build_array(jsonb_build_object('reportId',first_report,'liters',1000),jsonb_build_object('reportId',second_report,'liters',200)),'budget',1200),lgu,'explanation');
  perform pg_temp.agos_call('allocation.approve',
    jsonb_build_object('items',jsonb_build_array(jsonb_build_object('reportId',first_report,'liters',1000),jsonb_build_object('reportId',second_report,'liters',200)),'budget',1200,'reason','Verification of a documented manual allocation.'),lgu);
  perform pg_temp.agos_check('Stock remains physical until delivery and reservations are atomic',
    (select sum(liters)=1500 from public.agos_resources) and agos_private.commitment()=1200 and agos_private.available_stock()=300);
  perform pg_temp.agos_check('Each barangay gets its own allocation audit entry',
    exists(select 1 from public.agos_audit where command='allocation.approve' and community='Balite')
    and exists(select 1 from public.agos_audit where command='allocation.approve' and community='Bucayao'));
  select id,agos_private.commitment(id) into supply,qty from public.agos_resources where agos_private.commitment(id)>0 order by id limit 1;
  perform pg_temp.agos_reject('Cannot reduce stock below reservations','resource.update',jsonb_build_object('id',supply,'liters',qty-1,'notes','Invalid adjustment.'),lgu,'reserved stock');
  perform pg_temp.agos_reject('Cannot lower allowance below commitments','settings.update','{"drinkingBaseline":0.5,"cookingBaseline":0,"reason":"Invalid reduction."}',lgu,'lower allowance');
  perform pg_temp.agos_reject('Rounded stored allowance is checked before reservation validation','settings.update','{"drinkingBaseline":4.3349,"cookingBaseline":0,"reason":"Precision edge verification."}',lgu,'lower allowance');
  perform pg_temp.agos_reject('Duplicate approval cannot exceed remaining need','allocation.approve',
    jsonb_build_object('items',jsonb_build_array(jsonb_build_object('reportId',first_report,'liters',1000)),'budget',1000,'reason','Must not allocate twice.'),lgu,'uncommitted need');
  perform pg_temp.agos_reject('Stale revision refuses a write','resource.create','{"name":"Stale source","liters":1}',lgu,'another tab',0);
  select id into first_trip from public.agos_deliveries where report_id=first_report and status='Pending';
  select id into other_trip from public.agos_deliveries where report_id=second_report;
  perform pg_temp.agos_reject('Vehicle capacity prevents oversized dispatch','delivery.assign',jsonb_build_object('id',first_trip,'teamId',crew,'vehicle','VERIFY-01','scheduled','2099-11-08T08:00'),lgu,'capacity');
  select jsonb_object_agg(resource_id,liters) into before_sources from public.agos_delivery_sources where delivery_id=first_trip;
  perform pg_temp.agos_call('delivery.split',jsonb_build_object('id',first_trip,'liters',400),lgu);
  perform pg_temp.agos_check('Split preserves total and every source reservation',
    agos_private.commitment()=1200 and (select count(*)=3 and sum(liters)=1000 from public.agos_deliveries where report_id=first_report)
    and before_sources=(select jsonb_object_agg(resource_id,liters) from(select ds.resource_id,sum(ds.liters) as liters from public.agos_delivery_sources ds join public.agos_deliveries d on d.id=ds.delivery_id where d.report_id=first_report group by ds.resource_id) grouped));
  perform pg_temp.agos_call('delivery.assign',jsonb_build_object('id',first_trip,'teamId',crew,'vehicle','VERIFY-01','scheduled','2099-11-08T08:00'),lgu);
  perform pg_temp.agos_reject('Assigned team cannot be deactivated','team.update',jsonb_build_object('id',crew,'active',false),lgu,'Finish or reassign');
  perform pg_temp.agos_reject('Assigned team capacity cannot be reduced below its trip','team.update',jsonb_build_object('id',crew,'capacity',399),lgu,'Finish or reassign');
  perform pg_temp.agos_reject('Wrong declared team cannot start trip','delivery.start',jsonb_build_object('id',first_trip),'{"role":"Delivery Personnel","teamId":"00000000-0000-0000-0000-000000000099"}','assigned');
  perform pg_temp.agos_call('delivery.start',jsonb_build_object('id',first_trip),dp);
  perform pg_temp.agos_reject('In-transit trip cannot be cancelled','delivery.cancel',jsonb_build_object('id',first_trip,'reason','Invalid cancellation.'),lgu,'Only pending');
  perform pg_temp.agos_reject('Completed requires full assigned volume','delivery.confirm',jsonb_build_object('id',first_trip,'actual',399,'status','Completed'),dp,'outcome');
  perform pg_temp.agos_reject('Partial requires explanatory notes','delivery.confirm',jsonb_build_object('id',first_trip,'actual',250,'status','Partially Delivered'),dp,'Explain');
  perform pg_temp.agos_call('delivery.confirm',jsonb_build_object('id',first_trip,'actual',250,'status','Partially Delivered','notes','Verification road-access constraint.'),dp);
  perform pg_temp.agos_check('Partial consumes actual only and releases unused 150 L',
    (select sum(liters)=1250 from public.agos_resources) and agos_private.commitment()=800 and agos_private.available_stock()=450);
  perform pg_temp.agos_reject('Duplicate final confirmation cannot consume stock twice','delivery.confirm',jsonb_build_object('id',first_trip,'actual',250,'status','Partially Delivered','notes','Again.'),dp,'in-transit');
  perform pg_temp.agos_reject('Other barangay cannot acknowledge receipt','delivery.receipt',jsonb_build_object('id',first_trip,'liters',250),balite,'receiving barangay');
  perform pg_temp.agos_reject('Receipt difference requires a note','delivery.receipt',jsonb_build_object('id',first_trip,'liters',300),br,'difference');
  perform pg_temp.agos_call('delivery.receipt',jsonb_build_object('id',first_trip,'liters',300,'notes','Received quantity differs; coordinator follow-up required.'),br);
  perform pg_temp.agos_check('Receipt discrepancy is recorded without rewriting stock or team actual',
    (select receipt_liters=300 and actual=250 from public.agos_deliveries where id=first_trip)
    and (select sum(liters)=1250 from public.agos_resources));
  perform pg_temp.agos_reject('Duplicate receipt is refused','delivery.receipt',jsonb_build_object('id',first_trip,'liters',250),br,'already recorded');
  select id into second_trip from public.agos_deliveries where report_id=first_report and status='Pending' and liters=400;
  select id into third_trip from public.agos_deliveries where report_id=first_report and status='Pending' and liters=200;
  perform pg_temp.agos_call('delivery.cancel',jsonb_build_object('id',second_trip,'reason','Verification cancellation.'),lgu);
  perform pg_temp.agos_check('Cancellation releases stock without consuming it',agos_private.available_stock()=850 and (select sum(liters)=1250 from public.agos_resources));
  perform pg_temp.agos_call('delivery.assign',jsonb_build_object('id',third_trip,'teamId',crew,'vehicle','VERIFY-01','scheduled','2099-11-08T09:00'),lgu);
  perform pg_temp.agos_call('delivery.start',jsonb_build_object('id',third_trip),dp);
  perform pg_temp.agos_call('delivery.confirm',jsonb_build_object('id',third_trip,'actual',200,'status','Completed','notes','Verified full handover.'),dp);
  perform pg_temp.agos_check('Full completion consumes assigned volume once',(select sum(liters)=1050 from public.agos_resources) and agos_private.commitment()=200);
  perform pg_temp.agos_call('delivery.assign',jsonb_build_object('id',other_trip,'teamId',crew,'vehicle','VERIFY-01','scheduled','2099-11-08T10:00'),lgu);
  perform pg_temp.agos_call('delivery.start',jsonb_build_object('id',other_trip),dp);
  perform pg_temp.agos_reject('Failed delivery requires zero actual','delivery.confirm',jsonb_build_object('id',other_trip,'actual',1,'status','Failed','notes','Invalid outcome.'),dp,'outcome');
  perform pg_temp.agos_call('delivery.confirm',jsonb_build_object('id',other_trip,'actual',0,'status','Failed','notes','Verification vehicle fault.'),dp);
  perform pg_temp.agos_check('Failed delivery releases all remaining reservations without consuming stock',
    agos_private.commitment()=0 and agos_private.available_stock()=1050 and (select sum(liters)=1050 from public.agos_resources));
  perform pg_temp.agos_call('delivery.receipt',jsonb_build_object('id',third_trip,'liters',200),br);
  perform pg_temp.agos_call('report.resolve',jsonb_build_object('id',first_report,'reason','Normal community supply restored; remaining request closed.'),lgu);
  perform pg_temp.agos_check('Resolved request preserves all history',(select status='Resolved' from public.agos_reports where id=first_report) and (select count(*)=3 from public.agos_deliveries where report_id=first_report));
  perform pg_temp.agos_call('settings.update','{"drinkingBaseline":3.254,"cookingBaseline":3.254,"reason":"Verification revised planning assumption."}',lgu);
  perform pg_temp.agos_check('Components round consistently to two decimals and sum correctly',(select drinking_baseline=3.25 and cooking_baseline=3.25 and baseline=6.5 from public.agos_settings));
  select id into supply from public.agos_resources order by id limit 1;
  perform pg_temp.agos_reject('Cannot archive physical water stock','resource.archive',jsonb_build_object('id',supply),lgu,'empty supply');
  perform pg_temp.agos_call('resource.update',jsonb_build_object('id',supply,'liters',0,'notes','Verification stock transfer out.'),lgu);
  perform pg_temp.agos_call('resource.archive',jsonb_build_object('id',supply),lgu);
  perform pg_temp.agos_check('Empty unreserved source can be archived',(select not active from public.agos_resources where id=supply));
  perform pg_temp.agos_call('team.update',jsonb_build_object('id',crew,'active',false),lgu);
  perform pg_temp.agos_check('Inactive crew preserves trip history',(select not active from public.agos_teams where id=crew) and (select count(*)=3 from public.agos_deliveries where team_id=crew));
  perform pg_temp.agos_check('Final stock is never below active source reservations',
    not exists(select 1 from public.agos_resources r where r.liters<agos_private.commitment(r.id)));
end $$;

-- Exercise the actual PostgREST execution role's read grant.
set local role anon;
select jsonb_array_length(public.agos_snapshot()->'barangays')=62 as anonymous_snapshot_reads_reference;
reset role;
select count(*) as passed_checks, array_agg(label order by label) as checks from agos_test_results;
rollback;

