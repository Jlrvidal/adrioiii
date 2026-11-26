-- 005: aviso por correo de fotos pendientes y fotos del administrador con fecha.
-- Ejecutar una sola vez, después de 004.
--
-- Antes de ejecutarla (o después; sin estos secretos no se envía ningún correo),
-- guarda en Supabase Vault, desde el SQL Editor:
--   select vault.create_secret('re_...', 'adrio_resend_key');   -- clave de Resend, solo envío
--   select vault.create_secret('tu@correo.com', 'adrio_notify_to');
-- Opcional, si verificas un dominio en Resend:
--   select vault.create_secret('Adrio III <avisos@tu-dominio.com>', 'adrio_notify_from');
begin;
set local lock_timeout = '5s';

-- pg_net envía peticiones HTTP desde la base de datos al confirmar la transacción.
do $$
begin
  if not exists (select 1 from pg_namespace where nspname = 'net') then
    create extension pg_net;
  end if;
end $$;

-- Las peticiones pendientes de pg_net guardan sus cabeceras (incluida la clave
-- de Resend). Ningún rol de la web debe poder leerlas.
do $$
begin
  revoke all on all tables in schema net from anon, authenticated;
exception when others then
  raise notice 'No se pudieron revisar los permisos de net: %', sqlerrm;
end $$;

-- Foto del administrador en cualquier día entre 2020 y hoy (hora de Madrid).
create function public.adrio_add_photo_on(upload_id uuid, image_base64 text, taken_on date)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  today date := (statement_timestamp() at time zone 'Europe/Madrid')::date;
  free_slot smallint;
  image_bytes bytea;
  prior text;
begin
  if not public.adrio_is_admin() then raise insufficient_privilege; end if;
  if upload_id is null or image_base64 is null or length(image_base64) > 218456 then
    raise exception 'Fotografía no válida';
  end if;
  if taken_on is null or taken_on > today or taken_on < date '2020-01-01' then
    raise exception 'La fecha de la foto debe estar entre el 1 de enero de 2020 y hoy';
  end if;
  -- Mismo orden de bloqueos que adrio_add_photo y adrio_approve_photo.
  perform pg_advisory_xact_lock(314160, 0);
  perform pg_advisory_xact_lock(314159, taken_on - date '2020-01-01');
  select taken::text || '/' || slot || '.jpg' into prior
    from adrio_private.daily_photos where request_id = upload_id and jpeg is not null;
  if prior is not null then return prior; end if;
  free_slot := adrio_private.free_photo_slot(taken_on);
  if free_slot is null then raise exception 'Ya hay tres fotos para este día'; end if;
  image_bytes := decode(image_base64, 'base64');
  if not adrio_private.valid_photo(image_bytes) then
    raise exception 'Fotografía no válida';
  end if;
  insert into adrio_private.daily_photos(taken, slot, request_id, jpeg)
    values (taken_on, free_slot, upload_id, image_bytes);
  return taken_on::text || '/' || free_slot || '.jpg';
end $$;
revoke all on function public.adrio_add_photo_on(uuid, text, date) from public, anon, authenticated;
grant execute on function public.adrio_add_photo_on(uuid, text, date) to authenticated;

-- Correo al administrador cuando un visitante deja una foto en la cola.
-- La cola admite como máximo 3 fotos, así que nunca llegan más de 3 avisos
-- seguidos sin que el administrador haya revisado alguna.
create function adrio_private.notify_pending_photo() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  site constant text := 'https://jlrvidal.github.io/adrioiii/';
  api_key text;
  recipient text;
  sender text;
  link text;
  waiting int;
  sent_at text;
begin
  select decrypted_secret into api_key from vault.decrypted_secrets where name = 'adrio_resend_key';
  select decrypted_secret into recipient from vault.decrypted_secrets where name = 'adrio_notify_to';
  select decrypted_secret into sender from vault.decrypted_secrets where name = 'adrio_notify_from';
  if api_key is null or recipient is null then return new; end if;
  link := site || '?revisar=' || new.id;
  select count(*) into waiting from adrio_private.photo_queue;
  sent_at := to_char(new.created_at at time zone 'Europe/Madrid', 'DD/MM/YYYY "a las" HH24:MI');
  perform net.http_post(
    url := 'https://api.resend.com/emails',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || api_key,
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'from', coalesce(sender, 'Adrio III <onboarding@resend.dev>'),
      'to', jsonb_build_array(recipient),
      'subject', 'Foto pendiente de revisión en Adrio III',
      'text',
        'Un visitante ha enviado una foto para el álbum de Adrio III el ' || sent_at || '.' || chr(10) ||
        'Fotos esperando revisión: ' || waiting || '.' || chr(10) || chr(10) ||
        'Revisarla: ' || link || chr(10) || chr(10) ||
        'La foto va adjunta. No se publica hasta que la apruebes.',
      'html',
        '<p>Un visitante ha enviado una foto para el álbum de <strong>Adrio III</strong> el ' ||
        sent_at || '.</p><p>Fotos esperando revisión: ' || waiting || '.</p>' ||
        '<p><a href="' || link || '" style="display:inline-block;padding:10px 18px;' ||
        'background:#1d5c48;color:#ffffff;border-radius:6px;text-decoration:none">' ||
        'Revisar foto</a></p><p style="color:#5b6660;font-size:13px">La foto va adjunta. ' ||
        'No se publica hasta que la apruebes.</p>',
      'attachments', jsonb_build_array(jsonb_build_object(
        'filename', 'foto-pendiente.jpg',
        'content', replace(encode(new.jpeg, 'base64'), chr(10), '')
      ))
    ),
    timeout_milliseconds := 10000
  );
  return new;
exception when others then
  -- Un fallo del aviso nunca debe impedir que la foto entre en la cola.
  raise warning 'Aviso de foto pendiente no enviado: %', sqlerrm;
  return new;
end $$;
revoke all on function adrio_private.notify_pending_photo() from public, anon, authenticated;

create trigger adrio_notify_pending_photo
  after insert on adrio_private.photo_queue
  for each row execute function adrio_private.notify_pending_photo();

notify pgrst, 'reload schema';
commit;
