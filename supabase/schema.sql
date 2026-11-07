-- AGOS Philippines: potable water for drinking and food preparation; bathing is excluded.
-- Deliberately open shared workspace: selected roles are declared workflow context, NOT identity.
-- Only the validated mutation RPC may change operational records. Never store household/person identities.
create schema if not exists agos_private;
revoke all on schema agos_private from public, anon, authenticated;

create table if not exists public.agos_settings (
  singleton boolean primary key default true check (singleton),
  drinking_baseline numeric(6,2) not null default 3 check (drinking_baseline between 0.5 and 30),
  cooking_baseline numeric(6,2) not null default 3 check (cooking_baseline between 0 and 30),
  baseline numeric(6,2) generated always as (drinking_baseline + cooking_baseline) stored,
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now()
);
insert into public.agos_settings(singleton) values(true) on conflict do nothing;

create table if not exists public.agos_barangays (
  psgc text primary key check (psgc ~ '^[0-9]{10}$'),
  name text not null unique check (length(name) between 1 and 120),
  population integer not null check (population >= 0),
  households integer not null check (households >= 0),
  household_population integer not null check (household_population >= 0),
  reference_date date not null,
  source_url text not null,
  lat double precision check (lat between -90 and 90),
  lng double precision check (lng between -180 and 180),
  coordinate_source text not null default '',
  coordinate_accuracy text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  check ((lat is null) = (lng is null))
);
create table if not exists public.agos_reports (
  id uuid primary key default gen_random_uuid(),
  barangay text not null references public.agos_barangays(name),
  households integer not null check (households between 1 and 10000000),
  population integer not null check (population between 1 and 10000000 and population >= households),
  local bigint not null check (local between 0 and 1000000000),
  days integer not null check (days between 1 and 365),
  planning_days integer not null default 1 check (planning_days between 1 and 14),
  planning_date date not null default ((now() at time zone 'Asia/Manila')::date),
  urgency boolean not null default false,
  description text not null check (length(description) between 10 and 2000),
  status text not null default 'Pending' check (status in ('Pending','Verified','Rejected','Correction requested','Resolved','Withdrawn')),
  reason text not null default '' check(length(reason) <= 2000),
  lat double precision check(lat between -90 and 90),
  lng double precision check(lng between -180 and 180),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((lat is null) = (lng is null))
);
create index if not exists agos_reports_barangay_idx on public.agos_reports(barangay);
create index if not exists agos_reports_status_idx on public.agos_reports(status, planning_date);
create table if not exists public.agos_resources (
  id uuid primary key default gen_random_uuid(),
  name text not null check(length(name) between 2 and 120),
  liters bigint not null check(liters between 0 and 1000000000),
  active boolean not null default true,
  notes text not null default '' check(length(notes)<=2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists agos_resources_active_name_idx on public.agos_resources(lower(name)) where active;
create table if not exists public.agos_teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check(length(name) between 2 and 120),
  vehicle text not null default '' check(length(vehicle)<=80),
  capacity bigint not null check(capacity between 1 and 1000000),
  active boolean not null default true
);
create unique index if not exists agos_teams_name_idx on public.agos_teams(lower(name));
create table if not exists public.agos_deliveries (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.agos_reports(id),
  liters bigint not null check(liters between 1 and 1000000000),
  actual bigint not null default 0 check(actual >= 0 and actual <= liters),
  status text not null default 'Pending' check(status in ('Pending','Assigned','In Transit','Completed','Failed','Partially Delivered','Cancelled')),
  team_id uuid references public.agos_teams(id),
  vehicle text not null default '' check(length(vehicle)<=80),
  scheduled text not null default '' check(length(scheduled)<=40),
  notes text not null default '' check(length(notes)<=2000),
  completed_at timestamptz,
  receipt_liters bigint check(receipt_liters >= 0 and receipt_liters <= liters),
  receipt_notes text not null default '' check(length(receipt_notes)<=2000),
  receipt_at timestamptz,
  created_at timestamptz not null default now(),
  check(status <> 'Completed' or actual = liters),
  check(status <> 'Partially Delivered' or (actual > 0 and actual < liters)),
  check(status not in ('Pending','Assigned','In Transit','Failed','Cancelled') or actual = 0),
  check(status not in ('Assigned','In Transit') or team_id is not null),
  check((receipt_liters is null) = (receipt_at is null)),
  check(receipt_at is null or status in ('Completed','Partially Delivered'))
);
create index if not exists agos_deliveries_report_idx on public.agos_deliveries(report_id);
create index if not exists agos_deliveries_team_idx on public.agos_deliveries(team_id);
create index if not exists agos_deliveries_status_idx on public.agos_deliveries(status);
create table if not exists public.agos_delivery_sources (
  delivery_id uuid not null references public.agos_deliveries(id),
  resource_id uuid not null references public.agos_resources(id),
  liters bigint not null check(liters > 0),
  primary key(delivery_id, resource_id)
);
create index if not exists agos_delivery_sources_resource_idx on public.agos_delivery_sources(resource_id);
create table if not exists public.agos_audit (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  actor_role text not null,
  community text not null default '',
  team_id text not null default '',
  command text not null,
  action text not null,
  details jsonb not null default '{}'::jsonb
);
create index if not exists agos_audit_time_idx on public.agos_audit(occurred_at desc);

-- Aggregated operational/reference rows are intentionally readable in this no-sign-in workspace.
-- No citizen identity, password, secret key, or private personnel data belongs in these tables.
do $$
declare tbl text;
begin
  foreach tbl in array array['agos_settings','agos_barangays','agos_reports','agos_resources','agos_teams','agos_deliveries','agos_delivery_sources','agos_audit']
  loop
    execute format('alter table public.%I enable row level security',tbl);
    execute format('revoke all on public.%I from anon, authenticated, public',tbl);
    execute format('grant select on public.%I to anon, authenticated',tbl);
    execute format('drop policy if exists agos_public_read on public.%I',tbl);
    execute format('create policy agos_public_read on public.%I for select to anon, authenticated using (true)',tbl);
  end loop;
end $$;

create or replace function agos_private.integer_arg(p jsonb, k text, lo bigint, hi bigint, fallback bigint default null)
returns bigint language plpgsql immutable set search_path='' as $$
declare n numeric;
begin
  if p->>k is null then
    if fallback is null then raise exception '% is required',k; end if;
    return fallback;
  end if;
  begin n := (p->>k)::numeric; exception when others then raise exception '% must be a whole number',k; end;
  if n <> trunc(n) or n < lo or n > hi then raise exception '% must be a whole number between % and %',k,lo,hi; end if;
  return n::bigint;
end $$;
create or replace function agos_private.text_arg(p jsonb,k text,lo integer,hi integer,fallback text default '')
returns text language plpgsql immutable set search_path='' as $$
declare t text := btrim(coalesce(p->>k,fallback));
begin
  if length(t)<lo or length(t)>hi then raise exception '% must contain between % and % characters',k,lo,hi; end if;
  return t;
end $$;
create or replace function agos_private.commitment(p_resource uuid default null)
returns bigint language sql stable set search_path='' as $$
select coalesce(sum(case when p_resource is null then d.liters else ds.liters end),0)::bigint
from public.agos_deliveries d
left join public.agos_delivery_sources ds on ds.delivery_id=d.id and ds.resource_id=p_resource
where d.status in ('Pending','Assigned','In Transit') and (p_resource is null or ds.resource_id is not null);
$$;
create or replace function agos_private.available_stock()
returns bigint language sql stable set search_path='' as $$
select greatest(0,coalesce((select sum(liters) from public.agos_resources where active),0)-agos_private.commitment())::bigint;
$$;
create or replace function agos_private.unmet_need(p_report uuid)
returns bigint language sql stable set search_path='' as $$
select greatest(0,ceil((r.population*s.baseline-r.local)*r.planning_days)-coalesce((select sum(actual) from public.agos_deliveries where report_id=r.id),0))::bigint
from public.agos_reports r cross join public.agos_settings s where r.id=p_report;
$$;
create or replace function agos_private.remaining_need(p_report uuid)
returns bigint language sql stable set search_path='' as $$
select greatest(0,agos_private.unmet_need(p_report)-coalesce((select sum(liters) from public.agos_deliveries where report_id=p_report and status in ('Pending','Assigned','In Transit')),0))::bigint;
$$;

create or replace function public.agos_snapshot()
returns jsonb language sql stable security invoker set search_path='' as $$
select jsonb_build_object(
 'baseline',s.baseline,'drinkingBaseline',s.drinking_baseline,'cookingBaseline',s.cooking_baseline,'revision',s.revision,
 'barangays',coalesce((select jsonb_agg(jsonb_build_object('id',b.psgc,'psgc',b.psgc,'name',b.name,'population',b.population,'households',b.households,'householdPopulation',b.household_population,'referenceDate',b.reference_date,'sourceUrl',b.source_url,'lat',b.lat,'lng',b.lng,'coordinateSource',b.coordinate_source,'coordinateAccuracy',b.coordinate_accuracy,'sourceUrls',coalesce(b.metadata->'sourceUrls','[]'::jsonb),'metadata',b.metadata) order by b.name) from public.agos_barangays b),'[]'::jsonb),
 'reports',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'province','Oriental Mindoro','municipality','Calapan City','barangay',r.barangay,'households',r.households,'population',r.population,'local',r.local,'days',r.days,'planningDays',r.planning_days,'planningDate',r.planning_date,'urgency',r.urgency,'description',r.description,'date',(r.created_at at time zone 'Asia/Manila')::date,'status',r.status,'reason',r.reason,'lat',r.lat,'lng',r.lng,'createdAt',r.created_at,'updatedAt',r.updated_at) order by r.created_at desc,r.id) from public.agos_reports r),'[]'::jsonb),
 'resources',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'liters',r.liters,'active',r.active,'notes',r.notes,'updated',r.updated_at) order by r.created_at,r.id) from public.agos_resources r),'[]'::jsonb),
 'teams',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'vehicle',t.vehicle,'capacity',t.capacity,'active',t.active) order by t.name) from public.agos_teams t),'[]'::jsonb),
 'deliveries',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'reportId',d.report_id,'liters',d.liters,'actual',d.actual,'status',d.status,'teamId',coalesce(d.team_id::text,''),'person',coalesce(t.name,''),'vehicle',d.vehicle,'scheduled',d.scheduled,'completed',coalesce(d.completed_at::text,''),'notes',d.notes,'sources',coalesce((select jsonb_agg(jsonb_build_object('resourceId',ds.resource_id,'liters',ds.liters) order by ds.resource_id) from public.agos_delivery_sources ds where ds.delivery_id=d.id),'[]'::jsonb),'receipt',case when d.receipt_at is null then null else jsonb_build_object('liters',d.receipt_liters,'notes',d.receipt_notes,'confirmedAt',d.receipt_at) end) order by d.created_at desc,d.id) from public.agos_deliveries d left join public.agos_teams t on t.id=d.team_id),'[]'::jsonb),
 'audit',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'date',a.occurred_at,'actor',a.actor_role,'community',a.community,'teamId',a.team_id,'command',a.command,'action',a.action) order by a.occurred_at desc,a.id) from (select * from public.agos_audit order by occurred_at desc,id limit 500) a),'[]'::jsonb)
) from public.agos_settings s where s.singleton;
$$;

