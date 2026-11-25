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
// The storage service manages these tables on Supabase. This fixture tests the
// PostgreSQL policies; the hosted upload gateway is outside this local suite.
await db.exec(`reset role; create schema storage;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(bucket_id text references storage.buckets(id),name text,primary key(bucket_id,name));
alter table storage.objects enable row level security;
create policy preexisting_storage_grant on storage.objects for all to public using(true) with check(true);
grant usage on schema storage to anon,authenticated;
grant select,insert,update,delete on storage.objects to anon,authenticated;`)
await db.exec(
  await readFile(
    new URL('../migrations/002_resident_portal.sql', import.meta.url),
    'utf8',
  ),
)
const photo = '12345678-1234-4123-8123-123456789abc.webp'
const object = () =>
  db.query("insert into storage.objects values('adrio-diary',$1)", [photo])
const entry = () =>
  db.query(
    "insert into public.adrio_diary(observed,phase,title,body,photo) values(current_date,'foundation','Prueba','Contenido de prueba',$1)",
    [photo],
  )
for (const role of ['anon', 'authenticated']) {
  await db.exec(
    'set role ' +
      role +
      ";set request.jwt.claim.sub='00000000-0000-4000-a000-000000000001'",
  )
  await assert.rejects(object(), { code: '42501' })
  await assert.rejects(entry(), { code: '42501' })
  const rows = (await db.query('select * from public.adrio_forecasts()')).rows
  assert.deepEqual(Object.keys(rows[0]).sort(), [
    'optimista',
    'pesimista',
    'published_at',
    'reason',
    'revision',
  ])
  assert.deepEqual([rows[0].optimista, rows[0].pesimista], [21, 28])
  await db.exec('reset role')
}
await db.exec(`set role authenticated;set request.jwt.claim.sub='${owner}'`)
await object()
await assert.rejects(
  db.exec("insert into storage.objects values('adrio-diary','image.svg')"),
  { code: '42501' },
)
await db.exec('reset role; set role anon')
assert.equal((await db.query('select * from storage.objects')).rows.length, 0)
await db.exec('reset role;set role authenticated')
await entry()
await db.exec('reset role;set role anon')
assert.equal((await db.query('select * from storage.objects')).rows.length, 1)
assert.equal(
  (await db.query('select * from public.adrio_diary')).rows.length,
  1,
)
await db.exec('reset role;set role authenticated')
await db.exec('delete from public.adrio_diary')
await db.exec('reset role;set role anon')
assert.equal((await db.query('select * from storage.objects')).rows.length, 0)
await db.exec('reset role')
await db.exec(
  await readFile(
    new URL('../migrations/003_daily_photos.sql', import.meta.url),
    'utf8',
  ),
)
assert.equal(
  (
    await db.query(
      "select relrowsecurity from pg_class where oid='adrio_private.daily_photos'::regclass",
    )
  ).rows[0].relrowsecurity,
  true,
)
const jpeg = await readFile(new URL('fixtures/album.jpg', import.meta.url))
const add = (id, bytes = jpeg) =>
  db.query('select public.adrio_add_photo($1,$2) as path', [
    id,
    bytes.toString('base64'),
  ])
await db.exec('set role anon')
await assert.rejects(add(crypto.randomUUID(), Buffer.from('invalid')), /válida/)
const id = crypto.randomUUID()
const path = (await add(id)).rows[0].path
assert.equal((await add(id)).rows[0].path, path)
await add(crypto.randomUUID())
await db.exec('reset role;set role authenticated')
await add(crypto.randomUUID())
await assert.rejects(add(crypto.randomUUID()), /tres fotos/)
assert.equal(
  (await db.query('select * from public.adrio_photo_index()')).rows.length,
  3,
)
assert.deepEqual(
  Buffer.from(
    (
      await db.query('select public.adrio_photo($1,1::smallint) as b', [
        path.slice(0, 10),
      ])
    ).rows[0].b,
    'base64',
  ),
  jpeg,
)
await assert.rejects(object(), { code: '42501' })
const comment = () =>
  db.exec("insert into public.adrio_comments(body) values ('Avance')")
await db.exec(
  "set request.jwt.claim.sub='00000000-0000-4000-a000-000000000001'",
)
await assert.rejects(comment(), { code: '42501' })
await db.exec(`set request.jwt.claim.sub='${owner}'`)
await comment()
await db.exec(
  "set request.jwt.claim.sub='00000000-0000-4000-a000-000000000001';delete from public.adrio_comments",
)
assert.equal(
  (await db.query('select * from public.adrio_comments')).rows.length,
  1,
)
await db.exec(
  `set request.jwt.claim.sub='${owner}';delete from public.adrio_comments`,
)
assert.equal(
  (await db.query('select * from public.adrio_comments')).rows.length,
  0,
)
await db.exec('reset role')
await db.exec(
  await readFile(
    new URL('../migrations/004_photo_moderation.sql', import.meta.url),
    'utf8',
  ),
)
assert.equal(
  (await db.query('select * from public.adrio_photo_index()')).rows.length,
  3,
)
await db.exec('truncate adrio_private.daily_photos')
const rpc = (name, id) => db.query('select public.adrio_' + name + '($1)', [id])
const date = path.slice(0, 10)
const pending = async () =>
  (await db.query('select * from public.adrio_pending_photos()')).rows
