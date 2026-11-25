import {
  defaults,
  modes,
  phases,
  edit,
  complete,
  correctMilestone,
  decode,
  delivery,
  today,
  monthISO,
  offsetOf,
  format,
} from './schedule.js'
import { connect } from './backend.js'
import { ScheduleStore } from './sync.js'
import { renderChart, element } from './chart.js'
import { diary } from './diary.js'
import { album, comments } from './album.js'
import { overview } from './overview.js'
const $ = (id) => document.getElementById(id)
let mode =
  new URL(location.href).searchParams.get('escenario') === 'pesimista'
    ? 'pesimista'
    : 'optimista'
let visitorPreview = false,
  compare = new URL(location.href).searchParams.get('escenario') === 'comparar',
  listView = matchMedia('(max-width:640px)').matches,
  baseView = false,
  gallery,
  notes,
  book,
  extraVersion = 0,
  extraLoading = false,
  lastExtra = -1
let api,
  store,
  configError = '',
  signedIn = false,
  identity = 0,
  preview,
  previewBase,
  checkedUser
const fallback = defaults(),
  system = matchMedia('(prefers-color-scheme: dark)')
try {
  $('theme').value = localStorage.getItem('adrio:theme') ?? 'system'
} catch {}
function theme() {
  document.documentElement.dataset.theme =
    $('theme').value === 'system'
      ? system.matches
        ? 'dark'
        : 'light'
      : $('theme').value
}
theme()
system.onchange = theme
$('theme').onchange = () => {
  theme()
  try {
    localStorage.setItem('adrio:theme', $('theme').value)
  } catch {}
}
const warn = (t) => {
  $('warning').textContent = t
}
function safe(action) {
  return async (...args) => {
    try {
      return await action(...args)
    } catch (e) {
      warn(e.message)
      $('notice').textContent = e.message
    }
  }
}
function commit(next) {
  warn('')
  store.stage(next)
}
function manual(state, enabled) {
  $('manual').replaceChildren()
  if (!enabled) return
  state.plans[mode].forEach((p, i) => {
    const row = element('div', '', 'edit')
    row.append(element('strong', phases[i][1]), element('br'))
    for (const side of ['Inicio', 'Fin']) {
      const label = element('label', side),
        input = element('input')
      input.type = 'month'
      input.value = monthISO(side === 'Inicio' ? p.s : p.s + p.d)
      input.disabled = state.completed[i]
      input.onchange = safe(() => {
        const n = offsetOf(input.value)
        commit(
          edit(
            state,
            mode,
            i,
            side === 'Inicio' ? n : p.s,
            side === 'Fin' ? n - p.s : p.d,
          ),
        )
      })
      label.append(input)
      row.append(label)
    }
    const done = element(
      'button',
      state.completed[i] ? 'Hito confirmado' : 'Confirmar fase completada',
    )
    done.disabled = state.completed[i]
    done.onclick = safe(() => {
      if (confirm('¿Confirmar y bloquear estas fechas en ambos escenarios?'))
        commit(complete(state, mode, i))
    })
    row.append(done)
    if (state.completed[i]) {
      const correction = element('details'),
        summary = element('summary', 'Corregir fechas confirmadas')
      correction.append(summary)
      const dates = ['Inicio real', 'Fin real'].map((title, j) => {
        const label = element('label', title),
          input = element('input')
        input.type = 'month'
        input.value = monthISO(p.s + (j ? p.d : 0))
        label.append(input)
        correction.append(label)
        return input
      })
      const apply = element('button', 'Revisar corrección')
      apply.onclick = safe(() => {
        const next = correctMilestone(
          state,
          i,
          ...dates.map((input) => offsetOf(input.value)),
        )
        inspect(next)
      })
      correction.append(apply)
      row.append(correction)
    }
    $('manual').append(row)
  })
}
let lastState, lastMode, lastEnabled, lastDay
function render() {
  if (store?.editing) return
  const state = (visitorPreview ? store?.published : store?.state) ?? fallback,
    now = today(),
    plan = state.plans[mode],
    enabled = Boolean(
      !visitorPreview &&
        store?.admin &&
        store.revision !== null &&
        !store.conflict,
    )
  $('status').textContent =
    store?.draft && !visitorPreview
      ? 'Borrador sin publicar'
      : store?.stamp
        ? store.source === 'cached'
          ? 'Última publicación disponible'
          : 'Publicación sincronizada'
        : 'Calendario orientativo inicial, pendiente de publicación.'
  $('diag').textContent =
    configError ||
    (api?.normalized ? 'Se normalizó la ruta de la API. ' : '') +
      (store?.message || 'Sin conexión')
  book?.setAdmin(Boolean(store?.admin && !visitorPreview))
  notes?.setAdmin(Boolean(store?.admin && !visitorPreview))
  $('stamp').textContent = store?.stamp
    ? 'Actualizado el ' +
      new Date(store.stamp).toLocaleDateString('es-ES', {
        dateStyle: 'long',
        timeZone: 'Europe/Madrid',
      })
    : store?.loadFailed || configError
      ? 'No se ha podido actualizar el seguimiento.'
      : 'Consultando la publicación…'
  $('login').hidden = signedIn
  $('logout').hidden = !signedIn
  $('admin').hidden = !store?.admin || visitorPreview
  $('returnEdit').hidden = !store?.admin || !visitorPreview
  $('login').disabled = false
  $('discard').disabled = !store?.draft || store.busy
  $('reset').disabled =
    $('import').disabled =
    $('history').disabled =
      !enabled || store.busy || Boolean(store.draft)
  $('draft').textContent = store?.draft
    ? 'Vista del borrador local pendiente de publicación.'
    : 'Vista de la última publicación.'
  for (const m of [...modes, 'comparar'])
    $(m).setAttribute(
      'aria-pressed',
      String(m === (compare ? 'comparar' : mode)),
    )
  $('today').textContent =
    'Hoy · ' +
    new Date().toLocaleDateString('es-ES', {
      dateStyle: 'long',
      timeZone: 'Europe/Madrid',
    })
  $('gantt').setAttribute('aria-pressed', String(!listView))
  $('vertical').setAttribute('aria-pressed', String(listView))
  document.querySelector('.scroll').hidden = listView
  $('phaseList').hidden = !listView
  $('goToday').hidden = listView
  $('yearKey').hidden = listView
  $('compareKey').hidden = !compare || listView
  if (
    lastState !== state ||
    lastMode !== mode ||
    lastEnabled !== enabled ||
    lastDay !== now ||
    lastExtra !== extraVersion
  ) {
    const detail = overview(
      state,
      mode,
      now,
      Boolean(store?.stamp),
      book?.rows ?? [],
      compare,
      baseView,
    )
    renderChart($('chart'), state, mode, now, enabled && !compare, {
      photoDays: gallery?.dates() ?? [],
      openMonth: gallery?.openMonth,
      compare,
      baseline: baseView,
      detail,
      lock: (v) => {
        store.editing = v
      },
      commit: safe(commit),
      warn,
    })
    manual(state, enabled && !compare)
    lastState = state
    lastMode = mode
    lastEnabled = enabled
    lastExtra = extraVersion
    lastDay = now
  }
}
for (const m of [...modes, 'comparar'])
  $(m).onclick = () => {
    compare = m === 'comparar'
    mode = compare ? 'optimista' : m
    extraVersion++
    render()
  }
