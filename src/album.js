import { element as el } from './chart.js'
import { day } from './phases.js'
import { defaults, format, offsetOf, phases } from './schedule.js'
import { optimize, addPhoto, photoSource } from './photos.js'

const $ = (id) => document.getElementById(id)
export const madridDay = () =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(
    new Date(),
  )
const monthName = (ym) =>
  new Intl.DateTimeFormat('es-ES', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(ym + '-01T12:00:00Z'))
const capital = (text) => text[0].toUpperCase() + text.slice(1)
const key = (row) => row.taken + '/' + row.slot + '.jpg'
const cacheKey = (row) =>
  key(row) + ':' + (row.photo_version ?? row.legacy ?? '')
export async function pages(query) {
  const items = []
  for (let start = 0; ; start += 100) {
    const { data, error } = await query().range(start, start + 99)
    if (error || !Array.isArray(data)) throw Error('Consulta no disponible')
    items.push(...data)
    if (data.length < 100) return items
  }
}
export function album(db, changed, schedule) {
  let mode = 'day',
    month = '',
    phase = 0
  let rows = [],
    selected = '',
    available = false,
    version = 0,
    busy = false,
    admin = false
  let retry,
    coverKey = '',
    shown = ''
  const sources = new Map()
  async function source(row) {
    const id = cacheKey(row)
    if (!sources.has(id)) {
      const pending = row.legacy
        ? db.storage
            .from('adrio-diary')
            .download(row.legacy)
            .then(async ({ data, error }) => {
              if (error) throw error
              return await new Promise((resolve, reject) => {
                const reader = new FileReader()
                reader.onload = () => resolve(reader.result)
                reader.onerror = reject
                reader.readAsDataURL(new Blob([data], { type: 'image/webp' }))
              })
            })
        : photoSource(db, key(row))
      sources.set(id, pending)
      if (sources.size > 36) sources.delete(sources.keys().next().value)
      pending.catch(() => sources.delete(id))
    }
    return sources.get(id)
  }
  const dates = () => [...new Set(rows.map((r) => r.taken))]
  const months = () => [...new Set(rows.map((r) => r.taken.slice(0, 7)))]
  // Las fotos no guardan la fase: se asignan por fecha según el calendario
  // realista publicado (o las fechas confirmadas, que coinciden en ambos).
  function phaseRange(i) {
    const p = (schedule()?.plans ?? defaults().plans).pesimista[i]
    return [p.s, p.s + p.d]
  }
  function inPhase(row, i) {
    const n = offsetOf(row.taken.slice(0, 7)),
      [from, to] = phaseRange(i)
    return n >= from && n < to
  }
  const views = {
    day: {
      label: 'Día',
      id: 'viewDay',
      older: 'Día anterior con fotos',
      newer: 'Día siguiente con fotos',
      options: () => dates().map((d) => [d, day(d)]),
      value: () => selected,
      set: (v) => (selected = v),
      rows: () => rows.filter((r) => r.taken === selected),
      step: 1,
    },
    month: {
      label: 'Mes',
      id: 'viewMonth',
      older: 'Mes anterior con fotos',
      newer: 'Mes siguiente con fotos',
      options: () =>
        months().map((m) => [
          m,
          capital(monthName(m)) +
            ' (' +
            rows.filter((r) => r.taken.startsWith(m)).length +
            ')',
        ]),
      value: () => month,
      set: (v) => (month = v),
      rows: () => rows.filter((r) => r.taken.startsWith(month)),
      step: 1,
    },
    phase: {
      label: 'Fase',
      id: 'viewPhase',
      older: 'Fase anterior',
      newer: 'Fase siguiente',
      options: () =>
        phases.map(([, name], i) => [
          String(i),
          name + ' (' + rows.filter((r) => inPhase(r, i)).length + ')',
        ]),
      value: () => String(phase),
      set: (v) => (phase = Number(v)),
      rows: () => rows.filter((r) => inPhase(r, phase)),
      step: -1,
    },
  }
  function figure(row, alt, list) {
    const box = el('figure'),
      button = el('button', '', 'photoOpen'),
      img = el('img')
    img.alt = alt
    button.type = 'button'
    button.title = 'Ampliar la foto'
    button.onclick = () => {
      const big = img.cloneNode()
      $('photoBody').replaceChildren(big, el('p', img.alt))
      $('photoDialog').showModal()
    }
    button.append(img)
    box.append(button)
    if (admin) {
      const remove = el('button', 'Eliminar', 'removePhoto')
      remove.type = 'button'
      remove.setAttribute('aria-label', 'Eliminar ' + alt.toLowerCase())
      remove.onclick = async () => {
        if (!admin || !confirm('¿Eliminar esta foto del álbum?')) return
        remove.disabled = true
        const { error } = await db.rpc('adrio_remove_photo', {
          taken_on: row.taken,
          position_in_day: row.slot,
        })
        say(error ? error.message : 'Foto eliminada.', error ? 'error' : 'ok')
        if (error) remove.disabled = false
        else {
          sources.delete(cacheKey(row))
          await refresh()
          window.dispatchEvent(new Event('adrio-photo-removed'))
        }
      }
      box.append(remove)
    }
    const load = () =>
      source(row).then(
        (src) => {
          img.src = src
        },
        () =>
          button.replaceWith(
            el('span', 'No se ha podido cargar esta foto.', 'photoMissing'),
          ),
      )
    // En las vistas por mes o fase solo se descargan las fotos que se ven.
    if (list && lazy) {
      box.load = load
      lazy.observe(box)
    } else load()
    return box
  }
  const lazy =
    'IntersectionObserver' in window
      ? new IntersectionObserver(
          (entries) => {
            for (const entry of entries)
              if (entry.isIntersecting) {
                lazy.unobserve(entry.target)
                entry.target.load()
              }
          },
          { rootMargin: '300px' },
        )
      : null
  function show(scroll = false) {
    const view = views[mode],
      options = view.options(),
      select = $('albumDate')
    for (const [name, v] of Object.entries(views))
      $(v.id).setAttribute('aria-pressed', String(name === mode))
    if (!options.some(([v]) => v === view.value()))
      view.set(options[0]?.[0] ?? '')
    select.replaceChildren()
    for (const [v, text] of options) select.add(new Option(text, v))
    if (!options.length) select.add(new Option('Sin fotos', ''))
    select.disabled = !options.length
    select.value = view.value()
    select.setAttribute('aria-label', view.label + ' del álbum')
    const idx = options.findIndex(([v]) => v === view.value()),
      older = options[idx + view.step],
      newer = options[idx - view.step]
    $('olderDay').disabled = !older
    $('newerDay').disabled = !newer
    $('olderDay').setAttribute('aria-label', view.older)
    $('newerDay').setAttribute('aria-label', view.newer)
    const list = view.rows(),
      frame = $('dailyImages')
    lazy?.disconnect()
    frame.replaceChildren()
    frame.dataset.count = mode === 'day' ? list.length : 'grid'
    $('albumNote').textContent = ''
    if (mode === 'phase') {
      const [from, to] = phaseRange(phase)
      $('albumNote').textContent =
        'Fotos tomadas durante esta fase según el calendario realista (' +
        format(from) +
        ' – ' +
        format(to) +
        ').'
    }
    if (!list.length) {
      frame.append(
        el(
          'p',
          !available
            ? 'El álbum no está disponible en este momento.'
            : !rows.length
              ? 'Todavía no hay fotos en el álbum. Puedes enviar la primera aquí debajo.'
              : 'Todavía no hay fotos de esta fase.',
          'empty',
        ),
      )
    } else if (mode === 'day') {
      // El mosaico cambia según haya 1, 2 o 3 fotos ese día.
      list.forEach((row, n) =>
        frame.append(
          figure(
            row,
            'Foto ' + (n + 1) + ' de ' + list.length + ' del ' + day(row.taken),
          ),
        ),
      )
    } else {
      // Por mes se agrupa por días; por fase, por meses.
      const groupOf = (row) =>
        mode === 'month' ? row.taken : row.taken.slice(0, 7)
      for (const group of [...new Set(list.map(groupOf))]) {
        const items = list.filter((r) => groupOf(r) === group),
          section = el('section', '', 'photoGroup'),
          grid = el('div', '', 'photoGrid')
        const heading = el(
          'h4',
          mode === 'month' ? day(group) : capital(monthName(group)),
        )
        heading.append(
          el('small', items.length + (items.length === 1 ? ' foto' : ' fotos')),
        )
        section.append(heading, grid)
        for (const row of items)
          grid.append(figure(row, 'Foto del ' + day(row.taken), true))
        frame.append(section)
      }
    }
    if (scroll) $('album').scrollIntoView({ block: 'start' })
  }
  function setMode(next, value, scroll = false) {
    if (next === 'month')
      month = value ?? (selected || dates()[0] || '').slice(0, 7)
    if (next === 'phase')
      phase =
        value ??
        Math.max(
          0,
          phases.findIndex((_, i) =>
            inPhase({ taken: selected || dates()[0] || madridDay() }, i),
          ),
        )
    if (next === 'day' && value) selected = value
    mode = next
    show(scroll)
  }
  function choose(date, scroll = false) {
    setMode('day', date, scroll)
  }
  function draw() {
    const days = dates(),
      today = madridDay(),
      count = rows.filter((r) => r.taken === today).length
    $('photoQuota').textContent = available
      ? count === 3
        ? 'El álbum de hoy ya está completo (3 de 3). Podrás enviar otra foto mañana.'
        : count + ' de 3 fotos publicadas hoy.'
      : 'El envío de fotos no está disponible en este momento.'
    const closed = busy || !available || count >= 3
    $('sharePhoto').disabled = closed
    $('photoUpload').classList.toggle('closed', !available || count >= 3)
    $('addDaily').disabled = closed || !$('sharePhoto').files.length
    $('addDaily').textContent = admin ? 'Publicar foto' : 'Enviar para revisión'
    $('shareTitle').textContent = admin
      ? 'Publica una foto de la obra'
      : 'Envía una foto de la obra'
    $('shareHelp').textContent = admin
      ? 'Como administrador, tus fotos se publican al momento, sin revisión.'
      : 'Cualquiera puede enviar fotos. El administrador las revisa antes de que aparezcan en el álbum.'
    $('shareSteps').hidden = admin
    $('chartAlbum').disabled = !days.length
    const signature = JSON.stringify([rows, available, admin])
    if (shown === signature) return
    shown = signature
    if (!days.includes(selected)) selected = days[0] || ''
    show()
    const latest = rows.filter((r) => r.taken === days[0]).at(-1)
    const id = latest && cacheKey(latest)
    if (coverKey !== id && (coverKey || id)) {
      $('coverFig').classList.remove('withPhoto')
      $('coverPhoto').src = './assets/section.svg'
      $('coverPhoto').alt = 'Sección esquemática del edificio'
      $('coverCaption').textContent = 'Sección orientativa · sin escala'
      $('coverLink').removeAttribute('href')
      $('coverLink').onclick = null
    }
    if (id && coverKey !== id) {
      coverKey = id
      source(latest).then(
        (src) => {
          if (coverKey !== id) return
          $('coverPhoto').src = src
          $('coverPhoto').alt = 'Obra de Adrio III el ' + day(latest.taken)
          $('coverFig').classList.add('withPhoto')
          $('coverCaption').textContent = 'Desde la obra · ' + day(latest.taken)
          $('coverLink').href = '#album'
          $('coverLink').onclick = () => choose(latest.taken)
        },
        () => {
          if (coverKey === id) {
            coverKey = ''
            shown = ''
          }
        },
      )
    } else if (!id) coverKey = ''
    changed()
  }
  async function refresh() {
    const seq = ++version
    try {
      if (!db) throw Error()
      const next = await pages(() =>
        db
          .rpc('adrio_photo_index')
          .order('taken', { ascending: false })
          .order('slot'),
      )
      if (seq !== version) return
      rows = next
      available = true
    } catch {
      if (seq !== version) return
      available = false
    }
    draw()
  }
  function openMonth(month) {
    // Las marcas mensuales del calendario abren el álbum de ese mes.
    if (month) {
      setMode('month', month, true)
      return
    }
    const days = dates()
    const list = $('monthDays')
    list.replaceChildren()
    for (const d of days) {
      const b = el('button', day(d))
      b.onclick = () => {
        $('albumPicker').close()
        choose(d, true)
      }
      list.append(b)
    }
    if (days.length) $('albumPicker').showModal()
  }
  function move(direction) {
    const view = views[mode],
      options = view.options(),
      idx = options.findIndex(([v]) => v === view.value()),
      next = options[idx + direction * view.step]
    if (next) {
      view.set(next[0])
      show()
    }
  }
  $('albumDate').onchange = (e) => {
    views[mode].set(e.target.value)
    show()
  }
  $('olderDay').onclick = () => move(1)
  $('newerDay').onclick = () => move(-1)
  $('viewDay').onclick = () => setMode('day')
  $('viewMonth').onclick = () => setMode('month')
  $('viewPhase').onclick = () => setMode('phase')
  $('chartAlbum').onclick = () => openMonth()
  function say(text, kind = '') {
    $('uploadMessage').textContent = text
    $('uploadMessage').className = kind
  }
  let previewURL = ''
  // Muestra la foto elegida dentro de la zona de selección antes de enviarla.
  function showChosen(file) {
    if (previewURL) URL.revokeObjectURL(previewURL)
    previewURL = file ? URL.createObjectURL(file) : ''
    $('sharePreview').src = previewURL
    $('shareName').textContent = file ? file.name : ''
    $('dropEmpty').hidden = Boolean(file)
    $('dropChosen').hidden = !file
    draw()
  }
  $('sharePreview').onerror = () => {
    if ($('sharePreview').getAttribute('src'))
      $('sharePreview').removeAttribute('src')
  }
  $('sharePhoto').onchange = () => {
    retry = null
    say('')
    showChosen($('sharePhoto').files[0])
  }
  const zone = $('dropzone')
  zone.ondragenter = zone.ondragover = (e) => {
    if ($('sharePhoto').disabled) return
    e.preventDefault()
    zone.classList.add('over')
  }
  zone.ondragleave = () => zone.classList.remove('over')
  zone.ondrop = (e) => {
    zone.classList.remove('over')
    if ($('sharePhoto').disabled || !e.dataTransfer?.files.length) return
    e.preventDefault()
    $('sharePhoto').files = e.dataTransfer.files
    $('sharePhoto').dispatchEvent(new Event('change'))
  }
  $('photoUpload').onsubmit = async (e) => {
    e.preventDefault()
    const file = $('sharePhoto').files[0]
    if (busy || !file || !available) return
    busy = true
    draw()
    try {
      retry ??= { id: crypto.randomUUID() }
      say('Preparando la foto…')
      retry.blob ??= await optimize(file)
      say('Enviando…')
      const path = await addPhoto(db, retry.blob, retry.id)
      if (path !== 'pendiente') {
        selected = path.slice(0, 10)
        mode = 'day'
      }
      retry = null
      $('photoUpload').reset()
      showChosen(null)
      if (path === 'pendiente')
        say(
          'Foto enviada. Se publicará cuando la revise el administrador.',
          'ok',
        )
      else say('Foto publicada en el álbum del ' + day(selected) + '.', 'ok')
    } catch (err) {
      say(err.message, 'error')
    } finally {
      busy = false
      await refresh()
    }
  }
  window.addEventListener('adrio-photos-changed', refresh)
  return {
    refresh,
    openMonth,
    dates,
    phaseCount: (i) => rows.filter((r) => inPhase(r, i)).length,
    showPhase: (i) => setMode('phase', i, true),
    setAdmin(value) {
      if (admin === value) return
      admin = value
      draw()
    },
  }
}

