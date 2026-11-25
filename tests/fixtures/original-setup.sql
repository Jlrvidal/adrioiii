-- Sustituye OWNER_UUID por el UUID del administrador antes de ejecutar.
create table public.schedule(id integer primary key check(id=1), state jsonb not null, revision bigint not null default 0, updated_at timestamptz not null default now());
create table public.schedule_history(revision bigint primary key, state jsonb not null, updated_at timestamptz not null);
alter table public.schedule enable row level security;
alter table public.schedule_history enable row level security;
create policy public_read on public.schedule for select to anon, authenticated using(true);
revoke all on public.schedule, public.schedule_history from anon, authenticated;
grant select on public.schedule to anon, authenticated;
insert into public.schedule(id,state) values(1,$json${"data": [{"name": "Cimentación", "s": 0, "d": 3, "done": false}, {"name": "Dos plantas de garaje", "s": 2, "d": 4, "done": false}, {"name": "Estructura de las viviendas", "s": 5, "d": 4, "done": false}, {"name": "Fachadas y cerramientos", "s": 8, "d": 4, "done": false}, {"name": "Instalaciones y tabiquería", "s": 9, "d": 6, "done": false}, {"name": "Acabados interiores", "s": 13, "d": 5, "done": false}, {"name": "Trámites y entrega", "s": 18, "d": 3, "done": false}], "mode": "optimista"}$json$::jsonb);
create function public.save_schedule(expected bigint,next_state jsonb) returns bigint language plpgsql security definer set search_path='' as $$
declare r public.schedule%rowtype;
begin
 if auth.uid() is distinct from 'OWNER_UUID'::uuid then raise exception 'No autorizado'; end if;
 select * into r from public.schedule where id=1 for update;
 if r.revision is distinct from expected then raise exception 'Conflicto de versiones: exporta tu respaldo y recarga'; end if;
 if jsonb_typeof(next_state->'data') is distinct from 'array' or jsonb_array_length(next_state->'data')<>7 then raise exception 'Estado inválido'; end if;
 insert into public.schedule_history values(r.revision,r.state,r.updated_at);
 update public.schedule set state=next_state,revision=r.revision+1,updated_at=now() where id=1;
 return r.revision+1;
end;$$;
revoke all on function public.save_schedule(bigint,jsonb) from public,anon;
grant execute on function public.save_schedule(bigint,jsonb) to authenticated;
