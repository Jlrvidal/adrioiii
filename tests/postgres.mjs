// Optional local integration suite. Set PGLITE_MODULE to an installed module URL.
import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { defaults, decode, complete } from '../src/schedule.js'
const { PGlite } = await import(
  process.env.PGLITE_MODULE || '@electric-sql/pglite'
)
const db = new PGlite()
await db.exec(`create role anon;create role authenticated;create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth to authenticated;
create table public.schedule(id integer primary key,revision integer,state jsonb,updated_at timestamptz);
create table public.schedule_history(revision integer,state jsonb,saved_at timestamptz);
create function public.save_schedule(expected int,next_state jsonb) returns int language sql as $$select expected+1$$;
grant all on public.schedule,public.schedule_history to authenticated,anon;`)
const state = defaults()
await db.query('insert into public.schedule values(1,0,$1,now())', [
  JSON.stringify(state),
])
await db.exec(
  await readFile(
    new URL('../migrations/001_production.sql', import.meta.url),
    'utf8',
  ),
)
const save = (n, s, restore = false) =>
  db.query('select public.adrio_publish($1,$2,$3)', [
    n,
    JSON.stringify(s),
    restore,
  ])
for (const role of ['anon', 'authenticated']) {
  await db.exec('set role ' + role)
  assert.equal(
    (await db.query('select revision from public.schedule')).rows.length,
    1,
  )
  await assert.rejects(save(0, state))
  await assert.rejects(db.exec('select * from public.adrio_history()'))
  await assert.rejects(db.exec('select * from public.schedule_history'))
  await assert.rejects(db.exec('update public.schedule set revision=15'))
  await assert.rejects(db.exec("select public.save_schedule(0,'{}')"))
  await db.exec('reset role')
}
await db.exec(
  "set role authenticated;set request.jwt.claim.sub='c7bad662-fa5d-445d-a219-ed1976c58e84'",
)
await assert.rejects(save(0, { ...state, version: 0 }))
await assert.rejects(save(0, { ...state, completed: [true] }))
const locked = complete(state, 'optimista', 0)
await save(0, locked)
await assert.rejects(save(0, locked), { code: '40001' })
await assert.rejects(save(1, state))
await save(1, state, true)
assert.deepEqual(
  (await db.query('select revision from public.adrio_history()')).rows.map(
    (r) => Number(r.revision),
  ),
  [1, 0],
)
assert.deepEqual(
  decode((await db.query('select state from public.schedule')).rows[0].state),
  state,
)
await db.close()
console.log(
  'PostgreSQL migration, ACLs, validation, locks, conflict, compatibility and transactional history passed.',
)
