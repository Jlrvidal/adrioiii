-- Dedicated Adrio III Supabase project. Run preflight.sql and take a backup first.
begin;
set local lock_timeout='5s';
-- Verify the existing singleton and the legacy history shape before changing ACLs.
do $$
begin
  if (select count(*) from public.schedule) <> 1 or not exists
    (select from public.schedule where id=1 and revision>=0 and state is not null and updated_at is not null)
  then raise exception 'Expected one existing schedule with id 1'; end if;
  if to_regclass('public.schedule_history') is null or
     (select count(*) from information_schema.columns where table_schema='public' and table_name='schedule_history' and column_name in ('revision','state'))<>2 or
     not exists(select from information_schema.columns where table_schema='public' and table_name='schedule_history' and column_name in ('updated_at','created_at','saved_at','changed_at'))
  then raise exception 'Inspect legacy history layout and adapt history projection before migration'; end if;
end $$;

create schema adrio_private;
revoke all on schema adrio_private from public,anon,authenticated;
create table adrio_private.history (
 revision bigint primary key, state jsonb not null, updated_at timestamptz not null
);
alter table adrio_private.history enable row level security;
revoke all on adrio_private.history from public, anon, authenticated;
alter table public.schedule enable row level security;
alter table public.schedule_history enable row level security;
-- Existing policies combine with OR. Replace policies only on these two tables.
do $$
declare r record;
begin
 for r in select * from pg_policies where schemaname='public' and tablename in ('schedule','schedule_history')
 loop execute format('drop policy %I on public.%I',r.policyname,r.tablename); end loop;
 for r in select oid::regprocedure as fn from pg_proc where pronamespace='public'::regnamespace and proname='save_schedule'
 loop execute format('revoke all on function %s from public,anon,authenticated',r.fn); end loop;
 -- Table revocation alone does not clear explicit column grants.
 for r in select table_name,column_name from information_schema.columns where table_schema='public' and table_name in ('schedule','schedule_history')
 loop execute format('revoke all (%I) on public.%I from public,anon,authenticated',r.column_name,r.table_name); end loop;
end $$;
revoke all on public.schedule,public.schedule_history from public,anon,authenticated;
grant select(id,state,revision,updated_at) on public.schedule to anon,authenticated;
create policy read_schedule on public.schedule for select to anon,authenticated using(id=1);
revoke create on schema public from public,anon,authenticated;
-- Default ACLs apply only to the migration role. Global PUBLIC execution must
-- be removed globally for that role; a schema-scoped revoke cannot cancel it.
alter default privileges revoke execute on functions from public,anon,authenticated;
alter default privileges in schema public revoke execute on functions from anon,authenticated;
alter default privileges in schema public revoke all on tables from anon,authenticated;
alter default privileges in schema public revoke all on sequences from anon,authenticated;

create function public.adrio_is_admin() returns boolean language sql stable security invoker
set search_path='' as $$ select coalesce(auth.uid()='c7bad662-fa5d-445d-a219-ed1976c58e84'::uuid,false) $$;
create function adrio_private.valid(v jsonb) returns boolean language plpgsql immutable
set search_path='' as $$
declare m text; i int; p jsonb; other jsonb; s int; d int; ps int; pd int; overlap_months int[];
 ids text[]:=array['foundation','parking','structure','facade','services','finishes','delivery'];
