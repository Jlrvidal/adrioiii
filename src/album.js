import { element as el } from './chart.js'
import { day } from './phases.js'
import { optimize, addPhoto, photoSource } from './photos.js'

const $ = (id) => document.getElementById(id)
export const madridDay = () =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(
    new Date(),
  )
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
export function album(db, changed) {
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
      if (sources.size > 12) sources.delete(sources.keys().next().value)
      pending.catch(() => sources.delete(id))
    }
    return sources.get(id)
  }
  const dates = () => [...new Set(rows.map((r) => r.taken))]
  function choose(date, scroll = false) {
    selected = date
    $('albumDate').value = date
    const daily = rows.filter((r) => r.taken === date)
    const frame = $('dailyImages')
    frame.replaceChildren()
    // El mosaico cambia según haya 1, 2 o 3 fotos ese día.
    frame.dataset.count = daily.length
    if (!daily.length)
      frame.append(
        el(
          'p',
          available
            ? 'Todavía no hay fotos en el álbum. Puedes enviar la primera aquí debajo.'
            : 'El álbum no está disponible en este momento.',
          'empty',
        ),
      )
    daily.forEach((row, n) => {
      const figure = el('figure'),
        button = el('button', '', 'photoOpen'),
        img = el('img')
      img.alt = 'Foto ' + (n + 1) + ' de ' + daily.length + ' del ' + day(date)
      button.type = 'button'
      button.title = 'Ampliar la foto'
      button.onclick = () => {
        const big = img.cloneNode()
        $('photoBody').replaceChildren(big, el('p', img.alt))
        $('photoDialog').showModal()
      }
      button.append(img)
      figure.append(button)
      if (admin) {
        const remove = el('button', 'Eliminar', 'removePhoto')
        remove.type = 'button'
        remove.setAttribute('aria-label', 'Eliminar ' + img.alt.toLowerCase())
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
        figure.append(remove)
      }
      frame.append(figure)
      source(row).then(
        (src) => {
          img.src = src
        },
        () =>
          button.replaceWith(
            el('span', 'No se ha podido cargar esta foto.', 'photoMissing'),
          ),
      )
    })
    const days = dates(),
      idx = days.indexOf(date)
    $('olderDay').disabled = idx < 0 || idx === days.length - 1
    $('newerDay').disabled = idx <= 0
    if (scroll) $('album').scrollIntoView({ block: 'start' })
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
    $('albumDate').replaceChildren()
    for (const date of days) $('albumDate').add(new Option(day(date), date))
    $('albumDate').disabled = !days.length
    if (!days.length) $('albumDate').add(new Option('Sin fotos', ''))
    choose(days.includes(selected) ? selected : days[0] || '')
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
    const days = dates().filter((d) => !month || d.startsWith(month))
    if (days.length === 1) {
      choose(days[0], true)
      return
    }
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
  $('albumDate').onchange = (e) => choose(e.target.value)
  $('olderDay').onclick = () => choose(dates()[dates().indexOf(selected) + 1])
  $('newerDay').onclick = () => choose(dates()[dates().indexOf(selected) - 1])
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
      if (path !== 'pendiente') selected = path.slice(0, 10)
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
