import { delivery, format, phases, scenarioNames } from './schedule.js'
import { descriptions, icon, day } from './phases.js'
import { element as el } from './chart.js'
const $ = (id) => document.getElementById(id)
export function overview(state, mode, now, known, entries, compare) {
  const plan = state.plans[mode],
    actual = state.completed.filter(Boolean).length
  const expected = plan.filter((p) => p.s + p.d <= now).length
  $('count').textContent = known ? actual + ' de 7' : 'Sin datos'
  $('expected').textContent =
    (compare
      ? expected +
        ' previstos (realista) · ' +
        state.plans.optimista.filter((p) => p.s + p.d <= now).length +
        ' (optimista)'
      : expected + ' previstos a día de hoy') +
    (known && actual !== expected
      ? ' · diferencia: ' + (actual - expected)
      : '')
  for (const [scenario, id] of [
    ['pesimista', 'late'],
    ['optimista', 'early'],
  ]) {
    const end = delivery(state.plans[scenario])
    $(id).textContent = format(end)
    $(id + 'Delta').textContent =
      Math.max(0, Math.ceil(end - now)) + ' meses restantes'
  }
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
      el(
        'p',
        'Previsión ' +
          scenarioNames[mode] +
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
        (compare ? 'Realista: ' : '') +
          format(p.s) +
          ' – ' +
          format(p.s + p.d) +
          ' · ' +
          p.d +
          ' meses',
      ),
    )
    if (compare) {
      const alt = state.plans.optimista[i]
      body.append(
        el(
          'small',
          'Optimista: ' + format(alt.s) + ' – ' + format(alt.s + alt.d),
        ),
      )
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
    b.append(icon(i), el('strong', descriptions[i][1]))
    if (state.completed[i]) b.append(el('small', 'Hito confirmado'))
    b.onclick = () => detail(i)
    journey.append(b)
  })
  return detail
}