begin
 if v is null or octet_length(v::text)>16384 or jsonb_typeof(v)<>'object'
 or not (v ?& array['version','plans','completed']) or v-array['version','plans','completed']<>'{}'
 or v->'version'<>'2' or jsonb_typeof(v->'plans')<>'object'
 or not ((v->'plans') ?& array['optimista','pesimista']) or (v->'plans')-array['optimista','pesimista']<>'{}'
 or jsonb_typeof(v->'completed')<>'array' or jsonb_array_length(v->'completed')<>7 then return false; end if;
 foreach m in array array['optimista','pesimista'] loop
  overlap_months:=case m when 'optimista' then array[0,1,1,1,3,2,0] else array[0,1,1,1,4,3,0] end;
  if jsonb_typeof(v->'plans'->m)<>'array' or jsonb_array_length(v->'plans'->m)<>7 then return false; end if;
  for i in 0..6 loop
   p:=v->'plans'->m->i;
   if jsonb_typeof(p)<>'object' or not (p ?& array['id','s','d']) or p-array['id','s','d']<>'{}'
    or p->'id'<>to_jsonb(ids[i+1]) or jsonb_typeof(v->'completed'->i)<>'boolean'
    or jsonb_typeof(p->'s')<>'number' or jsonb_typeof(p->'d')<>'number'
    or (p->>'s') !~ '^-?[0-9]{1,3}$' or (p->>'d') !~ '^[0-9]{1,3}$' then return false; end if;
   s:=(p->>'s')::int; d:=(p->>'d')::int;
   if s < -60 or d not between 1 and 120 or s+d>240 or (i>0 and s<greatest(ps,ps+pd-overlap_months[i+1])) then return false; end if;
   if v->'completed'->i='true' and p<>v->'plans'->'optimista'->i then return false; end if;
   ps:=s;pd:=d;
  end loop;
 end loop;
 return true;
exception when data_exception then return false;
end $$;
create function public.adrio_publish(base_revision bigint,proposed jsonb,restoring boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare old public.schedule%rowtype; i int; locked boolean; prior jsonb; stamp timestamptz;
begin
 if not public.adrio_is_admin() then raise insufficient_privilege; end if;
 if restoring is null or not adrio_private.valid(proposed) then raise exception 'Calendario no válido' using errcode='22023'; end if;
 select * into strict old from public.schedule where id=1 for update;
 if old.revision is distinct from base_revision then raise exception 'Conflicto de versiones' using errcode='40001'; end if;
 if not restoring then
  for i in 0..6 loop
   if old.state::jsonb ? 'version' then
    locked:=(old.state->'completed'->>i)::boolean; prior:=old.state->'plans'->'optimista'->i;
   else prior:=old.state->'data'->i; locked:=(prior->>'done')::boolean; end if;
   if locked and (proposed->'completed'->i<>'true' or proposed->'plans'->'optimista'->i->'s'<>prior->'s' or proposed->'plans'->'optimista'->i->'d'<>prior->'d')
    then raise exception 'Hito completado bloqueado'; end if;
  end loop;
 end if;
 insert into adrio_private.history values(old.revision,old.state,old.updated_at);
 -- Keep older public readers functional after a frontend rollback.
 proposed:=proposed || jsonb_build_object('mode','optimista','data',(
   select jsonb_agg(jsonb_build_object('name',(array['Cimentación','Dos plantas de garaje','Estructura de las viviendas','Fachadas y cerramientos','Instalaciones y tabiquería','Acabados interiores','Trámites y entrega'])[ord::int],
   's',phase->'s','d',phase->'d','done',proposed->'completed'->(ord::int-1)) order by ord)
   from jsonb_array_elements(proposed->'plans'->'optimista') with ordinality as items(phase,ord)));
 update public.schedule set state=proposed,revision=old.revision+1,updated_at=clock_timestamp() where id=1 returning updated_at into stamp;
 return jsonb_build_object('revision',old.revision+1,'updated_at',stamp);
end $$;
create function public.adrio_history() returns table(revision bigint,state jsonb,updated_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.adrio_is_admin() then raise insufficient_privilege; end if;
 return query select distinct on (h.r) h.r,h.v,h.t from (
  select n.revision r,n.state v,n.updated_at t,1 priority from adrio_private.history n
  union all select l.revision::bigint,l.state::jsonb,
   coalesce(to_jsonb(l)->>'updated_at',to_jsonb(l)->>'created_at',to_jsonb(l)->>'saved_at',to_jsonb(l)->>'changed_at')::timestamptz,0 from public.schedule_history l
 ) h order by h.r desc,h.priority desc;
end $$;
revoke all on function adrio_private.valid(jsonb),public.adrio_is_admin(),public.adrio_publish(bigint,jsonb,boolean),public.adrio_history() from public,anon,authenticated;
grant execute on function public.adrio_is_admin(),public.adrio_publish(bigint,jsonb,boolean),public.adrio_history() to authenticated;
notify pgrst,'reload schema';
commit;
