import { delivery, format, phases, scenarioNames } from './schedule.js'
import { descriptions, guides, icon, day } from './phases.js'
import { element as el } from './chart.js'
const $ = (id) => document.getElementById(id)
function list(title, items, cls) {
  const box = el('section', '', 'phaseGuide ' + cls),
    ul = el('ul')
  for (const item of items) ul.append(el('li', item))
  box.append(el('h3', title), ul)
  return box
}
export function overview(state, mode, now, known, entries, photos) {
  const plan = state.plans[mode],
    actual = state.completed.filter(Boolean).length
  $('count').textContent = known ? actual + ' de 7' : 'Sin datos'
  // Una marca por fase, rellena cuando su hito está confirmado.
  $('countBar').replaceChildren(
    ...state.completed.map((done) => el('i', '', done && known ? 'on' : '')),
  )
  for (const [scenario, id] of [
    ['pesimista', 'late'],
    ['optimista', 'early'],
  ]) {
    const end = delivery(state.plans[scenario])
    $(id).textContent = format(end)
    $(id + 'Delta').textContent =
      Math.max(0, Math.ceil(end - now)) + ' meses restantes'
  }
  function detail(i) {
    const p = plan[i],
      box = $('phaseBody')
    box.replaceChildren(
      icon(i),
      el('small', descriptions[i][0]),
      el('h2', phases[i][1]),
      el('p', descriptions[i][2], 'phaseLead'),
      el(
        'p',
        (state.completed[i]
          ? 'Periodo confirmado: '
          : 'Previsión ' + scenarioNames[mode] + ': ') +
          format(p.s) +
          ' – ' +
          format(p.s + p.d) +
          ' · ' +
          p.d +
          ' meses.',
        'phaseWhen',
      ),
      list('Qué se suele hacer', guides[i].work, 'work'),
      list('Qué puede acelerarla', guides[i].faster, 'faster'),
      list('Qué puede retrasarla', guides[i].slower, 'slower'),
      el(
        'p',
        (i
          ? 'Empieza cuando avanza la fase de ' +
            descriptions[i - 1][1].toLowerCase() +
            ', y puede solaparse con ella. '
          : 'Es la primera fase de la obra. ') +
          (i < 6
            ? 'Después viene: ' + phases[i + 1][1].toLowerCase() + '.'
            : 'Es el último paso antes de recibir las llaves.'),
        'phaseNote',
      ),
    )
    // Enlace al álbum filtrado por esta fase, si tiene fotos.
    const shots = photos?.phaseCount(i) ?? 0
    if (shots) {
      const go = el(
        'button',
        'Ver las fotos de esta fase (' + shots + ')',
        'phasePhotos',
      )
      go.type = 'button'
      go.onclick = () => {
        $('phaseDialog').close()
        photos.showPhase(i)
      }
      box.querySelector('.phaseWhen').after(go)
    }
    const notes = entries.filter((r) => r.phase === p.id)
    if (notes.length) {
      box.append(el('h3', 'Observaciones de obra'))
      for (const row of notes)
        box.append(
          el('p', day(row.observed) + ' · ' + row.title + ' — ' + row.body),
        )
    }
    box.append(
      el(
        'small',
        'Tareas habituales en una obra de este tipo. El orden exacto y los detalles dependen del proyecto.',
        'phaseDisclaimer',
      ),
    )
    $('phaseDialog').showModal()
    // showModal enfoca «Cerrar», al final: volver al principio de la explicación.
    $('phaseDialog').scrollTop = 0
  }
  return detail
}
