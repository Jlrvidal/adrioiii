import { element } from './chart.js'
import { day } from './phases.js'
import { jpegSource } from './photos.js'

export function moderation(db, published) {
  const panel = document.getElementById('photoModeration')
  const list = document.getElementById('pendingPhotos')
  const status = document.getElementById('moderationStatus')
  let admin = false
  let generation = 0

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
  }

  return {
    refresh,
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