export function comments(db) {
  let items = [],
    admin = false,
    available = false,
    busy = false
  function draw() {
    $('commentForm').hidden = !admin || !available
    $('commentsList').replaceChildren()
    for (const item of items) {
      const row = el('div', '', 'siteComment')
      row.append(el('time', day(item.posted_on)), el('p', item.body))
      if (admin) {
        const b = el('button', 'Eliminar')
        b.onclick = async () => {
          if (!confirm('¿Eliminar este comentario del diario?')) return
          b.disabled = true
          const { error } = await db
            .from('adrio_comments')
            .delete()
            .eq('id', item.id)
            .select('id')
            .single()
          if (error)
            $('commentMessage').textContent =
              'No se pudo eliminar el comentario.'
          await refresh()
        }
        row.append(b)
      }
      $('commentsList').append(row)
    }
    if (!items.length)
      $('commentsList').textContent = available
        ? 'Todavía no hay comentarios.'
        : 'Los comentarios están temporalmente fuera de servicio.'
  }
  async function refresh() {
    try {
      items = await pages(() =>
        db
          .from('adrio_comments')
          .select('id,posted_on,body')
          .order('posted_on', { ascending: false })
          .order('created_at', { ascending: false })
          .order('id'),
      )
      available = true
    } catch {
      available = false
    }
    draw()
  }
  $('commentDate').value = madridDay()
  $('commentForm').onsubmit = async (e) => {
    e.preventDefault()
    if (!admin || busy) return
    busy = true
    $('postComment').disabled = true
    try {
      const { error } = await db.from('adrio_comments').insert({
        posted_on: $('commentDate').value,
        body: $('commentText').value.trim(),
      })
      if (error) throw error
      $('commentText').value = ''
      $('commentMessage').textContent = 'Comentario publicado.'
      await refresh()
    } catch {
      $('commentMessage').textContent = 'No se pudo publicar el comentario.'
    } finally {
      busy = false
      $('postComment').disabled = false
    }
  }
  return {
    refresh,
    setAdmin(v) {
      if (admin !== v) {
        admin = v
        draw()
      }
    },
  }
}
