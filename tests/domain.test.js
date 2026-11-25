import test from 'node:test'
import assert from 'node:assert/strict'
import {
  defaults,
  edit,
  complete,
  decode,
  delivery,
  validate,
  today,
  offsetOf,
  monthISO,
  phases,
} from '../src/schedule.js'
import { settings } from '../src/backend.js'
test('Original estimates and explicit dependency overlaps survive moves, advances and resizes', () => {
  const initial = defaults()
  assert.equal(delivery(initial.plans.optimista), 21)
  assert.equal(delivery(initial.plans.pesimista), 28)
  const a = edit(initial, 'optimista', 0, 0, 5),
    b = edit(a, 'optimista', 1, 7, 4)
  assert.deepEqual(
    a.plans.optimista.map((p) => p.s),
    [0, 4, 7, 10, 11, 15, 20],
  )
  assert.deepEqual(
    b.plans.optimista.map((p) => p.s),
    [0, 7, 10, 13, 14, 18, 23],
  )
  assert.deepEqual(edit(a, 'optimista', 0, 0, 3), initial)
  assert.deepEqual(
    edit(initial, 'optimista', 0, -2, 5).plans.optimista.slice(1),
    initial.plans.optimista.slice(1),
  )
  assert.throws(() => edit(initial, 'optimista', 0, 0, 0))
})
test('Repeated projection reads preserve both plans, legacy records and locked dates', () => {
  const original = defaults(),
    legacy = {
      mode: 'optimista',
      data: original.plans.optimista.map((p, i) => ({
        name: phases[i][1],
        s: p.s,
        d: p.d,
        done: false,
      })),
    }
  const state = complete(decode(legacy), 'pesimista', 1),
    copy = structuredClone(state)
  for (let i = 0; i < 100; i++)
    assert.equal(state.plans[i % 2 ? 'optimista' : 'pesimista'][1].s, 3)
  assert.deepEqual(state, copy)
  assert.throws(() => edit(state, 'optimista', 0, 0, 9))
  assert.deepEqual(decode(legacy), original)
  assert.equal(legacy.data[1].done, false)
})
test('Madrid leap day, midnight and year boundaries', () => {
  assert.equal(
    today(new Date('2028-02-28T23:30:00Z')),
    offsetOf('2028-02') + 28 / 29,
  )
  assert.equal(today(new Date('2026-12-31T23:30:00Z')), 1)
  assert.equal(monthISO(-13), '2025-11')
})
test('Malformed remote or backup data cannot enter the store', () => {
  for (const mutate of [
    (s) => s.completed.pop(),
    (s) => s.plans.optimista.reverse(),
    (s) => (s.version = 1),
    (s) => (s.plans.optimista[0].s = 0.1),
    (s) => (s.completed[3] = 'false'),
    (s) => (s.extra = true),
  ]) {
    const s = defaults()
    mutate(s)
    assert.throws(() => validate(s))
  }
})
test('Reject API paths and privileged key formats', () => {
  const c = {
    url: 'https://project.supabase.co',
    key: 'sb_publishable_example',
    owner: 'c7bad662-fa5d-445d-a219-ed1976c58e84',
  }
  assert.equal(settings(c).url, c.url)
  assert.equal(settings({ ...c, url: c.url + '/rest/v1/' }).url, c.url)
  assert.equal(settings({ ...c, url: c.url + '/auth/v1' }).normalized, true)
  for (const path of ['/rest/v2', '/prefix/rest/v1', '/rest/v1/?q=1'])
    assert.throws(() => settings({ ...c, url: c.url + path }))
  assert.throws(() => settings({ ...c, key: 'sb_secret_example' }))
})

test('Year segments change precisely at January and baseline is immutable', async () => {
  const { yearParts } = await import('../src/phases.js')
  assert.deepEqual(yearParts(offsetOf('2027-09'), 6), [
    { year: 2027, months: 4 },
    { year: 2028, months: 2 },
  ])
  const original = defaults()
  edit(original, 'optimista', 0, 0, 6)
  assert.deepEqual(original, defaults())
})

test('Explicit corrections to actual dates move future work in both scenarios and preserve other locked phases', async () => {
  const { correctMilestone } = await import('../src/schedule.js')
  const a = complete(defaults(), 'optimista', 0)
  const b = correctMilestone(a, 0, 0, 5)
  for (const m of ['optimista', 'pesimista'])
    assert.equal(b.plans[m][1].s, a.plans[m][1].s + 2)
  const locked = complete(a, 'optimista', 1)
  assert.throws(() => correctMilestone(locked, 0, 0, 9))
})
