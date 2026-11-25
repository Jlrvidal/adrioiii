import { element as el } from './chart.js'
import { day } from './phases.js'
import { optimize, addPhoto, photoSource } from './photos.js'

const $ = (id) => document.getElementById(id)
export const madridDay = () =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(
    new Date(),
  )
const key = (row) => row.taken + '/' + row.slot + '.jpg'
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
    busy = false
  let retry,
    coverKey = '',
    shown = ''
  const sources = new Map()
  async function source(row) {
    const id = key(row)
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
        : photoSource(db, id)
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
    if (!daily.length)
      frame.append(
        el(
          'p',
          available
            ? 'El álbum empieza con la primera foto de obra.'
            : 'El álbum está temporalmente fuera de servicio.',
          'empty',
        ),
      )
    for (const row of daily) {
      const figure = el('figure'),
        button = el('button'),
        img = el('img')
      img.alt = 'Foto ' + row.slot + ' del ' + day(date)
      button.title = 'Ampliar ' + img.alt.toLowerCase()
      button.onclick = () => {
        const big = img.cloneNode()
        $('photoBody').replaceChildren(big, el('p', img.alt))
        $('photoDialog').showModal()
      }
      button.append(img)
      figure.append(button, el('figcaption', 'Foto ' + row.slot))
      frame.append(figure)
      source(row).then(
        (src) => {
          img.src = src
        },
        () => button.replaceWith(el('span', 'No se pudo cargar la foto.')),
      )
    }
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
        ? 'Álbum de hoy completo · 3 de 3'
        : count + ' de 3 fotos hoy · hora de Madrid'
      : 'Subida de fotos temporalmente fuera de servicio.'
    $('sharePhoto').disabled = busy || !available || count >= 3
    $('addDaily').disabled = $('sharePhoto').disabled
    $('chartAlbum').disabled = !days.length
    const signature = JSON.stringify([rows, available])
    if (shown === signature) return
    shown = signature
    $('albumDate').replaceChildren()
    for (const date of days) $('albumDate').add(new Option(day(date), date))
    $('albumDate').disabled = !days.length
    if (!days.length) $('albumDate').add(new Option('Sin fotos', ''))
    choose(days.includes(selected) ? selected : days[0] || '')
    const latest = rows.filter((r) => r.taken === days[0]).at(-1)
    const id = latest && key(latest)
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
          coverKey = ''
          shown = ''
        },
      )
    } else if (!id && coverKey) {
      coverKey = ''
      $('coverFig').classList.remove('withPhoto')
      $('coverPhoto').src = './assets/section.svg'
      $('coverPhoto').alt = 'Sección esquemática del edificio'
      $('coverCaption').textContent = 'Sección orientativa · sin escala'
      $('coverLink').removeAttribute('href')
      $('coverLink').onclick = null
    }
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
  $('sharePhoto').onchange = () => {
    retry = null
    $('uploadMessage').textContent = ''
  }
  $('photoUpload').onsubmit = async (e) => {
    e.preventDefault()
    const file = $('sharePhoto').files[0]
    if (busy || !file || !available) return
    busy = true
    draw()
    try {
      retry ??= { id: crypto.randomUUID() }
      $('uploadMessage').textContent = 'Preparando la foto…'
      retry.blob ??= await optimize(file)
      $('uploadMessage').textContent = 'Publicando…'
      const path = await addPhoto(db, retry.blob, retry.id)
      selected = path.slice(0, 10)
      retry = null
      $('photoUpload').reset()
      $('uploadMessage').textContent =
        'Foto publicada en el álbum del ' + day(selected) + '.'
    } catch (err) {
      $('uploadMessage').textContent = err.message
    } finally {
      busy = false
      await refresh()
    }
  }
  window.addEventListener('adrio-photos-changed', refresh)
  return { refresh, openMonth, dates }
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
      const { error } = await db
        .from('adrio_comments')
        .insert({
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
