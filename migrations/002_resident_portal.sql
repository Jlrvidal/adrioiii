-- Apply once after 001. Preserves the schedule, auth and existing history.
begin;
set local lock_timeout='5s';
create table public.adrio_diary (
 id uuid primary key default gen_random_uuid(),
 observed date not null check(observed >= date '2020-01-01'),
 phase text not null check(phase in ('foundation','parking','structure','facade','services','finishes','delivery')),
 observation text not null default '' check(observation in ('','pending','active','late')),
 title text not null check(length(trim(title)) between 1 and 100),
 body text not null check(length(trim(body)) between 1 and 1500),
 caption text not null default '' check(length(caption)<=180),
 photo text unique check(photo ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}\.webp$'),
 published_at timestamptz not null default now(),
 version integer not null default 1
);
create function adrio_private.diary_revision() returns trigger language plpgsql set search_path='' as $$
begin
 if new.observed>(now() at time zone 'Europe/Madrid')::date then raise exception 'Fecha de observación futura'; end if;
 if tg_op='UPDATE' then new.version:=old.version+1; new.published_at:=old.published_at; end if;
 return new;
end $$;
create trigger diary_revision before insert or update on public.adrio_diary for each row execute function adrio_private.diary_revision();
alter table public.adrio_diary enable row level security;
revoke all on public.adrio_diary from public,anon,authenticated;
grant select on public.adrio_diary to anon,authenticated;
grant insert(id,observed,phase,observation,title,body,caption,photo),update(observed,phase,observation,title,body,caption,photo),delete on public.adrio_diary to authenticated;
create policy diary_publication on public.adrio_diary for select to anon,authenticated using(true);
create policy diary_editor on public.adrio_diary for all to authenticated using(public.adrio_is_admin()) with check(public.adrio_is_admin());
create index diary_recent on public.adrio_diary(observed desc,published_at desc);
-- Private objects are readable only after a diary publication references them.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('adrio-diary','adrio-diary',false,307200,array['image/webp']);
create policy adrio_diary_photo_read on storage.objects for select to anon,authenticated using(
 bucket_id='adrio-diary' and exists(select from public.adrio_diary d where d.photo=name));
create policy adrio_diary_photo_admin_read on storage.objects for select to authenticated using(bucket_id='adrio-diary' and public.adrio_is_admin());
create policy adrio_diary_photo_create on storage.objects for insert to authenticated with check(
 bucket_id='adrio-diary' and public.adrio_is_admin() and name ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}\.webp$');
create policy adrio_diary_photo_remove on storage.objects for delete to authenticated using(
 bucket_id='adrio-diary' and public.adrio_is_admin() and not exists(select from public.adrio_diary d where d.photo=name));
-- Restrictive policies keep unrelated, broader permissive policies from opening this bucket.
create policy adrio_photo_anon_visibility on storage.objects as restrictive for select to anon using(
 bucket_id<>'adrio-diary' or exists(select from public.adrio_diary d where d.photo=name));
create policy adrio_photo_user_visibility on storage.objects as restrictive for select to authenticated using(
 bucket_id<>'adrio-diary' or public.adrio_is_admin() or exists(select from public.adrio_diary d where d.photo=name));
create policy adrio_photo_anon_insert on storage.objects as restrictive for insert to anon with check(bucket_id<>'adrio-diary');
create policy adrio_photo_user_insert on storage.objects as restrictive for insert to authenticated with check(
 bucket_id<>'adrio-diary' or (public.adrio_is_admin() and name ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}\.webp$'));
create policy adrio_photo_no_overwrite on storage.objects as restrictive for update to anon,authenticated using(bucket_id<>'adrio-diary') with check(bucket_id<>'adrio-diary');
create policy adrio_photo_anon_delete on storage.objects as restrictive for delete to anon using(bucket_id<>'adrio-diary');
create policy adrio_photo_user_delete on storage.objects as restrictive for delete to authenticated using(
 bucket_id<>'adrio-diary' or (public.adrio_is_admin() and not exists(select from public.adrio_diary d where d.photo=name)));
-- Existing images are immutable. Replace an image by uploading a new object.
create table public.adrio_forecast_notes(revision bigint primary key, reason text not null check(length(trim(reason)) between 1 and 240));
alter table public.adrio_forecast_notes enable row level security;
revoke all on public.adrio_forecast_notes from public,anon,authenticated;
grant select on public.adrio_forecast_notes to anon,authenticated;
grant insert,update on public.adrio_forecast_notes to authenticated;
create policy forecast_notes_read on public.adrio_forecast_notes for select to anon,authenticated using(true);
create policy forecast_notes_write on public.adrio_forecast_notes for all to authenticated using(public.adrio_is_admin()) with check(public.adrio_is_admin() and revision=(select s.revision from public.schedule s where id=1));
-- Extract delivery offsets only. Legacy rows use the same overlap and slack
-- conversion as src/schedule.js. No raw schedule or account fields are exposed.
create function adrio_private.forecast_end(v jsonb,m text) returns int language plpgsql immutable set search_path='' as $$
declare i int; src text:=v->>'mode'; p jsonb; s int; d int; ps int; pd int; alt_s int; alt_d int;
 delay int; result int; durations int[][]:=array[[3,4,4,4,6,5,3],[4,5,5,5,8,7,4]];
 overlap_m int[][]:=array[[0,1,1,1,3,2,0],[0,1,1,1,4,3,0]]; a int; b int;
begin
 if v->>'version'='2' then
  select max((x->>'s')::int+(x->>'d')::int) into result from jsonb_array_elements(v->'plans'->m) x;
  return result;
 end if;
 if src not in ('optimista','pesimista') or jsonb_array_length(v->'data')<>7 then return null; end if;
 a:=case src when 'optimista' then 1 else 2 end;b:=case m when 'optimista' then 1 else 2 end;
 for i in 1..7 loop
  p:=v->'data'->(i-1);s:=(p->>'s')::int;d:=(p->>'d')::int;
  delay:=case when i=1 then s else s-greatest(ps,ps+pd-overlap_m[a][i]) end;
  alt_s:=case when src=m or (p->>'done')::boolean then s when i=1 then delay else delay+greatest(alt_s,alt_s+alt_d-overlap_m[b][i]) end;
  alt_d:=case when src=m or (p->>'done')::boolean then d else greatest(1,durations[b][i]+d-durations[a][i]) end;
  result:=greatest(result,alt_s+alt_d);ps:=s;pd:=d;
 end loop;
 return result;
exception when data_exception then return null;
end $$;
create function public.adrio_forecasts() returns table(revision bigint,published_at timestamptz,optimista int,pesimista int,reason text)
language sql stable security definer set search_path='' as $$
 select h.revision,h.updated_at,adrio_private.forecast_end(h.state,'optimista'),adrio_private.forecast_end(h.state,'pesimista'),n.reason
 from (select revision,updated_at,state from public.schedule_history union all select revision,updated_at,state from public.schedule where id=1) h
 left join public.adrio_forecast_notes n on n.revision=h.revision order by h.revision
$$;
revoke all on function public.adrio_forecasts() from public;
grant execute on function public.adrio_forecasts() to anon,authenticated;
notify pgrst,'reload schema';
commit;
