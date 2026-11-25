import { defaults, validate } from './schedule.js'
const equal = (a, b) =>
  a.version === b.version &&
  a.completed.every((v, i) => v === b.completed[i]) &&
  ['optimista', 'pesimista'].every((m) =>
    a.plans[m].every(
      (p, i) => p.s === b.plans[m][i].s && p.d === b.plans[m][i].d,
    ),
  )
export class ScheduleStore {
  constructor(api, storage, notify) {
    Object.assign(this, {
      api,
      storage,
      notify,
      published: defaults(),
      source: 'initial',
      loadFailed: false,
      revision: null,
      stamp: null,
      admin: false,
      draft: null,
      busy: false,
      editing: false,
      conflict: false,
      epoch: 0,
      change: 0,
      read: 0,
      message: 'Conectando…',
    })
  }
  loadCache() {
    try {
      const cached = JSON.parse(
        this.storage.getItem('adrio:public:' + this.api.scope),
      )
      if (cached && Number.isFinite(Date.parse(cached.updated_at))) {
        this.published = validate(cached.state)
        this.stamp = cached.updated_at
        this.source = 'cached'
        this.message = 'Mostrando la última información disponible.'
      }
    } catch {}
  }
  cachePublication() {
    try {
      this.storage.setItem(
        'adrio:public:' + this.api.scope,
        JSON.stringify({ state: this.published, updated_at: this.stamp }),
      )
    } catch {}
  }
  get state() {
    return this.draft?.state ?? this.published
  }
  get key() {
    return 'adrio:v2:' + this.api.scope + ':' + this.api.owner
  }
  inform(message) {
    this.message = message
    this.notify()
  }
  authorize(admin) {
    if (this.admin === admin) return
    this.epoch++
    this.admin = admin
    this.draft = null
    this.conflict = false
    this.editing = false
    this.busy = false
    if (admin)
      try {
        const raw = this.storage.getItem(this.key)
        if (raw) {
          const d = JSON.parse(raw)
          validate(d.state)
          if (
            !Number.isSafeInteger(d.base) ||
            d.base < 0 ||
            typeof d.restore !== 'boolean'
          )
            throw Error()
          this.draft = d
        }
      } catch {
        this.inform('No se pudo recuperar el borrador local.')
      }
    this.notify()
  }
  async refresh() {
    if (this.busy || this.editing) return
    const read = ++this.read,
      epoch = this.epoch,
      change = this.change
    try {
      const row = await this.api.load()
      if (
        read !== this.read ||
        epoch !== this.epoch ||
        change !== this.change ||
        this.busy ||
        this.editing ||
        this.viewingEdit?.()
      )
        return
      if (this.revision !== row.revision || !equal(this.published, row.state))
        this.published = row.state
      this.revision = row.revision
      this.source = 'remote'
      this.loadFailed = false
      this.stamp = row.updated_at
      this.cachePublication()
      if (this.draft && this.draft.base !== row.revision) {
        if (equal(this.draft.state, row.state)) {
          this.draft = null
          this.storage.removeItem(this.key)
        } else {
          this.conflict = true
          this.inform(
            'Conflicto de versiones. Exporta tu borrador antes de cargar la publicación.',
          )
          return
        }
      }
      this.conflict = false
      this.inform(
        this.draft ? 'Borrador pendiente' : 'Publicación sincronizada',
      )
      if (this.draft) await this.flush()
    } catch (e) {
      if (read === this.read && epoch === this.epoch) {
        this.source = this.stamp ? 'cached' : 'initial'
        this.loadFailed = true
        this.inform(
          this.stamp
            ? 'Mostrando la última información disponible.'
            : 'Calendario orientativo inicial, pendiente de publicación.',
        )
      }
    }
  }
  persist() {
    try {
      this.storage.setItem(this.key, JSON.stringify(this.draft))
      return true
    } catch {
      this.inform(
        'Almacenamiento local no disponible. Exporta una copia antes de salir.',
      )
      return false
    }
  }
  stage(state, restore = false) {
    if (!this.admin || this.conflict || this.revision === null)
      throw Error('Se necesita una publicación verificada para editar.')
    this.change++
    this.draft = {
      base: this.draft?.base ?? this.revision,
      state: validate(state),
      restore: restore || Boolean(this.draft?.restore),
    }
    const durable = this.persist()
    this.notify()
    if (durable) this.flush()
  }
  discard() {
    if (!this.admin || this.busy) return
    this.storage.removeItem(this.key)
    this.draft = null
    this.change++
    this.conflict = false
    this.notify()
    this.refresh()
  }
  async flush() {
    if (
      !this.admin ||
      this.busy ||
      this.conflict ||
      !this.draft ||
      this.revision !== this.draft.base
    )
      return
    const snapshot = this.draft,
      epoch = this.epoch
    this.busy = true
    this.read++
    this.inform('Guardando…')
    try {
      const ack = await this.api.save(
        snapshot.base,
        snapshot.state,
        snapshot.restore,
      )
      if (epoch !== this.epoch) return
      if (
        ack.revision !== snapshot.base + 1 ||
        !Number.isFinite(Date.parse(ack.updated_at))
      )
        throw Error('Confirmación no válida.')
      this.published = snapshot.state
      this.revision = ack.revision
      this.source = 'remote'
      this.loadFailed = false
      this.stamp = ack.updated_at
      this.cachePublication()
      if (snapshot === this.draft) {
        this.draft = null
        this.storage.removeItem(this.key)
      } else {
        this.draft = { ...this.draft, base: ack.revision }
        this.persist()
      }
      this.inform('Publicación sincronizada')
    } catch (e) {
      if (epoch !== this.epoch) return
      this.conflict = e.code === '40001'
      this.inform(
        this.conflict
          ? 'Conflicto de versiones. Revisa la publicación y conserva tu copia.'
          : 'Guardado pendiente · ' + e.message,
      )
      return
    } finally {
      if (epoch === this.epoch) {
        this.busy = false
        this.notify()
      }
    }
    if (this.draft) await this.flush()
  }
}