create or replace function public.agos_mutate(p_command text,p_payload jsonb,p_context jsonb,p_expected_revision bigint default null)
returns jsonb language plpgsql security definer set search_path='' set statement_timeout='10s' as $$
declare
  settings public.agos_settings%rowtype;
  report public.agos_reports%rowtype;
  delivery public.agos_deliveries%rowtype;
  resource public.agos_resources%rowtype;
  team public.agos_teams%rowtype;
  barangay public.agos_barangays%rowtype;
  actor text := p_context->>'role';
  community text := coalesce(p_context->>'community','');
  team_context text := coalesce(p_context->>'teamId','');
  item jsonb;
  source record;
  eligible record;
  source_pool jsonb;
  source_index integer;
  target uuid;
  trip uuid;
  qty bigint;
  actual_qty bigint;
  total bigint := 0;
  remaining bigint;
  take_qty bigint;
  chunk bigint;
  chunks integer;
  budget bigint;
  cap bigint;
  total_need bigint;
  expected jsonb;
  submitted jsonb := '{}'::jsonb;
  expected_id text;
  nm text;
  note text;
  review_status text;
  action_text text;
  affected bigint;
  households_qty bigint;
  local_qty bigint;
  observed_days bigint;
  planning_days_qty bigint;
  planning_day date;
  latitude double precision;
  longitude double precision;
  new_drinking numeric;
  new_cooking numeric;
  is_active boolean;
  audit_community text := '';
  audit_team text := '';