$('viewAsVisitor').onclick = () => {
  visitorPreview = true
  extraVersion++
  render()
  window.scrollTo(0, 0)
}
$('returnEdit').onclick = () => {
  visitorPreview = false
  extraVersion++
  render()
  $('admin').scrollIntoView()
}
$('gantt').onclick = () => {
  listView = false
  render()
}
$('vertical').onclick = () => {
  listView = true
  render()
}
$('baseline').onchange = () => {
  baseView = $('baseline').checked
  extraVersion++
  render()
}
$('goToday').onclick = () => {
  const pane = document.querySelector('.scroll'),
    marker = document.querySelector('.todayline'),
    label = document.querySelector('.caption')
  if (marker)
    pane.scrollLeft +=
      marker.getBoundingClientRect().left -
      pane.getBoundingClientRect().left -
      (pane.clientWidth + label.clientWidth) / 2
}
try {
  api = connect(window.ADRIO, window.supabase)
  const storage = {
    getItem: (k) => localStorage.getItem(k),
    setItem: (k, v) => localStorage.setItem(k, v),
    removeItem: (k) => localStorage.removeItem(k),
  }
  store = new ScheduleStore(api, storage, render)
  store.loadCache()
} catch (e) {
  configError = e.message
  if (!window.ADRIO) {
    const cachedStore = new ScheduleStore(
      {
        scope: document.querySelector('meta[name=adrio-cache-origin]').content,
      },
      localStorage,
      render,
    )
    cachedStore.loadCache()
    if (cachedStore.stamp) store = cachedStore
  }
}
function extrasChanged() {
  extraVersion++
  render()
}
book = diary(api, extrasChanged)
gallery = album(api?.db, extrasChanged)
notes = comments(api?.db)
async function extras() {
  if (extraLoading || document.hidden || store?.editing || viewingEdit()) return
  extraLoading = true
  try {
    await Promise.all([book.refresh(), gallery.refresh(), notes.refresh()])
  } finally {
    extraLoading = false
  }
}
function viewingEdit() {
  return Boolean(
    document.querySelector('dialog[open]') ||
      $('manual').contains(document.activeElement),
  )
}
function refresh() {
  if (api && !document.hidden && !viewingEdit()) store?.refresh()
}
async function verifyOwner(seq) {
  try {
    const ok = await api.authorized()
    if (seq !== identity) return
    api.owner = ok === true ? checkedUser : null
    store.authorize(ok === true)
    $('notice').textContent =
      ok === true ? '' : 'Sesión con acceso de solo lectura.'
    await store.refresh()
  } catch {
    if (seq === identity) {
      store.authorize(false)
      $('notice').textContent =
        'No se pudo verificar el permiso de administración.'
    }
  }
}
if (api) {
  store.viewingEdit = viewingEdit
  api.auth.onAuthStateChange((event, session) => {
    const uid = session?.user?.id,
      seq = ++identity
    signedIn = Boolean(uid)
    if (uid !== checkedUser || !uid) {
      store.authorize(false)
      api.owner = null
      $('notice').textContent = ''
      for (const id of ['versions', 'preview']) $(id).close()
    }
    if (!uid) visitorPreview = false
    checkedUser = uid
    render()
    if (uid) setTimeout(() => verifyOwner(seq), 0)
    else if (event === 'SIGNED_OUT') store.refresh()
  })
  refresh()
  window.addEventListener('online', () => {
    if (checkedUser && !store.admin) verifyOwner(identity)
    else refresh()
  })
  document.addEventListener('visibilitychange', refresh)
}
render()
extras().then(() => {
  if (/^#observacion-[a-f0-9-]{36}$/.test(location.hash))
    document.getElementById(location.hash.slice(1))?.scrollIntoView()
})
setInterval(() => {
  if (!document.hidden && !store?.editing) {
    render()
    refresh()
    extras()
  }
}, 60000)
$('login').onclick = () => {
  $('autherror').textContent = api
    ? ''
    : 'El acceso está temporalmente fuera de servicio.'
  $('enter').disabled = !api
  $('auth').showModal()
}
$('auth').onclose = () => {
  $('password').value = ''
  $('visible').checked = false
  $('password').type = 'password'
}
$('visible').onchange = () => {
  $('password').type = $('visible').checked ? 'text' : 'password'
}
$('cancel').onclick = () => $('auth').close()
$('authform').onsubmit = async (e) => {
  e.preventDefault()
  if (!api) return
  $('enter').disabled = true
  $('autherror').textContent = 'Verificando…'
  try {
    const { error } = await api.auth.signInWithPassword({
      email: $('email').value.trim(),
      password: $('password').value,
    })
    if (error) throw error
    $('auth').close()
  } catch (e) {
    $('autherror').textContent =
      e.code === 'invalid_credentials'
        ? 'Correo o contraseña incorrectos.'
        : 'No se pudo iniciar sesión. Comprueba la conexión y la configuración de acceso.'
  } finally {
    $('enter').disabled = false
  }
}
$('logout').onclick = safe(async () => {
  if (store.busy) throw Error('Espera a que termine el guardado.')
  const { error } = await api.auth.signOut({ scope: 'local' })
  if (error) throw error
})
$('retry').onclick = () => store.refresh()
$('discard').onclick = safe(() => {
  if (
    confirm(
      '¿Descartar el borrador de este dispositivo y cargar la última publicación?',
    )
  )
    store.discard()
})
function shareURL() {
  const u = new URL(location.pathname, location.origin)
  u.searchParams.set('escenario', compare ? 'comparar' : mode)
  return u.href
}
$('copy').onclick = safe(async () => {
  await navigator.clipboard.writeText(shareURL())
  $('notice').textContent = 'Enlace copiado.'
})
$('share').onclick = safe(async () => {
  const url = shareURL(),
    text =
      'Seguimiento de Obra Adrio III · Escenario ' +
      (compare ? 'comparado' : mode) +
      ' · Entrega estimada: ' +
      format(delivery((store?.published ?? fallback).plans[mode])) +
      (compare
        ? ' a ' +
          format(delivery((store?.published ?? fallback).plans.pesimista))
        : '') +
      '. Previsión no oficial.'
  if (navigator.share) {
    try {
      await navigator.share({ text, url })
      return
    } catch (e) {
      if (e.name === 'AbortError') return
    }
  }
  window.open(
    'https://wa.me/?text=' + encodeURIComponent(text + ' ' + url),
    '_blank',
    'noopener,noreferrer',
  )
})
$('export').onclick = () => {
  const url = URL.createObjectURL(
    new Blob(
      [
        JSON.stringify(
          { revision: store.revision, state: store.state },
          null,
          2,
        ),
      ],
      { type: 'application/json' },
    ),
  )
  const a = element('a')
  a.href = url
  a.download = 'adrio-iii.json'
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
function inspect(raw) {
  preview = decode(raw)
  previewBase = store.revision
  $('comparison').replaceChildren()
  for (const m of modes) {
    $('comparison').append(element('h3', m))
    preview.plans[m].forEach((p, i) =>
      $('comparison').append(
        element(
          'p',
          phases[i][1] +
            ' · ' +
            format(p.s) +
            ' – ' +
            format(p.s + p.d) +
            (preview.completed[i] ? ' · Completada' : ''),
        ),
      ),
    )
  }
  $('preview').showModal()
}
$('apply').onclick = safe(() => {
  if (store.revision !== previewBase || store.draft)
    throw Error('La publicación ha cambiado. Abre de nuevo la vista previa.')
  store.stage(preview, true)
  $('preview').close()
  $('versions').close()
})
$('back').onclick = () => $('preview').close()
$('reset').onclick = () => inspect(defaults())
$('import').onchange = safe(async (e) => {
  const f = e.target.files[0]
  e.target.value = ''
  if (!f) return
  if (f.size > 32768) throw Error('El archivo supera 32 KiB.')
  const raw = JSON.parse(await f.text())
  inspect(raw.state ?? raw)
})
$('history').onclick = safe(async () => {
  const rows = await api.history()
  if (!store.admin) return
  $('list').replaceChildren()
  for (const row of rows) {
    const b = element(
      'button',
      'Revisión ' +
        row.revision +
        ' · ' +
        new Date(row.updated_at).toLocaleString('es-ES'),
    )
    b.onclick = safe(() => inspect(row.state))
    $('list').append(b)
  }
  if (!rows.length) $('list').textContent = 'Sin versiones anteriores.'
  $('versions').showModal()
})
$('close').onclick = () => $('versions').close()

if (!api && !window.ADRIO)
  window.addEventListener('online', () => location.reload(), { once: true })
if ('serviceWorker' in navigator && window.isSecureContext)
  navigator.serviceWorker.register('./sw.js').catch(() => {})
