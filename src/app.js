import {
  defaults,
  modes,
  phases,
  edit,
  complete,
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
const $ = (id) => document.getElementById(id)
let mode =
  new URL(location.href).searchParams.get('escenario') === 'pesimista'
    ? 'pesimista'
    : 'optimista'
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
    $('manual').append(row)
  })
}
let lastState, lastMode, lastEnabled, lastDay
function render() {
  const state = store?.state ?? fallback,
    now = today(),
    plan = state.plans[mode],
    enabled = Boolean(
      store?.admin && store.revision !== null && !store.conflict,
    )
  $('status').textContent =
    configError || store?.message || 'Calendario inicial'
  $('stamp').textContent = store?.stamp
    ? 'Última publicación · ' +
      new Date(store.stamp).toLocaleString('es-ES', {
        timeZone: 'Europe/Madrid',
      })
    : 'Sin actualización remota confirmada'
  $('login').hidden = signedIn
  $('logout').hidden = !signedIn
  $('admin').hidden = !store?.admin
  $('login').disabled = !api
  $('discard').disabled = !store?.draft || store.busy
  $('reset').disabled =
    $('import').disabled =
    $('history').disabled =
      !enabled || store.busy || Boolean(store.draft)
  $('draft').textContent = store?.draft
    ? 'Vista del borrador local pendiente de publicación.'
    : 'Vista de la última publicación.'
  for (const m of modes) $(m).setAttribute('aria-pressed', String(m === mode))
  $('early').textContent = format(delivery(state.plans.optimista))
  $('late').textContent = format(delivery(state.plans.pesimista))
  $('count').textContent = state.completed.filter(Boolean).length + ' de 7'
  $('today').textContent =
    'Hoy · ' +
    new Date().toLocaleDateString('es-ES', {
      dateStyle: 'long',
      timeZone: 'Europe/Madrid',
    })
  $('current').textContent =
    plan
      .flatMap((p, i) =>
        !state.completed[i] && p.s <= now && now < p.s + p.d
          ? [phases[i][1]]
          : [],
      )
      .join(' · ') || 'Sin actividad prevista'
  const next = plan
    .map((p, i) => ({ end: p.s + p.d, i }))
    .filter((p) => !state.completed[p.i] && p.end > now)
    .sort((a, b) => a.end - b.end)[0]
  $('next').textContent = next
    ? phases[next.i][1] + ' · ' + format(next.end)
    : 'Sin hitos futuros'
  $('remaining').textContent =
    Math.max(0, Math.ceil(delivery(plan) - now)) + ' meses'
  if (
    lastState !== state ||
    lastMode !== mode ||
    lastEnabled !== enabled ||
    lastDay !== now
  ) {
    renderChart($('chart'), state, mode, now, enabled, {
      lock: (v) => {
        store.editing = v
      },
      commit: safe(commit),
      warn,
    })
    manual(state, enabled)
    lastState = state
    lastMode = mode
    lastEnabled = enabled
    lastDay = now
  }
}
for (const m of modes)
  $(m).onclick = () => {
    mode = m
    render()
  }
try {
  api = connect(window.ADRIO, window.supabase)
  const storage = {
    getItem: (k) => localStorage.getItem(k),
    setItem: (k, v) => localStorage.setItem(k, v),
    removeItem: (k) => localStorage.removeItem(k),
  }
  store = new ScheduleStore(api, storage, render)
} catch (e) {
  configError = 'Calendario inicial · ' + e.message
}
function viewingEdit() {
  return Boolean(
    document.querySelector('dialog[open]') ||
      $('manual').contains(document.activeElement),
  )
}
function refresh() {
  if (!document.hidden && !viewingEdit()) store?.refresh()
}
async function verifyOwner(seq) {
  try {
    const ok = await api.authorized()
    if (seq !== identity) return
    store.authorize(ok === true)
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
      for (const id of ['versions', 'preview']) $(id).close()
    }
    checkedUser = uid
    render()
    if (uid === api.owner) setTimeout(() => verifyOwner(seq), 0)
    else if (uid) $('notice').textContent = 'Sesión con acceso de solo lectura.'
    else if (event === 'SIGNED_OUT') store.refresh()
  })
  refresh()
  window.addEventListener('online', () => {
    if (checkedUser === api.owner && !store.admin) verifyOwner(identity)
    else refresh()
  })
  document.addEventListener('visibilitychange', refresh)
}
render()
setInterval(() => {
  if (!document.hidden && !store?.editing) {
    render()
    refresh()
  }
}, 60000)
$('login').onclick = () => {
  $('autherror').textContent = ''
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
  u.searchParams.set('escenario', mode)
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
      mode +
      ' · Entrega estimada: ' +
      format(delivery((store?.published ?? fallback).plans[mode])) +
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
