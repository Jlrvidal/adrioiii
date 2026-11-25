begin;
set local lock_timeout='5s';

create table adrio_private.photo_queue (
  id uuid primary key default gen_random_uuid(),
  request_id uuid unique not null,
  submitted_on date not null,
  jpeg bytea not null check (octet_length(jpeg) between 1 and 163840),
  created_at timestamptz not null default now()
);
alter table adrio_private.photo_queue enable row level security;
revoke all on adrio_private.photo_queue from public, anon, authenticated;

-- Invoked only by the photo write RPCs, under the corresponding day lock.
create function adrio_private.free_photo_slot(photo_day date) returns smallint
language sql stable set search_path='' as $$
  select min(i)::smallint from generate_series(1,3) i where not exists (
    select 1 from adrio_private.daily_photos p where p.taken=photo_day and p.slot=i
  )
$$;
revoke all on function adrio_private.free_photo_slot(date) from public, anon, authenticated;

create or replace function public.adrio_add_photo(upload_id uuid, image_base64 text) returns text
language plpgsql security definer set search_path='' as $$
declare
  photo_day date := (statement_timestamp() at time zone 'Europe/Madrid')::date;
  total_queue_limit constant int := 3;
  admin boolean := public.adrio_is_admin();
  free_slot smallint;
  image_bytes bytea;
  prior text;
begin
  if upload_id is null or image_base64 is null or length(image_base64)>218456 then
    raise exception 'Fotografía no válida';
  end if;
  -- Serialize queue changes across dates and keep request IDs consistent
  -- when a pending row moves to the published table.
  perform pg_advisory_xact_lock(314160, 0);
  perform pg_advisory_xact_lock(314159, photo_day-date '2020-01-01');
  select taken::text||'/'||slot||'.jpg' into prior
    from adrio_private.daily_photos where request_id=upload_id and jpeg is not null;
  if prior is not null then return prior; end if;
  if exists(select 1 from adrio_private.photo_queue where request_id=upload_id) then
    return 'pendiente';
  end if;
  free_slot := adrio_private.free_photo_slot(photo_day);
  if free_slot is null then raise exception 'Ya hay tres fotos para este día'; end if;
  image_bytes := decode(image_base64,'base64');
  if not adrio_private.valid_photo(image_bytes) then raise exception 'Fotografía no válida'; end if;
  if admin then
    insert into adrio_private.daily_photos(taken,slot,request_id,jpeg)
      values(photo_day,free_slot,upload_id,image_bytes);
    return photo_day::text||'/'||free_slot||'.jpg';
  end if;
  if (select count(*) from adrio_private.photo_queue)>=total_queue_limit then
    raise exception 'La cola de fotos pendientes está llena';
  end if;
  insert into adrio_private.photo_queue(request_id,submitted_on,jpeg)
    values(upload_id,photo_day,image_bytes);
  return 'pendiente';
end $$;

create function public.adrio_pending_photos()
returns table(id uuid, submitted_on date, created_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
  if not public.adrio_is_admin() then raise insufficient_privilege; end if;
  return query select q.id,q.submitted_on,q.created_at from adrio_private.photo_queue q
    order by q.created_at,q.id;
end $$;

create function public.adrio_pending_photo(id uuid) returns text
language plpgsql stable security definer set search_path='' as $$
begin
  if not public.adrio_is_admin() then raise insufficient_privilege; end if;
  return (select encode(q.jpeg,'base64') from adrio_private.photo_queue q where q.id=$1);
end $$;

create function public.adrio_approve_photo(id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare
  photo adrio_private.photo_queue%rowtype;
  free_slot smallint;
begin
  if not public.adrio_is_admin() then raise insufficient_privilege; end if;
  perform pg_advisory_xact_lock(314160, 0);
  select q.* into photo from adrio_private.photo_queue q where q.id=$1;
  if not found then raise exception 'La foto pendiente ya no existe'; end if;
  perform pg_advisory_xact_lock(314159, photo.submitted_on-date '2020-01-01');
  free_slot := adrio_private.free_photo_slot(photo.submitted_on);
  if free_slot is null then raise exception 'Ya hay tres fotos para este día'; end if;
  insert into adrio_private.daily_photos(taken,slot,request_id,jpeg)
    values(photo.submitted_on,free_slot,photo.request_id,photo.jpeg);
  delete from adrio_private.photo_queue q where q.id=$1;
end $$;

create function public.adrio_reject_photo(id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not public.adrio_is_admin() then raise insufficient_privilege; end if;
  perform pg_advisory_xact_lock(314160, 0);
  delete from adrio_private.photo_queue q where q.id=$1;
  if not found then raise exception 'La foto pendiente ya no existe'; end if;
end $$;

create function public.adrio_remove_photo(taken_on date, position_in_day smallint) returns void
language plpgsql security definer set search_path='' as $$
declare
  legacy_path text;
begin
  if not public.adrio_is_admin() then raise insufficient_privilege; end if;
  perform pg_advisory_xact_lock(314159, taken_on-date '2020-01-01');
  delete from adrio_private.daily_photos p where p.taken=taken_on and p.slot=position_in_day
    returning p.legacy into legacy_path;
  if not found then raise exception 'La foto publicada ya no existe'; end if;
  -- A reused slot must never make an old observation display a different photo.
  if legacy_path is null then
    update public.adrio_diary set photo=null,caption=''
      where photo=taken_on::text||'/'||position_in_day||'.jpg';
  end if;
end $$;

-- Slots can be reused. Give clients an opaque cache key for each published image.
drop function public.adrio_photo_index();
create function public.adrio_photo_index()
returns table(taken date,slot smallint,legacy text,photo_version text)
language sql stable security definer set search_path='' as $$
  select p.taken,p.slot,p.legacy,md5(p.request_id::text)
  from adrio_private.daily_photos p
  where p.legacy is null or exists(select 1 from public.adrio_diary d where d.photo=p.legacy)
  order by p.taken desc,p.slot
$$;
revoke all on function public.adrio_photo_index() from public, anon, authenticated;
grant execute on function public.adrio_photo_index() to anon, authenticated;

revoke all on function public.adrio_add_photo(uuid,text) from public, anon, authenticated;
grant execute on function public.adrio_add_photo(uuid,text) to anon, authenticated;
revoke all on function public.adrio_pending_photos(), public.adrio_pending_photo(uuid),
  public.adrio_approve_photo(uuid), public.adrio_reject_photo(uuid), public.adrio_remove_photo(date,smallint)
  from public, anon, authenticated;
grant execute on function public.adrio_pending_photos(), public.adrio_pending_photo(uuid),
  public.adrio_approve_photo(uuid), public.adrio_reject_photo(uuid), public.adrio_remove_photo(date,smallint)
  to authenticated;
notify pgrst,'reload schema';
commit;
