export const phases = [
  ['foundation', 'Cimentación'],
  ['parking', 'Dos plantas de garaje'],
  ['structure', 'Estructura de las viviendas'],
  ['facade', 'Fachadas y cerramientos'],
  ['services', 'Instalaciones y tabiquería'],
  ['finishes', 'Acabados interiores'],
  ['delivery', 'Trámites y entrega'],
]
export const modes = ['optimista', 'pesimista']
// Each phase after foundation depends on its predecessor. Values are maximum
// months of overlap with that predecessor; zero means finish-to-start.
const rules = {
  optimista: {
    durations: [3, 4, 4, 4, 6, 5, 3],
    overlap: [0, 1, 1, 1, 3, 2, 0],
  },
  pesimista: {
    durations: [4, 5, 5, 5, 8, 7, 4],
    overlap: [0, 1, 1, 1, 4, 3, 0],
  },
}
const base = 2026 * 12 + 11
export function monthISO(offset) {
  const v = base + offset
  return Math.floor(v / 12) + '-' + String((v % 12) + 1).padStart(2, '0')
}
export function offsetOf(value) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) throw Error('Mes no válido.')
  const [year, month] = value.split('-').map(Number)
  return year * 12 + month - 1 - base
}
export const format = (n) =>
  new Intl.DateTimeFormat('es-ES', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(monthISO(n) + '-01T12:00:00Z'))
export function today(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Madrid',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  )
  return (
    offsetOf(parts.year + '-' + parts.month) +
    (Number(parts.day) - 1) /
      new Date(Date.UTC(+parts.year, +parts.month, 0)).getUTCDate()
  )
}
const end = (p) => p.s + p.d
export const delivery = (plan) => Math.max(...plan.map(end))
const earliest = (prev, mode, i) =>
  Math.max(prev.s, end(prev) - rules[mode].overlap[i])
function check(condition, msg = 'El calendario contiene datos no válidos.') {
  if (!condition) throw Error(msg)
}
function keys(obj, expected) {
  check(
    obj &&
      typeof obj === 'object' &&
      Object.keys(obj).sort().join('|') ===
        expected.split(' ').sort().join('|'),
  )
}
export function defaults() {
  const plans = {}
  for (const mode of modes) {
    const plan = (plans[mode] = [])
    phases.forEach(([id], i) =>
      plan.push({
        id,
        s: i ? earliest(plan[i - 1], mode, i) : 0,
        d: rules[mode].durations[i],
      }),
    )
  }
  return { version: 2, plans, completed: Array(7).fill(false) }
}
export function validate(state) {
  keys(state, 'version plans completed')
  check(
    state.version === 2 &&
      Array.isArray(state.completed) &&
      state.completed.length === 7 &&
      state.completed.every((v) => typeof v === 'boolean'),
  )
  keys(state.plans, 'optimista pesimista')
  for (const mode of modes) {
    const plan = state.plans[mode]
    check(Array.isArray(plan) && plan.length === 7)
    plan.forEach((p, i) => {
      keys(p, 'id s d')
      check(
        p.id === phases[i][0] &&
          Number.isInteger(p.s) &&
          Number.isInteger(p.d) &&
          p.s >= -60 &&
          p.d >= 1 &&
          p.d <= 120 &&
          end(p) <= 240,
      )
      if (i)
        check(
          p.s >= earliest(plan[i - 1], mode, i),
          'Las fechas entran en conflicto con una fase dependiente.',
        )
      if (state.completed[i]) {
        const actual = state.plans.optimista[i]
        check(
          p.s === actual.s && p.d === actual.d,
          'Las fechas de una fase completada deben coincidir.',
        )
      }
    })
  }
  return state
}
function propagate(plan, previous, mode, index, locked) {
  for (let i = index + 1; i < 7; i++) {
    const limit = earliest(plan[i - 1], mode, i)
    if (locked[i]) {
      check(
        plan[i].s >= limit,
        'El cambio entra en conflicto con una fase completada.',
      )
      continue
    }
    plan[i].s = limit + previous[i].s - earliest(previous[i - 1], mode, i)
  }
}
export function edit(state, mode, i, s, d) {
  check(!state.completed[i], 'Esta fase está bloqueada.')
  const next = structuredClone(state),
    plan = next.plans[mode]
  Object.assign(plan[i], { s, d })
  propagate(plan, state.plans[mode], mode, i, state.completed)
  return validate(next)
}
export function complete(state, mode, i) {
  const next = structuredClone(state),
    other = modes.find((m) => m !== mode)
  next.completed[i] = true
  next.plans[other][i] = { ...next.plans[mode][i] }
  propagate(next.plans[other], state.plans[other], other, i, next.completed)
  return validate(next)
}
export function decode(raw) {
  if (raw?.version !== undefined) {
    // PostgreSQL also supplies the legacy reader projection for rollback.
    if ('data' in raw && 'mode' in raw) {
      const { data, mode, ...state } = raw
      validate(state)
      check(mode === 'optimista' && Array.isArray(data) && data.length === 7)
      data.forEach((p, i) =>
        check(
          p.name === phases[i][1] &&
            p.s === state.plans.optimista[i].s &&
            p.d === state.plans.optimista[i].d &&
            p.done === state.completed[i],
        ),
      )
      return state
    }
    return validate(raw)
  }
  check(
    modes.includes(raw?.mode) &&
      Array.isArray(raw.data) &&
      raw.data.length === 7,
  )
  const next = defaults(),
    mode = raw.mode,
    other = modes.find((m) => m !== mode)
  raw.data.forEach((p, i) => {
    check(
      p.name === phases[i][1] &&
        typeof p.done === 'boolean' &&
        Number.isInteger(p.d) &&
        Number.isInteger(p.s),
    )
    const original = next.plans[mode][i],
      alt = next.plans[other][i]
    const gap = i ? p.s - earliest(raw.data[i - 1], mode, i) : p.s
    alt.d = p.done ? p.d : Math.max(1, alt.d + p.d - original.d)
    alt.s = p.done
      ? p.s
      : gap + (i ? earliest(next.plans[other][i - 1], other, i) : 0)
    Object.assign(original, { s: p.s, d: p.d })
    next.completed[i] = p.done
  })
  return validate(next)
}
// A confirmed historical correction is explicit and publishes a new revision.
// Other locked phases remain fixed and can veto the correction.
export function correctMilestone(state, i, start, end) {
  check(state.completed[i], 'Solo se pueden corregir hitos confirmados.')
  const next = structuredClone(state)
  for (const mode of modes) {
    Object.assign(next.plans[mode][i], { s: start, d: end - start })
    propagate(next.plans[mode], state.plans[mode], mode, i, state.completed)
  }
  return validate(next)
}
