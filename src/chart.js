import {
  phases,
  edit,
  delivery,
  format,
  monthISO,
  offsetOf,
  defaults,
} from './schedule.js'
import { icon, descriptions, yearParts, yearColor } from './phases.js'
export function element(tag, text = '', cls = '') {
  const el = document.createElement(tag)
  el.textContent = text
  el.className = cls
  return el
}
export function renderChart(root, state, mode, now, canEdit, actions) {
  const plan = state.plans[mode],
    original = defaults().plans
  const all = [
    ...state.plans.optimista,
    ...state.plans.pesimista,
    ...original.optimista,
    ...original.pesimista,
  ]
  const photoMonths = [
    ...new Set((actions.photoDays ?? []).map((d) => d.slice(0, 7))),
  ]
  const first = Math.floor(
      Math.min(-1, now, ...photoMonths.map(offsetOf), ...all.map((p) => p.s)),
    ),
    last = Math.ceil(Math.max(now, delivery(all)) + 2)
  const span = last - first,
    pct = (n) => (100 * n) / span + '%'
  root.replaceChildren()
  root.classList.toggle('dual', Boolean(actions.compare))
  root.style.minWidth = 'calc(var(--label) + ' + span * 32 + 'px)'
  root.style.setProperty('--step', pct(1))
  const head = element('div', '', 'row'),
    axis = element('div', '', 'gridhead')
  const years = element('div', '', 'years'),
    months = element('div', '', 'months'),
    overlay = element('div', '', 'overlay')
  head.append(element('div', 'Fases de obra', 'caption'), axis)
  axis.append(years, months)
  root.append(head)
  for (let n = first; n < last; ) {
    const [year, month] = monthISO(n).split('-').map(Number),
      width = Math.min(13 - month, last - n)
    const y = element('span', String(year))
    y.style.width = pct(width)
    y.style.background = yearColor(year)
    y.dataset.year = year
    years.append(y)
    const line = element('span', '', 'yearline')
    line.style.left = pct(n - first)
    line.style.width = pct(width)
    line.style.background = yearColor(year)
    overlay.append(line)
    n += width
  }
  for (let n = first; n < last; n++) {
    const m = element('span', format(n).split(' ')[0])
    m.style.width = pct(1)
    if (
      monthISO(n).endsWith('-01') ||
      monthISO(n).endsWith('-04') ||
      monthISO(n).endsWith('-07') ||
      monthISO(n).endsWith('-10')
    ) {
      m.title =
        'Trimestre ' + (1 + Math.floor((Number(monthISO(n).slice(5)) - 1) / 3))
      m.classList.add('qStart')
    }
    months.append(m)
  }
  if (photoMonths.length) {
    const row = element('div', '', 'row')
    const track = element('div', '', 'track albumTrack')
    row.append(element('div', 'Fotos de obra', 'caption'), track)
    for (const month of photoMonths) {
      const monthNumber = offsetOf(month)
      const button = element('button', '▣', 'albumMark')
      button.title = 'Ver fotos de ' + format(monthNumber)
      button.setAttribute('aria-label', button.title)
      button.style.left = pct(monthNumber - first)
      button.style.width = pct(1)
      button.onclick = () => actions.openMonth(month)
      track.append(button)
    }
    root.append(row)
  }
  const marker = element('div', '', 'todayline')
  marker.style.left = pct(now - first)
  marker.append(element('b', 'HOY'))
  overlay.append(marker)
  function segments(bar, p) {
    let pos = 0
    const stops = yearParts(p.s, p.d).flatMap(({ year, months }) => {
      const from = pos
      pos += months
      return [
        yearColor(year) + ' ' + (100 * from) / p.d + '%',
        yearColor(year) + ' ' + (100 * pos) / p.d + '%',
      ]
    })
    bar.style.backgroundImage = 'linear-gradient(90deg,' + stops.join(',') + ')'
  }
  const widgets = []
  function paint(list) {
    list.forEach((p, i) => {
      const { bar, info, label } = widgets[i],
        status = state.completed[i]
          ? 'Completada'
          : p.s + p.d <= now
            ? 'Fin previsto superado'
            : 'Prevista'
      segments(bar, p)
      bar.style.left = pct(p.s - first)
      bar.style.width = pct(p.d)
      bar.classList.toggle('over', !state.completed[i] && p.s + p.d <= now)
      info.textContent =
        format(p.s) + ' – ' + format(p.s + p.d) + ' · ' + status
      label.textContent =
        (actions.compare ? 'O · ' : '') +
        (state.completed[i] ? '✓ ' : '') +
        p.d +
        ' m'
      bar.title =
        phases[i][1] + ' · ' + info.textContent + ' · ' + p.d + ' meses'
    })
  }
  plan.forEach((p, i) => {
    const row = element('div', '', 'row'),
      caption = element('button', descriptions[i][1], 'caption'),
      info = element('small')
    caption.prepend(icon(i))
    caption.setAttribute('type', 'button')
    caption.onclick = () => actions.detail(i)
    const track = element('div', '', 'track'),
      bar = element('div', '', 'bar'),
      label = element('span')
    caption.append(info)
    row.append(caption, track)
    track.append(bar)
    if (actions.compare) {
      const p2 = state.plans.pesimista[i],
        second = element('div', 'P · ' + p2.d + ' m', 'secondBar')
      bar.classList.add('firstBar')
      segments(second, p2)
      second.style.left = pct(p2.s - first)
      second.style.width = pct(p2.d)
      track.append(second)
    }
    if (actions.baseline) {
      for (const scenario of actions.compare
        ? ['optimista', 'pesimista']
        : [mode]) {
        const orig = original[scenario][i],
          ref = element('span', '', 'baseBar ' + scenario)
        ref.title =
          'Inicial · ' +
          scenario +
          ' · ' +
          format(orig.s) +
          ' – ' +
          format(orig.s + orig.d)
        ref.style.left = pct(orig.s - first)
        ref.style.width = pct(orig.d)
        track.append(ref)
      }
    }
    root.append(row)
    bar.classList.toggle('done', state.completed[i])
    if (canEdit && !state.completed[i]) {
      bar.classList.add('editable')
      const left = element('span', '‹', 'handle'),
        right = element('span', '›', 'handle')
      bar.append(left, label, right)
      let drag
      bar.onpointerdown = (e) => {
        if (drag || e.button !== 0 || !e.isPrimary) return
        e.preventDefault()
        bar.setPointerCapture(e.pointerId)
        actions.lock(true)
        drag = {
          pointer: e.pointerId,
          x: e.clientX,
          width: track.clientWidth,
          side:
            e.target === left ? 'left' : e.target === right ? 'right' : 'move',
        }
      }
      bar.onpointermove = (e) => {
        if (drag?.pointer !== e.pointerId) return
        const delta = Math.round(((e.clientX - drag.x) * span) / drag.width)
        const s = p.s + (drag.side === 'right' ? 0 : delta),
          d =
            p.d +
            (drag.side === 'move' ? 0 : drag.side === 'left' ? -delta : delta)
        try {
          drag.next = delta ? edit(state, mode, i, s, d) : null
          paint(drag.next?.plans[mode] ?? plan)
          actions.warn('')
        } catch (err) {
          drag.next = null
          paint(plan)
          actions.warn(err.message)
        }
      }
      function finish(e, commit) {
        if (drag?.pointer !== e.pointerId) return
        const next = drag.next
        drag = null
        actions.lock(false)
        if (commit && next) actions.commit(next)
        else paint(plan)
      }
      bar.onpointerup = (e) => finish(e, true)
      bar.onlostpointercapture = bar.onpointercancel = (e) => finish(e, false)
    } else {
      bar.append(label)
      bar.onclick = () => actions.detail(i)
    }
    widgets.push({ bar, info, label })
  })
  paint(plan)
  root.append(overlay)
  const key = document.getElementById('yearKey')
  key.replaceChildren()
  for (const y of years.children) {
    const item = element('span', y.textContent)
    item.style.setProperty('--swatch', yearColor(+y.dataset.year))
    key.append(item)
  }
}
