import { delivery, format, phases, defaults } from './schedule.js'
import { descriptions, icon, phaseStatus, day } from './phases.js'
import { element as el } from './chart.js'
const $ = (id) => document.getElementById(id),
  base = defaults()
const delta = (n) =>
  n === 0
    ? 'Sin variación'
    : Math.abs(n) +
      ' ' +
      (Math.abs(n) === 1 ? 'mes' : 'meses') +
      (n > 0 ? ' más tarde' : ' antes')
export function overview(
  state,
  mode,
  now,
  known,
  entries,
  series,
  compare,
  baseline,
) {
  const plan = state.plans[mode],
    actual = state.completed.filter(Boolean).length
  const expected = plan.filter((p) => p.s + p.d <= now).length
  $('count').textContent = known ? actual + ' de 7' : 'Sin datos'
  $('expected').textContent =
    (compare
      ? expected +
        ' previstos (optimista) · ' +
        state.plans.pesimista.filter((p) => p.s + p.d <= now).length +
        ' (pesimista)'
      : expected + ' previstos a día de hoy') +
    (known && actual !== expected
      ? ' · diferencia: ' + (actual - expected)
      : '')
  const observed = phases.flatMap((p, i) =>
    phaseStatus(state, i, entries, now, mode) === 'En ejecución'
      ? [descriptions[i][1]]
      : [],
  )
  $('actual').textContent =
    observed.join(' · ') ||
    (actual
      ? 'Último hito confirmado: ' +
        descriptions[state.completed.lastIndexOf(true)][1]
      : 'Sin actividad confirmada')
  for (const [m, id] of [
    ['optimista', 'early'],
    ['pesimista', 'late'],
  ]) {
    const end = delivery(state.plans[m]),
      prior = series.at(-2)?.[m]
    $(id).textContent = format(end)
    $(id + 'Delta').textContent =
      Math.max(0, Math.ceil(end - now)) +
      ' meses restantes · ' +
      delta(end - delivery(base.plans[m])).toLowerCase() +
      ' respecto al plan inicial' +
      (Number.isInteger(prior)
        ? ' · ' +
          delta(end - prior).toLowerCase() +
          ' desde la revisión anterior'
        : '')
  }
  const events = plan
    .flatMap((p, i) =>
      state.completed[i]
        ? []
        : [
            { at: p.s, t: 'Inicio de ' + descriptions[i][1].toLowerCase() },
            {
              at: p.s + p.d,
              t:
                i === 6
                  ? 'Entrega prevista'
                  : 'Fin de ' + descriptions[i][1].toLowerCase(),
            },
          ],
    )
    .filter((v) => v.at > now)
    .sort((a, b) => a.at - b.at)
  $('next').textContent = events[0]
    ? events[0].t + ' · ' + format(events[0].at)
    : 'Sin hitos pendientes en el calendario'
  const box = $('milestones')
  box.replaceChildren()
  for (const event of events.slice(0, 3)) {
    const item = el('div')
    item.append(el('small', format(event.at)), el('strong', event.t))
    box.append(item)
  }
  if (!events.length)
    box.textContent = 'Sin fechas futuras en la previsión seleccionada.'
  const major = el('details')
  major.append(el('summary', 'Hitos principales de la previsión'))
  for (const i of [2, 3, 6]) {
    const p = plan[i],
      alt = state.plans.pesimista[i]
    major.append(
      el(
        'p',
        descriptions[i][1] +
          ' · ' +
          format(p.s + p.d) +
          (compare ? ' a ' + format(alt.s + alt.d) : '') +
          (state.completed[i] ? ' · Completada' : ' · Fin previsto'),
      ),
    )
  }
  box.append(major)
  const list = $('phaseList')
  list.replaceChildren()
  function detail(i) {
    const p = plan[i],
      box = $('phaseBody')
    box.replaceChildren(
      icon(i),
      el('small', descriptions[i][0]),
      el('h2', phases[i][1]),
      el('p', descriptions[i][2]),
      el('p', 'Estado: ' + phaseStatus(state, i, entries, now, mode)),
      el(
        'p',
        'Previsión ' +
          mode +
          ': ' +
          format(p.s) +
          ' – ' +
          format(p.s + p.d) +
          ' · ' +
          p.d +
          ' meses.',
      ),
    )
    box.append(
      el(
        'p',
        i
          ? 'Depende de ' +
              descriptions[i - 1][1].toLowerCase() +
              '. El calendario admite los solapamientos previstos.'
          : 'Primera fase del calendario.',
      ),
      el(
        'p',
        i < 6
          ? 'A continuación: ' + phases[i + 1][1] + '.'
          : 'Último hito del seguimiento.',
      ),
    )
    if (state.completed[i])
      box.append(
        el(
          'p',
          'Periodo confirmado: ' +
            format(p.s) +
            ' – ' +
            format(p.s + p.d) +
            '.',
        ),
      )
    for (const row of entries.filter((r) => r.phase === p.id))
      box.append(
        el('p', day(row.observed) + ' · ' + row.title + ' — ' + row.body),
      )
    $('phaseDialog').showModal()
  }
  plan.forEach((p, i) => {
    const item = el('button', '', 'phaseItem'),
      body = el('span')
    body.append(
      el('small', descriptions[i][0]),
      el('strong', phases[i][1]),
      el(
        'span',
        format(p.s) + ' – ' + format(p.s + p.d) + ' · ' + p.d + ' meses',
      ),
      el('small', phaseStatus(state, i, entries, now, mode)),
    )
    if (compare) {
      const alt = state.plans.pesimista[i]
      body.append(
        el(
          'small',
          'Pesimista: ' + format(alt.s) + ' – ' + format(alt.s + alt.d),
        ),
      )
    }
    if (baseline) {
      for (const m of compare ? ['optimista', 'pesimista'] : [mode]) {
        const orig = base.plans[m][i]
        body.append(
          el(
            'small',
            'Inicial ' +
              m +
              ': ' +
              format(orig.s) +
              ' – ' +
              format(orig.s + orig.d),
          ),
        )
      }
    }
    if (state.completed[i])
      body.append(el('small', 'Fin confirmado: ' + format(p.s + p.d)))
    const entry = entries.find((r) => r.phase === p.id)
    if (entry)
      body.append(el('small', day(entry.observed) + ' · ' + entry.title))
    item.append(icon(i), body, el('span', '↗'))
    item.onclick = () => detail(i)
    list.append(item)
  })
  const journey = $('journey')
  journey.replaceChildren()
  plan.forEach((p, i) => {
    const b = el('button')
    b.append(
      icon(i),
      el('strong', descriptions[i][1]),
      el('small', phaseStatus(state, i, entries, now, mode)),
    )
    b.onclick = () => detail(i)
    journey.append(b)
  })
  return detail
}
export function forecasts(rows, unavailable = false) {
  const box = $('forecasts')
  box.replaceChildren()
  if (!rows || rows.length < 2) {
    box.append(
      el(
        'p',
        unavailable
          ? 'No se ha podido consultar el histórico de previsiones.'
          : 'La evolución se mostrará cuando haya dos publicaciones para comparar.',
        'empty',
      ),
    )
    return
  }
  const ns = 'http://www.w3.org/2000/svg',
    svg = document.createElementNS(ns, 'svg')
  svg.setAttribute('viewBox', '0 0 760 175')
  svg.setAttribute('role', 'img')
  svg.setAttribute(
    'aria-label',
    'Evolución de la entrega por fecha de publicación. Valores en la tabla de revisiones.',
  )
  const times = rows.map((r) => Date.parse(r.published_at)),
    minT = Math.min(...times),
    maxT = Math.max(...times)
  const vals = rows.flatMap((r) => [r.optimista, r.pesimista]),
    low = Math.min(...vals) - 1,
    high = Math.max(...vals) + 1
  const x = (i) => 88 + ((times[i] - minT) / Math.max(1, maxT - minT)) * 650,
    y = (n) => 135 - ((n - low) / (high - low)) * 118
  function text(x, y, t) {
    const l = document.createElementNS(ns, 'text')
    l.setAttribute('x', x)
    l.setAttribute('y', y)
    l.textContent = t
    svg.append(l)
  }
  for (const n of new Set([low + 1, Math.round((high + low) / 2), high - 1]))
    text(0, y(n), format(n))
  for (const mode of ['optimista', 'pesimista']) {
    const path = document.createElementNS(ns, 'polyline')
    path.setAttribute(
      'points',
      rows.map((r, i) => x(i) + ',' + y(r[mode])).join(' '),
    )
    path.setAttribute('class', mode)
    svg.append(path)
  }
  text(88, 165, new Date(minT).toLocaleDateString('es-ES'))
  text(657, 165, new Date(maxT).toLocaleDateString('es-ES'))
  box.append(svg)
  const last = rows.at(-1),
    prior = rows.at(-2)
  box.append(
    el(
      'p',
      'Optimista: ' +
        delta(last.optimista - prior.optimista) +
        '. Pesimista: ' +
        delta(last.pesimista - prior.pesimista) +
        '.',
    ),
  )
  const log = el('details')
  log.append(el('summary', 'Ver todas las publicaciones'))
  for (const r of [...rows].reverse())
    log.append(
      el(
        'p',
        day(r.published_at) +
          ' · Optimista: ' +
          format(r.optimista) +
          ' · Pesimista: ' +
          format(r.pesimista) +
          (r.reason ? ' · ' + r.reason : ''),
      ),
    )
  box.append(log)
}
