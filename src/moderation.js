import { element } from './chart.js'
import { day } from './phases.js'
import { jpegSource } from './photos.js'

export function moderation(db, published) {
  const panel = document.getElementById('photoModeration')
  const list = document.getElementById('pendingPhotos')
  const status = document.getElementById('moderationStatus')
  let admin = false
  let generation = 0
  // Foto que llega desde el enlace del correo (?revisar=<id>).
  let target = null

  async function refresh() {
    if (!admin) return
    const current = ++generation
    const { data, error } = await db.rpc('adrio_pending_photos')
    if (!admin || current !== generation) return
    if (error) {
      list.replaceChildren('No se pudieron consultar las fotos pendientes.')
      return
    }
    list.replaceChildren()
    if (!data.length) list.textContent = 'No hay fotos pendientes.'
    for (const row of data) {
      const entry = element('article')
      entry.dataset.id = row.id
      const image = element('img')
      const approve = element('button', 'Aprobar')
      const reject = element('button', 'Rechazar')
      image.alt = 'Foto pendiente del ' + day(row.submitted_on)
      const date = element('time', day(row.submitted_on))
      date.dateTime = row.submitted_on
      const actions = element('div', '', 'actions')
      actions.append(approve, reject)
      entry.append(image, date, actions)
      list.append(entry)
      db.rpc('adrio_pending_photo', { id: row.id }).then(({ data, error }) => {
        if (error || !data)
          image.replaceWith(element('p', 'Foto no disponible.'))
        else image.src = jpegSource(data)
      })

      async function decide(action) {
        if (!admin) return
        approve.disabled = reject.disabled = true
        status.textContent = ''
        const { error } = await db.rpc('adrio_' + action + '_photo', {
          id: row.id,
        })
        if (!admin) return
        if (error) {
          status.textContent = error.message
          approve.disabled = reject.disabled = false
          return
        }
        status.textContent =
          action === 'approve' ? 'Foto aprobada.' : 'Foto rechazada.'
        await Promise.all([refresh(), action === 'approve' && published()])
      }
      approve.onclick = () => decide('approve')
      reject.onclick = () => decide('reject')
    }
    if (target) {
      const entry = [...list.children].find((e) => e.dataset.id === target)
      target = null
      const url = new URL(location.href)
      url.searchParams.delete('revisar')
      history.replaceState(null, '', url)
      if (entry) {
        entry.classList.add('reviewFocus')
        status.textContent = 'Esta es la foto del aviso.'
        entry.scrollIntoView({ block: 'center' })
      } else {
        status.textContent = 'La foto del aviso ya se ha revisado.'
        panel.scrollIntoView({ block: 'start' })
      }
    }
  }

  return {
    refresh,
    // El enlace del correo apunta a una foto concreta de la cola.
    focus(id) {
      target = id
      if (admin) refresh()
    },
    waiting: () => Boolean(target),
    setAdmin(value) {
      if (admin === value) return
      admin = value
      panel.hidden = !admin
      if (admin) refresh()
      else {
        generation++
        list.replaceChildren()
        status.textContent = ''
      }
    },
  }
}
