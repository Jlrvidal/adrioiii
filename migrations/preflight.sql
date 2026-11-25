-- Read-only. Retain this output and a schema/data dump before migration.
select table_name,column_name,data_type,column_default from information_schema.columns
where table_schema='public' order by table_name,ordinal_position;
select * from pg_policies where schemaname='public';
select * from information_schema.role_table_grants where table_schema='public';
select * from information_schema.column_privileges where table_schema='public';
select p.oid::regprocedure,p.prosecdef,p.proconfig,p.proacl,pg_get_functiondef(p.oid)
from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f';
select * from pg_default_acl;
select * from information_schema.triggers where event_object_schema='public';
select * from pg_views where schemaname='public';
select id,revision,updated_at,state from public.schedule;
