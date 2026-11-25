import { optimize, addPhoto, photoSource, dailyPath } from './photos.js'
import { element as el } from './chart.js'
import { phases } from './schedule.js'
import { day } from './phases.js'
const $ = (id) => document.getElementById(id),
  bucket = 'adrio-diary'
const filename = /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}\.webp$/
async function result(query) {
  const { data, error } = await query
  if (error) throw error
  return data
}
export function diary(api, changed) {
  let entryId,
    rows = [],
    available = false,
    admin = false,
    editing = null,
    prepared = null,
    request = 0,
    editorEpoch = 0,
    loadFailed = false
  const observers = new Set()
  const selected = new Set(),
    photos = new Map()
  const db = api?.db,
    storage = db?.storage.from(bucket)
  const option = (v, t) => {
    const o = el('option', t)
    o.value = v
    return o
  }
  $('filter').append(option('', 'Todas las fases'))
  for (const [id, title] of phases) {
    $('filter').append(option(id, title))
    $('entryPhase').append(option(id, title))
  }
  async function photo(name) {
    if (dailyPath.test(name)) return photoSource(db, name)
    if (!filename.test(name)) throw Error()
    if (!photos.has(name)) {
      photos.set(
        name,
        result(storage.download(name))
          .then((blob) =>
            URL.createObjectURL(new Blob([blob], { type: 'image/webp' })),
          )
          .catch((e) => {
            photos.delete(name)
            throw e
          }),
      )
    }
    return await photos.get(name)
  }
  async function populateImage(container, row) {
    try {
      const src = await photo(row.photo)
      const img = el('img')
      img.alt = row.caption || row.title
      img.loading = 'lazy'
      img.src = src
      container.replaceChildren(img)
    } catch {
      container.textContent = 'Fotografía no disponible.'
    }
  }
  function button(t, fn) {
    const b = el('button', t)
    b.onclick = fn
    return b
  }
  function expand(list) {
    const box = $('photoBody')
    box.replaceChildren()
    for (const row of list) {
      const fig = el('figure'),
        frame = el('div')
      fig.append(
        frame,
        el(
          'figcaption',
          day(row.observed) + ' · ' + (row.caption || row.title),
        ),
      )
      box.append(fig)
      populateImage(frame, row)
    }
    $('photoDialog').showModal()
  }
  function draw() {
    for (const observer of observers) observer.disconnect()
    observers.clear()
    const box = $('entries')
    box.replaceChildren()
    $('manageEntries').replaceChildren()
    $('newEntry').hidden = !admin || !available
    const filtered = rows.filter(
      (r) => !$('filter').value || r.phase === $('filter').value,
    )
    for (const row of filtered) {
      const article = el('article', '', 'entry')
      article.id = 'observacion-' + row.id
      article.append(
        el(
          'small',
          day(row.observed) +
            ' · ' +
            (phases.find((p) => p[0] === row.phase)?.[1] || ''),
        ),
        el('h3', row.title),
        el('p', row.body),
      )
      if (row.photo) {
        const thumb = button('Ver fotografía', () => expand([row]))
        thumb.className = 'thumbnail'
        article.append(thumb)
        const observer = new IntersectionObserver(([e]) => {
          if (e.isIntersecting) {
            observer.disconnect()
            observers.delete(observer)
            populateImage(thumb, row)
          }
        })
        observers.add(observer)
        observer.observe(thumb)
        const l = el('label', ' Comparar foto'),
          c = el('input')
        c.type = 'checkbox'
        c.checked = selected.has(row.id)
        c.onchange = () => {
          if (c.checked && selected.size >= 2) {
            c.checked = false
            return
          }
          c.checked ? selected.add(row.id) : selected.delete(row.id)
          compare()
        }
        l.prepend(c)
        article.append(l, el('small', row.caption))
      }
      article.append(
        el('small', 'Publicada el ' + day(row.published_at)),
        button('Copiar enlace', async () => {
          const u = new URL(location.pathname, location.origin)
          u.hash = article.id
          try {
            await navigator.clipboard.writeText(u.href)
            $('notice').textContent = 'Enlace copiado.'
          } catch {
            $('notice').textContent = 'No se ha podido copiar el enlace.'
          }
        }),
      )
      box.append(article)
    }
    if (!filtered.length)
      box.append(
        el(
          'p',
          !available
            ? 'Las observaciones no están disponibles en este momento.'
            : $('filter').value
              ? 'Todavía no hay observaciones de esta fase.'
              : 'Todavía no hay observaciones publicadas.',
          'empty',
        ),
      )
    if (loadFailed && rows.length)
      box.prepend(
        el('small', 'Mostrando las últimas observaciones disponibles.'),
      )
    if (admin && available)
      for (const row of rows) {
        const tools = el('div', '', 'actions')
        tools.append(
          el('span', row.title),
          button('Editar', () => open(row)),
          button('Retirar', async () => {
            if (
              !confirm(
                dailyPath.test(row.photo)
                  ? '¿Retirar la observación? Su foto seguirá en el álbum del día.'
                  : '¿Retirar esta observación del diario público?',
              )
            )
              return
            try {
              await result(
                db
                  .from('adrio_diary')
                  .delete()
                  .eq('id', row.id)
                  .eq('version', row.version)
                  .select('id')
                  .single(),
              )
              if (filename.test(row.photo)) await storage.remove([row.photo])
              await refresh()
            } catch {
              $('warning').textContent =
                'No se pudo retirar la publicación. Actualiza y comprueba su versión.'
            }
          }),
        )
        $('manageEntries').append(tools)
      }
    compare()
  }
  function compare() {
    const box = $('comparePhotos')
    box.replaceChildren()
    if (selected.size === 2)
      box.append(
        button('Comparar las dos fotografías', () =>
          expand(rows.filter((r) => selected.has(r.id))),
        ),
      )
  }
  async function refresh() {
    if (!db) {
      draw()
      return
    }
    const seq = ++request
    try {
      const items = []
      for (let start = 0; ; start += 100) {
        const page = await result(
          db
            .from('adrio_diary')
            .select(
              'id,observed,phase,observation,title,body,caption,photo,published_at,version',
            )
            .order('observed', { ascending: false })
            .order('published_at', { ascending: false })
            .order('id')
            .range(start, start + 99),
        )
        items.push(...page)
        if (page.length < 100) break
      }
      if (seq !== request) return
      if (
        available &&
        !loadFailed &&
        JSON.stringify(rows) === JSON.stringify(items)
      )
        return
      for (const [name, pending] of photos) {
        if (!items.some((r) => r.photo === name)) {
          pending.then(URL.revokeObjectURL, () => {})
          photos.delete(name)
        }
      }
      for (const id of selected)
        if (!items.some((r) => r.id === id && r.photo)) selected.delete(id)
      rows = items
      available = true
      loadFailed = false
    } catch {
      if (seq !== request) return
      loadFailed = true
    }
    draw()
    changed()
  }
  function open(row = null) {
    editing = row
    entryId = row?.id ?? crypto.randomUUID()
    prepared = null
    editorEpoch++
    $('entryForm').reset()
    $('entryError').textContent = ''
    $('entryPreview').replaceChildren()
    $('publishEntry').hidden = true
    $('observed').value =
      row?.observed ??
      new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(
        new Date(),
      )
    $('observed').max = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Europe/Madrid',
    }).format(new Date())
    $('entryPhase').value = row?.phase ?? phases[0][0]
    $('entryTitle').value = row?.title ?? ''
    $('entryText').value = row?.body ?? ''
    $('obState').value = row?.observation ?? ''
    $('caption').value = row?.caption ?? ''
    $('entryDialog').showModal()
  }
  $('filter').onchange = draw
  $('newEntry').onclick = () => open()
  $('cancelEntry').onclick = () => $('entryDialog').close()
  $('entryForm').oninput = () => {
    editorEpoch++
    prepared = null
    $('publishEntry').hidden = true
    $('entryPreview').replaceChildren()
  }
  $('entryForm').onsubmit = async (e) => {
    e.preventDefault()
    if (!admin) return
    const seq = ++editorEpoch
    try {
      const file = $('photoFile').files[0],
        blob = file ? await optimize(file) : null
      if (seq !== editorEpoch || !admin) return
      const fields = {
        observed: $('observed').value,
        phase: $('entryPhase').value,
        observation: $('obState').value,
        title: $('entryTitle').value.trim(),
        body: $('entryText').value.trim(),
        caption: $('caption').value.trim(),
      }
      prepared = {
        fields,
        blob,
        name: editing?.photo ?? null,
        uploadId: crypto.randomUUID(),
      }
      const box = $('entryPreview')
      box.replaceChildren(
        el('h3', fields.title),
        el('small', day(fields.observed)),
        el('p', fields.body),
      )
      if (blob) {
        const img = el('img')
        img.alt = fields.caption
        img.src = URL.createObjectURL(blob)
        img.onload = () => URL.revokeObjectURL(img.src)
        box.append(img)
      } else if (editing?.photo) {
        const frame = el('div')
        box.append(frame)
        populateImage(frame, editing)
      }
      box.append(el('small', fields.caption))
      $('publishEntry').hidden = false
      $('entryError').textContent = ''
    } catch (err) {
      $('entryError').textContent = err.message
    }
  }
  $('publishEntry').onclick = async () => {
    if (!admin || !prepared) return
    const draft = prepared
    const { fields, blob } = draft
    $('publishEntry').disabled = true
    try {
      if (blob && !draft.uploaded) {
        draft.name = await addPhoto(db, blob, draft.uploadId)
        draft.uploaded = true
      }
      const name = draft.name
      const values = { ...fields, photo: name }
      let q = db.from('adrio_diary')
      q = editing
        ? q.update(values).eq('id', editing.id).eq('version', editing.version)
        : q.insert({ id: entryId, ...values })
      await result(q.select('id').single())
      if (filename.test(editing?.photo) && editing.photo !== name)
        await storage.remove([editing.photo])
      $('entryDialog').close()
      await refresh()
      window.dispatchEvent(new Event('adrio-photos-changed'))
    } catch (err) {
      $('entryError').textContent = err.message?.includes('tres fotos')
        ? err.message
        : 'No se ha confirmado la publicación. Comprueba el diario antes de reintentar.'
    } finally {
      $('publishEntry').disabled = false
    }
  }
  return {
    refresh,
    get rows() {
      return rows
    },
    get available() {
      return available
    },
    setAdmin(v) {
      if (v !== admin) {
        admin = v
        if (!v) {
          editorEpoch++
          prepared = null
          $('entryDialog').close()
        }
        draw()
      }
    },
  }
}
