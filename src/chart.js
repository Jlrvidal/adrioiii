import { phases, edit, delivery, format, monthISO } from './schedule.js'
export function element(tag, text = '', cls = '') {
  const el = document.createElement(tag)
  el.textContent = text
  el.className = cls
  return el
}
export function renderChart(root, state, mode, now, canEdit, actions) {
  const plan = state.plans[mode],
    first = Math.floor(Math.min(-1, now, ...plan.map((p) => p.s))),
    last = Math.ceil(Math.max(now + 2, delivery(plan) + 2))
  const span = last - first,
    pct = (n) => (100 * n) / span + '%'
  root.replaceChildren()
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
    y.style.background = year % 2 ? 'var(--tint)' : 'var(--bg)'
    years.append(y)
    const line = element('span', '', 'yearline')
    line.style.left = pct(n - first)
    overlay.append(line)
    n += width
  }
  for (let n = first; n < last; n++) {
    const m = element('span', format(n).split(' ')[0])
    m.style.width = pct(1)
    months.append(m)
  }
  const marker = element('div', '', 'todayline')
  marker.style.left = pct(now - first)
  marker.append(element('b', 'Hoy'))
  overlay.append(marker)
  const widgets = []
  function paint(list) {
    list.forEach((p, i) => {
      const { bar, info, label } = widgets[i],
        status = state.completed[i]
          ? 'Completada'
          : p.s + p.d <= now
            ? 'Fin previsto superado'
            : 'Prevista'
      bar.style.left = pct(p.s - first)
      bar.style.width = pct(p.d)
      bar.classList.toggle('over', !state.completed[i] && p.s + p.d <= now)
      info.textContent =
        format(p.s) + ' – ' + format(p.s + p.d) + ' · ' + status
      label.textContent = (state.completed[i] ? '✓ ' : '') + p.d + ' m'
      bar.title =
        phases[i][1] + ' · ' + info.textContent + ' · ' + p.d + ' meses'
    })
  }
  plan.forEach((p, i) => {
    const row = element('div', '', 'row'),
      caption = element('div', phases[i][1], 'caption'),
      info = element('small')
    const track = element('div', '', 'track'),
      bar = element('div', '', 'bar'),
      label = element('span')
    caption.append(info)
    row.append(caption, track)
    track.append(bar)
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
    } else bar.append(label)
    widgets.push({ bar, info, label })
  })
  paint(plan)
  root.append(overlay)
}
