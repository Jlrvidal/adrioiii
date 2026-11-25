// Optional local integration suite. Set PGLITE_MODULE to an installed module URL.
import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { defaults, decode } from '../src/schedule.js'
const { PGlite } = await import(
  process.env.PGLITE_MODULE || '@electric-sql/pglite'
)
const db = new PGlite()
await db.exec(`create role anon;create role authenticated;create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth to authenticated;`)
const owner = 'c7bad662-fa5d-445d-a219-ed1976c58e84'
const setup = await readFile(
  new URL('./fixtures/original-setup.sql', import.meta.url),
  'utf8',
)
await db.exec(setup.replaceAll('OWNER_UUID', owner))
const state = defaults()
const current = async () =>
  (await db.query('select * from public.schedule')).rows[0]
const history = async () =>
  (await db.query('select * from public.schedule_history order by revision'))
    .rows
const seed = await current()
assert.deepEqual(decode(seed.state), state)
const legacySave = (revision, value) =>
  db.query('select public.save_schedule($1,$2)', [
    revision,
    JSON.stringify(value),
  ])
await db.exec(
  "set role authenticated; set request.jwt.claim.sub='00000000-0000-4000-a000-000000000001'",
)
await assert.rejects(legacySave(0, seed.state), /No autorizado/)
await db.exec(`set request.jwt.claim.sub='${owner}'`)
const legacy = structuredClone(seed.state)
legacy.data[0].done = true
await legacySave(0, legacy)
await db.exec('reset role; reset request.jwt.claim.sub')
const before = await current()
const archive = await history()
assert.equal(archive.length, 1)
assert.deepEqual(archive[0].state, seed.state)
await db.exec(
  await readFile(
    new URL('../migrations/001_production.sql', import.meta.url),
    'utf8',
  ),
)
assert.deepEqual(await current(), before)
assert.deepEqual(await history(), archive)
const save = (n, s, restore = false) =>
  db.query('select public.adrio_publish($1,$2,$3)', [
    n,
    JSON.stringify(s),
    restore,
  ])
for (const role of ['anon', 'authenticated']) {
  await db.exec('set role ' + role)
  if (role === 'authenticated')
    await db.exec(
      "set request.jwt.claim.sub='00000000-0000-4000-a000-000000000001'",
    )
  assert.equal(
    (await db.query('select revision from public.schedule')).rows.length,
    1,
  )
  await assert.rejects(save(1, state), { code: '42501' })
  await assert.rejects(db.exec('select * from public.adrio_history()'))
  await assert.rejects(db.exec('select * from public.schedule_history'))
  await assert.rejects(db.exec('update public.schedule set revision=15'))
  await assert.rejects(db.exec("select public.save_schedule(1,'{}')"), {
    code: '42501',
  })
  await db.exec('reset role')
}
await db.exec(
  "set role authenticated;set request.jwt.claim.sub='c7bad662-fa5d-445d-a219-ed1976c58e84'",
)
await assert.rejects(save(1, { ...state, version: 0 }), { code: '22023' })
await assert.rejects(save(1, { ...state, completed: [true] }), {
  code: '22023',
})
await assert.rejects(save(1, state), /Hito completado bloqueado/)
const locked = decode(legacy)
await save(1, locked)
await assert.rejects(save(1, locked), { code: '40001' })
await assert.rejects(save(2, state), /Hito completado bloqueado/)
const existing = (await db.query('select * from public.adrio_history()')).rows
assert.deepEqual(
  existing.map((r) => Number(r.revision)),
  [1, 0],
)
assert.deepEqual(existing[0], {
  revision: before.revision,
  state: before.state,
  updated_at: before.updated_at,
})
assert.deepEqual(existing[1], archive[0])
await save(2, decode(existing[1].state), true)
assert.deepEqual(
  (await db.query('select revision from public.adrio_history()')).rows.map(
    (r) => Number(r.revision),
  ),
  [2, 1, 0],
)
assert.deepEqual(
  decode((await db.query('select state from public.schedule')).rows[0].state),
  state,
)
await db.close()
console.log(
  'PostgreSQL migration, ACLs, validation, locks, conflict, compatibility and transactional history passed.',
)
