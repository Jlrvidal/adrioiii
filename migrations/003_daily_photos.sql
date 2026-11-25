-- Ejecutar una vez después de 002_resident_portal.sql, en el SQL Editor.
begin;
set local lock_timeout='5s';

-- The index is small and publicly readable. Image bytes are fetched one at a time.
create table adrio_private.daily_photos (
  taken date not null,
  slot smallint not null check (slot between 1 and 3),
  request_id uuid not null unique,
  jpeg bytea check (octet_length(jpeg) between 1 and 163840),
  legacy text,
  primary key(taken,slot),
  check ((jpeg is null) <> (legacy is null))
);
revoke all on adrio_private.daily_photos from public, anon, authenticated;

-- Keep the three first existing published pictures for each day in the album.
-- Older observations, including any additional pictures, stay in the original diary.
with old as (
  select observed, id, photo, row_number() over(partition by observed order by published_at,id) as n
  from public.adrio_diary where photo is not null
)
insert into adrio_private.daily_photos(taken,slot,request_id,legacy)
select observed,n,id,photo from old where n<=3;

-- All future uploads, including the administrator's, use the same three slots.
create policy adrio_legacy_upload_closed on storage.objects as restrictive for insert
to anon,authenticated with check(bucket_id <> 'adrio-diary');
alter table public.adrio_diary drop constraint adrio_diary_photo_check;
alter table public.adrio_diary add constraint adrio_diary_photo_check check (
  photo ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}\.webp$'
  or photo ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}/[1-3]\.jpg$');

create function public.adrio_photo_index() returns table(taken date,slot smallint,legacy text)
language sql stable security definer set search_path='' as $$
  select p.taken,p.slot,p.legacy from adrio_private.daily_photos p
  where p.legacy is null or exists(select 1 from public.adrio_diary d where d.photo=p.legacy)
  order by p.taken desc,p.slot
$$;

create function public.adrio_photo(taken_on date, position_in_day smallint) returns text
language sql stable security definer set search_path='' as $$
  select encode(jpeg,'base64') from adrio_private.daily_photos where taken=taken_on and slot=position_in_day
$$;

-- Accept a bounded, baseline JPEG without metadata. Check segment lengths, dimensions
-- and the scan terminator before the bytes can be stored or served as image/jpeg.
create function adrio_private.valid_photo(b bytea) returns boolean
language plpgsql immutable strict set search_path='' as $$
declare
  i int:=2; n int:=octet_length(b); marker int; size int; w int; h int;
  frame boolean:=false;
begin
  if n not between 32 and 163840 or substring(b from 1 for 2)<>decode('ffd8','hex') then return false; end if;
  while i+4<n loop
    if get_byte(b,i)<>255 then return false; end if;
    marker:=get_byte(b,i+1);
    size:=get_byte(b,i+2)*256+get_byte(b,i+3);
    if size<2 or i+size+2>n then return false; end if;
    if marker=192 then
      if frame or size<11 or get_byte(b,i+4)<>8 then return false; end if;
      h:=get_byte(b,i+5)*256+get_byte(b,i+6);
      w:=get_byte(b,i+7)*256+get_byte(b,i+8);
      if least(w,h)<1 or greatest(w,h)>1440 then return false; end if;
      frame:=true;
    elsif marker=218 then
      return frame and size>=6 and right(encode(substring(b from n-1),'hex'),4)='ffd9'
        and position(decode('ffd9','hex') in substring(b from i+size+3))=n-i-size-3;
    elsif marker not in (196,219,221) then return false;
    end if;
    i:=i+size+2;
  end loop;
  return false;
end $$;

create function public.adrio_add_photo(upload_id uuid, image_base64 text) returns text
language plpgsql security definer set search_path='' as $$
declare
  d date:=(statement_timestamp() at time zone 'Europe/Madrid')::date;
  s smallint; b bytea; prior text;
begin
  if upload_id is null or image_base64 is null or length(image_base64)>218456 then
    raise exception 'Fotografía no válida'; end if;
  perform pg_advisory_xact_lock(314159, d-date '2020-01-01');
  select taken::text||'/'||slot||'.jpg' into prior from adrio_private.daily_photos where request_id=upload_id and jpeg is not null;
  if prior is not null then return prior; end if;
  select min(i) into s from generate_series(1,3) i where not exists(
    select 1 from adrio_private.daily_photos where taken=d and slot=i);
  if s is null then raise exception 'Ya hay tres fotos para este día'; end if;
  b:=decode(image_base64,'base64');
  if not adrio_private.valid_photo(b) then raise exception 'Fotografía no válida'; end if;
  insert into adrio_private.daily_photos(taken,slot,request_id,jpeg) values(d,s,upload_id,b);
  return d::text||'/'||s||'.jpg';
end $$;

create table public.adrio_comments (
 id uuid primary key default gen_random_uuid(),
 posted_on date not null default ((now() at time zone 'Europe/Madrid')::date),
 body text not null check(length(trim(body)) between 1 and 600),
 created_at timestamptz not null default now()
);
alter table public.adrio_comments enable row level security;
revoke all on public.adrio_comments from public,anon,authenticated;
grant select on public.adrio_comments to anon,authenticated;
grant insert(posted_on,body),delete on public.adrio_comments to authenticated;
create policy adrio_comments_read on public.adrio_comments for select to anon,authenticated using(true);
create policy adrio_comments_create on public.adrio_comments for insert to authenticated with check(public.adrio_is_admin());
create policy adrio_comments_delete on public.adrio_comments for delete to authenticated using(public.adrio_is_admin());
insert into public.adrio_comments(posted_on,body)
select (published_at at time zone 'Europe/Madrid')::date, reason from public.adrio_forecasts() where nullif(trim(reason),'') is not null;
revoke all on function public.adrio_photo_index(),public.adrio_photo(date,smallint),public.adrio_add_photo(uuid,text) from public;
grant execute on function public.adrio_photo_index(),public.adrio_photo(date,smallint),public.adrio_add_photo(uuid,text) to anon,authenticated;
notify pgrst,'reload schema';
commit;