begin
  if jsonb_typeof(p_payload) is distinct from 'object' or jsonb_typeof(p_context) is distinct from 'object' then raise exception 'Invalid operation payload'; end if;
  if octet_length(p_payload::text)>32768 or octet_length(p_context::text)>1000 then raise exception 'Operation payload is too large'; end if;
  if actor is null or actor not in ('LGU Coordinator','Barangay Representative','Delivery Personnel') then raise exception 'Choose a workspace role'; end if;
  if p_command is null or p_command not in ('report.create','report.update','report.withdraw','report.review','report.resolve','resource.create','resource.update','resource.archive','settings.update','allocation.approve','delivery.assign','delivery.start','delivery.confirm','delivery.cancel','delivery.receipt','delivery.split','team.create','team.update') then raise exception 'Unsupported workspace operation'; end if;
  if p_command in ('report.create','report.update','report.withdraw','delivery.receipt') and actor<>'Barangay Representative' then raise exception 'Choose the Barangay Representative workspace for this operation'; end if;
  if p_command in ('report.review','report.resolve','resource.create','resource.update','resource.archive','settings.update','allocation.approve','delivery.assign','delivery.cancel','delivery.split','team.create','team.update') and actor<>'LGU Coordinator' then raise exception 'Choose the LGU Coordinator workspace for this operation'; end if;
  if p_command in ('delivery.start','delivery.confirm') and actor<>'Delivery Personnel' then raise exception 'Choose the Delivery Personnel workspace for this operation'; end if;

  -- Every mutation takes the same short-lived lock: reservations, stock and revision change atomically.
  select * into settings from public.agos_settings where singleton for update;
  if p_expected_revision is not null and p_expected_revision <> settings.revision then raise exception 'The workspace changed in another tab. Refresh and try again.'; end if;
  if actor='Barangay Representative' then
    select * into barangay from public.agos_barangays where name=community;
    if not found then raise exception 'Choose one of the Calapan barangays in your profile'; end if;
  end if;

  if p_command in ('report.create','report.update') then
    affected := agos_private.integer_arg(p_payload,'population',1,10000000);
    households_qty := agos_private.integer_arg(p_payload,'households',1,10000000);
    if households_qty>affected then raise exception 'Affected households cannot exceed affected people'; end if;
    local_qty := agos_private.integer_arg(p_payload,'local',0,1000000000);
    observed_days := agos_private.integer_arg(p_payload,'days',1,365);
    planning_days_qty := agos_private.integer_arg(p_payload,'planningDays',1,14,1);
    if nullif(p_payload->>'planningDate','') is not null and p_payload->>'planningDate' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Choose a valid planning date (YYYY-MM-DD)'; end if;
    planning_day := coalesce(nullif(p_payload->>'planningDate','')::date,(now() at time zone 'Asia/Manila')::date);
    if not isfinite(planning_day) then raise exception 'Choose a finite planning date'; end if;
    note := agos_private.text_arg(p_payload,'description',10,2000);
    latitude := case when p_payload ? 'lat' then (p_payload->>'lat')::double precision else barangay.lat end;
    longitude := case when p_payload ? 'lng' then (p_payload->>'lng')::double precision else barangay.lng end;
    if (latitude is null) <> (longitude is null) or abs(latitude)>90 or abs(longitude)>180 or latitude::text in ('NaN','Infinity','-Infinity') or longitude::text in ('NaN','Infinity','-Infinity') then raise exception 'Enter valid coordinates or leave both empty'; end if;
    if p_command='report.update' then
      target := (p_payload->>'id')::uuid;
      select * into report from public.agos_reports r where r.id=target and r.barangay=community;
      if not found or report.status not in ('Pending','Correction requested') then raise exception 'Only your pending or correction-requested report can be edited'; end if;
    end if;
    if exists(select 1 from public.agos_reports r where r.barangay=community and r.id<>coalesce(target,'00000000-0000-0000-0000-000000000000'::uuid) and r.status in ('Pending','Verified','Correction requested') and daterange(r.planning_date,r.planning_date+r.planning_days,'[)') && daterange(planning_day,planning_day+planning_days_qty::integer,'[)')) then raise exception 'An active report already covers this barangay and assistance period. Update it or resolve it before submitting an overlapping report.'; end if;
    if p_command='report.create' then
      insert into public.agos_reports(barangay,households,population,local,days,planning_days,planning_date,urgency,description,lat,lng)
      values(community,households_qty,affected,local_qty,observed_days,planning_days_qty,planning_day,coalesce((p_payload->>'urgency')::boolean,false),note,latitude,longitude) returning id into target;
      action_text := 'Potable-water shortage report submitted for '||community;
    else
      update public.agos_reports set households=households_qty,population=affected,local=local_qty,days=observed_days,planning_days=planning_days_qty,planning_date=planning_day,urgency=coalesce((p_payload->>'urgency')::boolean,false),description=note,lat=latitude,lng=longitude,status='Pending',reason='',updated_at=now() where id=target;
      action_text := 'Potable-water report updated and submitted for review: '||community;
    end if;

  elsif p_command in ('report.review','report.withdraw','report.resolve') then
    target := (p_payload->>'id')::uuid;
    select * into report from public.agos_reports where id=target;
    if not found then raise exception 'Report not found'; end if;
    note := agos_private.text_arg(p_payload,'reason',0,2000);
    if p_command='report.review' then
      review_status := p_payload->>'status';
      if review_status is null or review_status not in ('Verified','Rejected','Correction requested') then raise exception 'Choose a review outcome'; end if;
      if report.status not in ('Pending','Correction requested') then raise exception 'This report has already been reviewed'; end if;
      if review_status<>'Verified' and length(note)=0 then raise exception 'A review explanation is required'; end if;
      update public.agos_reports set status=review_status,reason=note,updated_at=now() where id=target;
      action_text := report.barangay||' report '||lower(review_status)||case when note='' then '' else '. Explanation: '||note end;
    elsif p_command='report.withdraw' then
      if report.barangay<>community or report.status not in ('Pending','Correction requested') then raise exception 'Only your pending or correction-requested report can be withdrawn'; end if;
      if note='' then raise exception 'Withdrawal reason required'; end if;
      update public.agos_reports set status='Withdrawn',reason=note,updated_at=now() where id=target;
      action_text := report.barangay||' report withdrawn. Explanation: '||note;
    else
      if report.status<>'Verified' then raise exception 'Only verified reports can be resolved'; end if;
      if exists(select 1 from public.agos_deliveries where report_id=target and status in ('Pending','Assigned','In Transit')) then raise exception 'Finish or cancel outstanding deliveries before resolving this report'; end if;
      if note='' then raise exception 'Resolution explanation required'; end if;
      update public.agos_reports set status='Resolved',reason=note,updated_at=now() where id=target;
      action_text := report.barangay||' report resolved. Explanation: '||note;
    end if;

  elsif p_command in ('resource.create','resource.update','resource.archive') then
    if p_command='resource.create' then
      nm := agos_private.text_arg(p_payload,'name',2,120);
      qty := agos_private.integer_arg(p_payload,'liters',0,1000000000);
      note := agos_private.text_arg(p_payload,'notes',0,2000);
      insert into public.agos_resources(name,liters,notes) values(nm,qty,note) returning id into target;
      action_text := 'Potable-water supply recorded: '||nm||' ('||qty||' L)'||case when note='' then '' else '. Note: '||note end;
    else
      target := (p_payload->>'id')::uuid;
      select * into resource from public.agos_resources where id=target;
      if not found or not resource.active then raise exception 'Active supply location not found'; end if;
      if p_command='resource.archive' then
        if resource.liters<>0 or agos_private.commitment(target)>0 then raise exception 'Only an empty supply location with no reservations can be archived'; end if;
        update public.agos_resources set active=false,updated_at=now() where id=target;
        action_text := 'Supply location archived: '||resource.name;
      else
        qty := agos_private.integer_arg(p_payload,'liters',0,1000000000,resource.liters);
        nm := agos_private.text_arg(p_payload,'name',2,120,resource.name);
        note := agos_private.text_arg(p_payload,'notes',0,2000,resource.notes);
        if qty<agos_private.commitment(target) then raise exception 'Physical stock cannot be lower than reserved stock'; end if;
        if qty<>resource.liters and note='' then raise exception 'Record a stock adjustment or replenishment note'; end if;
        update public.agos_resources set name=nm,liters=qty,notes=note,updated_at=now() where id=target;
        action_text := 'Supply updated: '||nm||' ('||resource.liters||' to '||qty||' L)'||case when note='' then '' else '. Note: '||note end;
      end if;
    end if;

  elsif p_command='settings.update' then
    -- Validate the same rounded precision that will actually be stored before checking reservations.
    new_drinking := round((p_payload->>'drinkingBaseline')::numeric,2);
    new_cooking := round((p_payload->>'cookingBaseline')::numeric,2);
    note := agos_private.text_arg(p_payload,'reason',5,2000);
    if new_drinking is null or new_cooking is null or new_drinking not between 0.5 and 30 or new_cooking not between 0 and 30 or new_drinking::text='NaN' or new_cooking::text='NaN' then raise exception 'Choose valid drinking and food-preparation allowances'; end if;
    if exists(select 1 from public.agos_reports r where r.status='Verified' and greatest(0,ceil((r.population*(new_drinking+new_cooking)-r.local)*r.planning_days)-coalesce((select sum(actual) from public.agos_deliveries where report_id=r.id),0))<coalesce((select sum(liters) from public.agos_deliveries where report_id=r.id and status in ('Pending','Assigned','In Transit')),0)) then raise exception 'This lower allowance conflicts with existing delivery reservations. Finish or cancel them before changing it.'; end if;
    update public.agos_settings set drinking_baseline=new_drinking,cooking_baseline=new_cooking,updated_at=now() where singleton;
    action_text := 'Planning allowance updated: drinking '||new_drinking||' + food preparation '||new_cooking||' L/person/day. '||note;

  elsif p_command in ('team.create','team.update') then
    if p_command='team.update' then
      target := (p_payload->>'id')::uuid;
      select * into team from public.agos_teams where id=target;
      if not found then raise exception 'Delivery team not found'; end if;
    end if;
    nm := agos_private.text_arg(p_payload,'name',2,120,coalesce(team.name,''));
    note := agos_private.text_arg(p_payload,'vehicle',0,80,coalesce(team.vehicle,''));
    qty := agos_private.integer_arg(p_payload,'capacity',1,1000000,team.capacity);
    is_active := coalesce((p_payload->>'active')::boolean,team.active,true);
    if p_command='team.update' then
      if exists(select 1 from public.agos_deliveries where team_id=target and status in ('Assigned','In Transit') and (not is_active or liters>qty)) then raise exception 'Finish or reassign active deliveries before deactivating this team or reducing its capacity'; end if;
      update public.agos_teams set name=nm,vehicle=note,capacity=qty,active=is_active where id=target;
    else
      insert into public.agos_teams(name,vehicle,capacity,active) values(nm,note,qty,is_active) returning id into target;
    end if;
    action_text := 'Delivery team saved: '||nm;

  elsif p_command='allocation.approve' then
    if jsonb_typeof(p_payload->'items') is distinct from 'array' or jsonb_array_length(p_payload->'items') not between 1 and 200 then raise exception 'Choose one or more report allocations'; end if;
    budget := agos_private.integer_arg(p_payload,'budget',0,1000000000,agos_private.available_stock());
    note := agos_private.text_arg(p_payload,'reason',0,2000);
    for item in select value from jsonb_array_elements(p_payload->'items') loop
      target := (item->>'reportId')::uuid;
      qty := agos_private.integer_arg(item,'liters',0,1000000000);
      if submitted ? target::text then raise exception 'Duplicate report in this allocation'; end if;
      submitted := submitted || jsonb_build_object(target::text,qty);
      select * into report from public.agos_reports where id=target;
      if not found or report.status<>'Verified' then raise exception 'Every allocated report must be verified'; end if;
      if qty>agos_private.remaining_need(target) then raise exception 'Allocation exceeds the current uncommitted need for %',report.barangay; end if;
      total := total+qty;
    end loop;
    if total<=0 or total>budget or total>agos_private.available_stock() then raise exception 'Allocation is empty or exceeds the dispatch budget / uncommitted stock'; end if;
    select coalesce(sum(agos_private.remaining_need(id)),0) into total_need from public.agos_reports where status='Verified';
    cap := least(budget,agos_private.available_stock(),total_need);
    with needs as (
      select id,agos_private.remaining_need(id) as need from public.agos_reports where status='Verified'
    ), floors as (
      select id,need,div(cap::numeric*need,nullif(total_need,0))::bigint as liters,
        mod(cap::numeric*need,nullif(total_need,0)) as remainder
      from needs where need>0
    ), ranked as (
      select *,row_number() over(order by remainder desc,id) as rank,sum(liters) over() as floor_total from floors
    ), final as (
      select id,liters+case when rank<=cap-floor_total then 1 else 0 end as liters from ranked
    )
    select coalesce(jsonb_object_agg(id::text,liters) filter(where liters>0),'{}'::jsonb) into expected from final;
    select coalesce(jsonb_object_agg(key,value) filter(where (value::text)::bigint>0),'{}'::jsonb) into submitted from jsonb_each(submitted);
    if submitted<>expected and note='' then raise exception 'Record an explanation for changing the proportional recommendations'; end if;
    for item in select value from jsonb_array_elements(p_payload->'items') loop
      target := (item->>'reportId')::uuid; qty := (item->>'liters')::bigint;
      if qty=0 then continue; end if;
      select * into report from public.agos_reports r where r.id=target;
      insert into public.agos_deliveries(report_id,liters) values(target,qty) returning id into trip;
      remaining := qty;
      for resource in select * from public.agos_resources where active order by created_at,id loop
        take_qty := least(remaining,resource.liters-agos_private.commitment(resource.id));
        if take_qty>0 then
          insert into public.agos_delivery_sources(delivery_id,resource_id,liters) values(trip,resource.id,take_qty);
          remaining := remaining-take_qty;
        end if;
        exit when remaining=0;
      end loop;
      if remaining<>0 then raise exception 'Source reservations could not be completed'; end if;
      insert into public.agos_audit(actor_role,community,team_id,command,action,details)
      values(actor,report.barangay,'',p_command,'Allocation reserved for '||report.barangay||': '||qty||' L'||case when note='' then '' else '. Explanation: '||note end,
        jsonb_build_object('targetId',target,'deliveryId',trip,'declaredContext',true));
    end loop;
    action_text := 'Allocation approved and reserved: '||total||' L'||case when note='' then '' else '. Explanation: '||note end;

  else
    target := (p_payload->>'id')::uuid;
    select * into delivery from public.agos_deliveries where id=target;
    if not found then raise exception 'Delivery not found'; end if;
    select * into report from public.agos_reports where id=delivery.report_id;
    if p_command='delivery.assign' then
      if delivery.status not in ('Pending','Assigned') then raise exception 'Only pending or assigned deliveries can be assigned'; end if;
      select * into team from public.agos_teams where id=(p_payload->>'teamId')::uuid and active;
      if not found then raise exception 'Choose an active delivery team'; end if;
      if delivery.liters>team.capacity then raise exception 'This allocation exceeds the team vehicle capacity. Split it into smaller trips first.'; end if;
      nm := agos_private.text_arg(p_payload,'vehicle',1,80,team.vehicle);
      note := agos_private.text_arg(p_payload,'scheduled',10,40);
      begin
        perform note::timestamp;
      exception when others then raise exception 'Choose a valid delivery date and time'; end;
      update public.agos_deliveries set team_id=team.id,vehicle=nm,scheduled=note,status='Assigned' where id=target;
      action_text := 'Delivery assigned to '||team.name||' for '||report.barangay;
    elsif p_command='delivery.start' then
      if delivery.status<>'Assigned' or delivery.team_id::text is distinct from team_context then raise exception 'Choose the team assigned to this delivery in your profile'; end if;
      update public.agos_deliveries set status='In Transit' where id=target;
      action_text := 'Delivery departed for '||report.barangay;
    elsif p_command='delivery.confirm' then
      if delivery.status<>'In Transit' or delivery.team_id::text is distinct from team_context then raise exception 'Only the selected assigned team can confirm an in-transit delivery'; end if;
      actual_qty := agos_private.integer_arg(p_payload,'actual',0,delivery.liters);
      review_status := p_payload->>'status';
      note := agos_private.text_arg(p_payload,'notes',0,2000);
      if review_status is null or review_status not in ('Completed','Partially Delivered','Failed') then raise exception 'Choose a valid delivery outcome'; end if;
      if (review_status='Completed' and actual_qty<>delivery.liters) or (review_status='Failed' and actual_qty<>0) or (review_status='Partially Delivered' and (actual_qty<=0 or actual_qty>=delivery.liters)) then raise exception 'Actual liters do not match the selected delivery outcome'; end if;
      if review_status<>'Completed' and note='' then raise exception 'Explain the partial or failed delivery'; end if;
      remaining := actual_qty;
      for source in select * from public.agos_delivery_sources where delivery_id=target order by resource_id loop
        take_qty := least(remaining,source.liters);
        if take_qty>0 then
          update public.agos_resources set liters=liters-take_qty,updated_at=now() where id=source.resource_id and liters>=take_qty;
          if not found then raise exception 'Source stock is insufficient'; end if;
          remaining := remaining-take_qty;
        end if;
      end loop;
      if remaining<>0 then raise exception 'Delivery source records are incomplete'; end if;
      update public.agos_deliveries set actual=actual_qty,status=review_status,notes=note,completed_at=now() where id=target;
      action_text := report.barangay||' delivery '||lower(review_status)||': '||actual_qty||' L. Unused reservation released.'||case when note='' then '' else ' Note: '||note end;
    elsif p_command='delivery.cancel' then
      if delivery.status not in ('Pending','Assigned') then raise exception 'Only pending or assigned deliveries can be cancelled'; end if;
      note := agos_private.text_arg(p_payload,'reason',3,2000);
      update public.agos_deliveries set status='Cancelled',notes=note,completed_at=now() where id=target;
      action_text := 'Delivery cancelled for '||report.barangay||'. Reservation released. '||note;
    elsif p_command='delivery.receipt' then
      if report.barangay<>community or delivery.status not in ('Completed','Partially Delivered') then raise exception 'Only the receiving barangay can acknowledge a completed or partial delivery'; end if;
      if delivery.receipt_at is not null then raise exception 'This delivery receipt is already recorded'; end if;
      qty := agos_private.integer_arg(p_payload,'liters',0,delivery.liters);
      note := agos_private.text_arg(p_payload,'notes',0,2000);
      if qty<>delivery.actual and note='' then raise exception 'Explain the difference between received and delivered liters'; end if;
      update public.agos_deliveries set receipt_liters=qty,receipt_notes=note,receipt_at=now() where id=target;
      action_text := community||' acknowledged receipt of '||qty||' L'||case when note='' then '' else '. Note: '||note end;
    elsif p_command='delivery.split' then
      if delivery.status<>'Pending' then raise exception 'Only pending deliveries can be split'; end if;
      chunk := agos_private.integer_arg(p_payload,'liters',1,delivery.liters-1);
      chunks := ceil(delivery.liters::numeric/chunk)::integer;
      if chunks>50 then raise exception 'A split may create no more than 50 trips'; end if;
      select jsonb_agg(jsonb_build_object('resourceId',resource_id,'liters',liters) order by resource_id) into source_pool from public.agos_delivery_sources where delivery_id=target;
      if source_pool is null then raise exception 'Delivery source records are incomplete'; end if;
      delete from public.agos_delivery_sources where delivery_id=target;
      remaining := delivery.liters;
      for n in 1..chunks loop
        qty := least(chunk,remaining);
        if n=1 then
          trip := target;
          update public.agos_deliveries set liters=qty where id=target;
        else
          insert into public.agos_deliveries(report_id,liters) values(delivery.report_id,qty) returning id into trip;
        end if;
        actual_qty := qty;
        for source_index in 0..jsonb_array_length(source_pool)-1 loop
          take_qty := least(actual_qty,(source_pool->source_index->>'liters')::bigint);
          if take_qty>0 then
            insert into public.agos_delivery_sources(delivery_id,resource_id,liters) values(trip,(source_pool->source_index->>'resourceId')::uuid,take_qty);
            source_pool := jsonb_set(source_pool,array[source_index::text,'liters'],to_jsonb((source_pool->source_index->>'liters')::bigint-take_qty));
            actual_qty := actual_qty-take_qty;
          end if;
          exit when actual_qty=0;
        end loop;
        if actual_qty<>0 then raise exception 'Delivery source records are incomplete'; end if;
        remaining := remaining-qty;
      end loop;
      action_text := report.barangay||' allocation split into '||chunks||' trips; total reservation unchanged';
    end if;
  end if;

  -- Audit the actual target scope, not an unrelated profile preference selected earlier.
  if p_command like 'report.%' then
    select r.barangay into audit_community from public.agos_reports r where r.id=target;
  elsif p_command like 'delivery.%' then
    select r.barangay,coalesce(d.team_id::text,'') into audit_community,audit_team
      from public.agos_deliveries d join public.agos_reports r on r.id=d.report_id where d.id=target;
  elsif p_command like 'team.%' then
    audit_team := target::text;
  end if;
  insert into public.agos_audit(actor_role,community,team_id,command,action,details)
    values(actor,coalesce(audit_community,''),coalesce(audit_team,''),p_command,action_text,jsonb_build_object('targetId',target,'declaredContext',true));
  update public.agos_settings set revision=revision+1,updated_at=now() where singleton;
  return jsonb_build_object('state',public.agos_snapshot(),'message',action_text);
exception
  when unique_violation then raise exception 'A record with this name already exists';
end;
$$;

-- Remove PostgreSQL/Supabase default function grants explicitly.
revoke all on all functions in schema agos_private from public,anon,authenticated;
revoke all on function public.agos_snapshot() from public,anon,authenticated;
revoke all on function public.agos_mutate(text,jsonb,jsonb,bigint) from public,anon,authenticated;
grant execute on function public.agos_snapshot() to anon,authenticated;
grant execute on function public.agos_mutate(text,jsonb,jsonb,bigint) to anon,authenticated;
comment on function public.agos_mutate(text,jsonb,jsonb,bigint) is 'Intentional anonymous shared-workspace API. Role/community/team are declared UI context, not authentication. Only bounded validated aggregate-water workflows; no direct anonymous table writes. Workspace row lock + revision prevents races.';
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end $$;
notify pgrst,'reload schema';
