import test from 'node:test'
import assert from 'node:assert/strict'
import { defaults, edit } from '../src/schedule.js'
import { ScheduleStore } from '../src/sync.js'
test('Failed writes recover on reload; competing revisions preserve draft; visitors cannot stage', async () => {
  const cache = new Map(),
    storage = {
      getItem: (k) => cache.get(k),
      setItem: (k, v) => cache.set(k, v),
      removeItem: (k) => cache.delete(k),
    }
  const row = {
    revision: 0,
    state: defaults(),
    updated_at: new Date().toISOString(),
  }
  let calls = 0
  const api = {
    scope: 'example',
    owner: 'uid',
    load: async () => row,
    save: async () => {
      calls++
      throw Error('offline')
    },
  }
  const make = () => new ScheduleStore(api, storage, () => {})
  const a = make()
  await a.refresh()
  assert.throws(() => a.stage(row.state))
  assert.equal(calls, 0)
  a.authorize(true)
  const next = edit(a.state, 'optimista', 0, 0, 4)
  a.stage(next)
  await new Promise(setImmediate)
  const b = make()
  b.authorize(true)
  assert.deepEqual(b.state, next)
  row.revision++
  await b.refresh()
  assert.equal(b.conflict, true)
  assert.equal(calls, 1)
  b.authorize(false)
  assert.deepEqual(b.state, row.state)
  assert.equal(cache.size, 1)
})
test('Queued changes serialize and stale reads cannot replace a draft', async () => {
  const cache = new Map(),
    row = {
      revision: 0,
      state: defaults(),
      updated_at: new Date().toISOString(),
    }
  let resolve,
    finish,
    calls = 0
  const api = {
    scope: 'p',
    owner: 'u',
    load: async () => row,
    save: (base, state) => {
      calls++
      return new Promise(
        (r) =>
          (finish = () => {
            Object.assign(row, { revision: base + 1, state })
            r({ ...row })
          }),
      )
    },
  }
  const a = new ScheduleStore(
    api,
    {
      getItem: (k) => cache.get(k),
      setItem: (k, v) => cache.set(k, v),
      removeItem: (k) => cache.delete(k),
    },
    () => {},
  )
  a.authorize(true)
  await a.refresh()
  api.load = () => new Promise((r) => (resolve = r))
  const stale = a.refresh()
  a.stage(edit(a.state, 'optimista', 0, 0, 4))
  a.stage(edit(a.state, 'optimista', 0, 0, 5))
  assert.equal(calls, 1)
  resolve({ ...row })
  await stale
  assert.equal(a.state.plans.optimista[0].d, 5)
  finish()
  await new Promise(setImmediate)
  assert.equal(calls, 2)
  finish()
  await new Promise(setImmediate)
  assert.equal(row.revision, 2)
  assert.equal(a.draft, null)
  assert.equal(cache.size, 0)
})