const index = async () =>
  (await db.query('select * from public.adrio_photo_index()')).rows
const remove = (slot) =>
  db.query('select public.adrio_remove_photo($1,$2::smallint)', [date, slot])
const anon = () =>
  db.exec('reset role; set role anon; reset request.jwt.claim.sub')
const admin = () =>
  db.exec(
    `reset role; set role authenticated; set request.jwt.claim.sub='${owner}'`,
  )
const newUpload = () => add(crypto.randomUUID())
const visitorId = crypto.randomUUID()
await anon()
assert.equal((await add(visitorId)).rows[0].path, 'pendiente')
assert.equal((await add(visitorId)).rows[0].path, 'pendiente')
assert.equal((await index()).length, 0)
assert.equal(
  (await db.query('select public.adrio_photo($1,1::smallint) as b', [date]))
    .rows[0].b,
  null,
)
for (const role of ['anon', 'authenticated']) {
  await db.exec('reset role; set role ' + role)
  await assert.rejects(db.query('select * from adrio_private.photo_queue'), {
    code: '42501',
  })
  await assert.rejects(pending(), { code: '42501' })
  for (const name of ['pending_photo', 'approve_photo', 'reject_photo'])
    await assert.rejects(rpc(name, visitorId), { code: '42501' })
  await assert.rejects(remove(1), { code: '42501' })
}
await admin()
const queue = await pending()
assert.equal(queue.length, 1)
const first = queue[0].id
assert.deepEqual(
  Buffer.from(
    (await rpc('pending_photo', first)).rows[0].adrio_pending_photo,
    'base64',
  ),
  jpeg,
)
await rpc('approve_photo', first)
assert.equal((await index())[0].slot, 1)
await anon()
assert.equal((await add(visitorId)).rows[0].path, date + '/1.jpg')
await newUpload()
await newUpload()
await admin()
const [second, third] = await pending()
assert.equal((await newUpload()).rows[0].path, date + '/2.jpg')
assert.equal((await newUpload()).rows[0].path, date + '/3.jpg')
await assert.rejects(rpc('approve_photo', second.id), /tres fotos/)
await anon()
await assert.rejects(newUpload(), /tres fotos/)
await admin()
await remove(2)
await rpc('approve_photo', second.id)
assert.deepEqual(
  (await index()).map((r) => r.slot),
  [1, 2, 3],
)
await rpc('reject_photo', third.id)
assert.equal((await pending()).length, 0)
await remove(1)
await assert.rejects(remove(1), /no existe/)
await db.exec('reset role')
await entry()
await db.query(
  'insert into adrio_private.daily_photos(taken,slot,request_id,legacy) values($1,1,gen_random_uuid(),$2)',
  [date, photo],
)
await admin()
await remove(1)
assert.equal(
  (await db.query('select photo from public.adrio_diary')).rows[0].photo,
  photo,
)
assert.equal((await db.query('select * from storage.objects')).rows.length, 1)
assert.equal((await newUpload()).rows[0].path, date + '/1.jpg')
await db.query(
  "insert into public.adrio_diary(observed,phase,title,body,photo) values($1,'foundation','Foto','Detalle',$2)",
  [date, date + '/1.jpg'],
)
await remove(1)
assert.equal(
  (await db.query("select photo from public.adrio_diary where title='Foto'"))
    .rows[0].photo,
  null,
)
await anon()
for (let i = 0; i < 3; i++)
  assert.equal((await newUpload()).rows[0].path, 'pendiente')
await assert.rejects(newUpload(), /pendientes está llena/)
await db.exec('reset role')
await db.query('update adrio_private.photo_queue set submitted_on=$1::date-1', [
  date,
])
await anon()
await assert.rejects(newUpload(), /pendientes está llena/)
await admin()
assert.equal((await pending()).length, 3)
assert.equal((await newUpload()).rows[0].path, date + '/1.jpg')
const olderDay = (await pending()).find(
  (row) => String(row.submitted_on) !== date,
)
await rpc('approve_photo', olderDay.id)
assert.equal(
  (await index()).find(
    (row) => String(row.taken) === String(olderDay.submitted_on),
  ).slot,
  1,
)
await db.close()
console.log(
  'Four migrations passed, including photo moderation, permissions and queue limits.',
)
