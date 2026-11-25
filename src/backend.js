import { decode } from './schedule.js'
export function settings(config) {
  let url
  try {
    url = new URL(config?.url)
  } catch {
    throw Error('Falta una URL válida del proyecto Supabase.')
  }
  if (
    url.protocol !== 'https:' ||
    !/^[a-z0-9-]+\.supabase\.co$/.test(url.hostname) ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    url.username ||
    url.password ||
    url.port
  )
    throw Error(
      'Usa la URL base https://PROYECTO.supabase.co, sin rutas REST ni Auth.',
    )
  let publicKey = /^sb_publishable_[\w-]+$/.test(config.key)
  if (!publicKey)
    try {
      publicKey =
        JSON.parse(
          atob(
            config.key.split('.')[1].replaceAll('-', '+').replaceAll('_', '/'),
          ),
        ).role === 'anon'
    } catch {}
  if (!publicKey) throw Error('Configura una clave pública de Supabase.')
  if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(config.owner))
    throw Error('UUID del administrador no válido.')
  return { ...config, url: url.origin }
}
async function result(request) {
  const { data, error } = await request
  if (error) throw error
  return data
}
export function connect(config, sdk) {
  const c = settings(config)
  if (!sdk) throw Error('No se pudo cargar el cliente de Supabase.')
  const db = sdk.createClient(c.url, c.key, {
    auth: {
      detectSessionInUrl: false,
      autoRefreshToken: true,
      persistSession: true,
    },
  })
  return {
    auth: db.auth,
    owner: c.owner,
    scope: c.url,
    async load() {
      const row = await result(
        db
          .from('schedule')
          .select('state,revision,updated_at')
          .eq('id', 1)
          .single(),
      )
      if (
        !Number.isSafeInteger(row.revision) ||
        row.revision < 0 ||
        !Number.isFinite(Date.parse(row.updated_at))
      )
        throw Error('Revisión remota no válida.')
      return { ...row, state: decode(row.state) }
    },
    save: (revision, state, restore) =>
      result(
        db.rpc('adrio_publish', {
          base_revision: revision,
          proposed: state,
          restoring: restore,
        }),
      ),
    history: () => result(db.rpc('adrio_history')),
    authorized: () => result(db.rpc('adrio_is_admin')),
  }
}
