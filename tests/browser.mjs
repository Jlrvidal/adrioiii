// BROWSER_EXECUTABLE and PLAYWRIGHT_MODULE optionally select preinstalled tools.
import { createServer } from 'node:http'
import { readFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { defaults, phases } from '../src/schedule.js'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const root = new URL('../', import.meta.url)
const server = createServer(async (req, res) => {
  const path =
    new URL(req.url, 'http://localhost').pathname.slice(1) || 'index.html'
  try {
    const data = await readFile(new URL(path, root))
    res.writeHead(200, {
      'Content-Type': path.endsWith('.html')
        ? 'text/html'
        : path.endsWith('.css')
          ? 'text/css'
          : path.endsWith('.svg')
            ? 'image/svg+xml'
            : path.endsWith('.png')
              ? 'image/png'
              : path.endsWith('.webmanifest')
                ? 'application/manifest+json'
                : 'text/javascript',
    })
    res.end(data)
  } catch {
    res.writeHead(404)
    res.end()
  }
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
let browser
try {
  browser = await chromium.launch({
    executablePath: process.env.BROWSER_EXECUTABLE,
    headless: true,
  })
  const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    }),
    errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  const owner = 'c7bad662-fa5d-445d-a219-ed1976c58e84'
  let uid = owner,
    offline = true,
    writes = 0,
    rev = 0,
    state = defaults()
  const stamp = '2026-11-25T20:55:45Z'
  const legacy = {
    mode: 'optimista',
    data: state.plans.optimista.map((p, i) => ({
      name: phases[i][1],
      s: p.s,
      d: p.d,
      done: false,
    })),
  }
  let published = legacy,
    diaryRows = [],
    photoPath = '',
    photoBytes = '',
    comments = [],
    dailyPhotos = [],
    pendingPhotos = [],
    signedIn = false,
    diaryWrites = 0
  await page.route('https://*.supabase.co/**', async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname
    const send = (json, status = 200) => route.fulfill({ status, json })
    if (path === '/rest/v1/schedule')
      return offline
        ? route.abort()
        : send({ revision: rev, state: published, updated_at: stamp })
    if (path === '/auth/v1/token') {
      if (req.postDataJSON().password === 'incorrecta')
        return send(
          {
            error_code: 'invalid_credentials',
            msg: 'Invalid login credentials',
          },
          400,
        )
      signedIn = true
      const user = {
        id: uid,
        aud: 'authenticated',
        role: 'authenticated',
        email: 'test@example.test',
      }
      const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
      const jwt =
        enc({ alg: 'HS256', typ: 'JWT' }) +
        '.' +
        enc({
          sub: uid,
          role: 'authenticated',
          exp: Math.floor(Date.now() / 1000) + 3600,
        }) +
        '.c2ln'
      return send({
        access_token: jwt,
        refresh_token: 'fixture-refresh',
        expires_in: 3600,
        token_type: 'bearer',
        user,
      })
    }
    if (path === '/auth/v1/logout') {
      signedIn = false
      return send({})
    }
    if (path === '/rest/v1/rpc/adrio_is_admin') return send(uid === owner)
    if (path === '/rest/v1/rpc/adrio_publish') {
      writes++
      published = req.postDataJSON().proposed
      return send({ revision: ++rev, updated_at: stamp })
    }
    if (path === '/rest/v1/rpc/adrio_history')
      return send([{ revision: 0, state: legacy, updated_at: stamp }])
    if (path === '/rest/v1/rpc/adrio_photo_index') return send(dailyPhotos)
    if (path === '/rest/v1/rpc/adrio_photo') return send(photoBytes)
    const publishPhoto = (taken, bytes) => {
      const slot = [1, 2, 3].find(
        (n) => !dailyPhotos.some((r) => r.taken === taken && r.slot === n),
      )
      if (!slot)
        return send({ message: 'Ya hay tres fotos para este día' }, 400)
      photoBytes = bytes
      dailyPhotos.push({
        taken,
        slot,
        legacy: null,
        photo_version: crypto.randomUUID(),
      })
      photoPath = taken + '/' + slot + '.jpg'
      return send(photoPath)
    }
    if (path === '/rest/v1/rpc/adrio_add_photo') {
      const taken = new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Europe/Madrid',
      }).format(new Date())
      const bytes = req.postDataJSON().image_base64
      if (signedIn && uid === owner) return publishPhoto(taken, bytes)
      pendingPhotos.push({
        id: crypto.randomUUID(),
        submitted_on: taken,
        created_at: stamp,
        bytes,
      })
      return send('pendiente')
    }
    if (path === '/rest/v1/rpc/adrio_pending_photos')
      return send(
        pendingPhotos.map(({ id, submitted_on, created_at }) => ({
          id,
          submitted_on,
          created_at,
        })),
      )
    if (path === '/rest/v1/rpc/adrio_pending_photo')
      return send(
        pendingPhotos.find((row) => row.id === req.postDataJSON().id).bytes,
      )
    if (
      path === '/rest/v1/rpc/adrio_approve_photo' ||
      path === '/rest/v1/rpc/adrio_reject_photo'
    ) {
      const i = pendingPhotos.findIndex(
        (row) => row.id === req.postDataJSON().id,
      )
      const [row] = pendingPhotos.splice(i, 1)
      return path.endsWith('approve_photo')
        ? publishPhoto(row.submitted_on, row.bytes)
        : send(null)
    }
    if (path === '/rest/v1/rpc/adrio_remove_photo') {
      const { taken_on, position_in_day } = req.postDataJSON()
      dailyPhotos = dailyPhotos.filter(
        (row) => row.taken !== taken_on || row.slot !== position_in_day,
      )
      return send(null)
    }
    if (path === '/rest/v1/adrio_comments') {
      if (req.method() === 'GET') return send(comments)
      if (req.method() === 'DELETE') return send(comments.pop())
      comments.push({ ...req.postDataJSON(), id: owner })
      return send(null, 201)
    }
    if (path === '/rest/v1/adrio_diary') {
      if (req.method() === 'GET') return send(diaryRows)
      if (uid !== owner) return send({}, 403)
      const values = req.postDataJSON()
      diaryWrites++
      if (req.method() === 'POST') {
        diaryRows = [
          { ...values, version: 1, published_at: stamp },
          ...diaryRows,
        ]
        return send({ id: values.id })
      }
      if (req.method() === 'PATCH') {
        Object.assign(diaryRows[0], values, { version: 2 })
        return send({ id: diaryRows[0].id })
      }
      if (req.method() === 'DELETE') {
        const row = diaryRows.shift()
        return send({ id: row.id })
      }
    }
    if (path.startsWith('/storage/v1/object/') && req.method() === 'POST') {
      photoPath = path
      return send({ Key: path })
    }
    if (path.startsWith('/storage/v1/object/') && req.method() === 'GET')
      return route.fulfill({
        contentType: 'image/webp',
        body: Buffer.from(
          'UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEAAUAmJaQAA3AA/v89WAAAAA==',
          'base64',
        ),
      })
    if (path.startsWith('/storage/v1/object/') && req.method() === 'DELETE')
      return send([])
    if (path === '/rest/v1/rpc/adrio_forecasts')
      return send([
        { revision: 0, published_at: stamp, optimista: 21, pesimista: 28 },
      ])
    throw Error(path)
  })
  const url = 'http://127.0.0.1:' + server.address().port + '/'
  await page.goto(url + '?access_token=fixture#sensitive')
  await page
    .locator('#status')
    .filter({ hasText: 'Calendario orientativo inicial' })
    .waitFor()
  assert.equal(
    await page.locator('#realista').getAttribute('aria-pressed'),
    'true',
  )
  for (let i = 0; i < 3; i++) {
    await page.locator('#optimista').click()
    await page.locator('#realista').click()
  }
  assert.equal(await page.locator('.bar').count(), 7)
  assert.equal(await page.locator('.handle').count(), 0)
  assert.equal(writes, 0)
  await page.evaluate(() =>
    Object.defineProperty(navigator, 'share', {
      value: ({ url }) => {
        window.shared = url
        return Promise.resolve()
      },
    }),
  )
  await page.locator('#share').click()
  assert.equal(
    await page.evaluate(() => window.shared),
    url + '?escenario=realista',
  )
  for (const [slug, active] of [
    ['pesimista', 'realista'],
    ['realista', 'realista'],
    ['optimista', 'optimista'],
    ['comparar', 'comparar'],
  ]) {
    await page.goto(url + '?escenario=' + slug)
    await page.waitForSelector('#' + active + '[aria-pressed="true"]')
  }
  await page.goto(url)
  offline = false
  await page.reload()
  await page
    .locator('#status')
    .filter({ hasText: 'Publicación sincronizada' })
    .waitFor()
  async function shot(name) {
    if (process.env.SHOTS) {
      await mkdir(process.env.SHOTS, { recursive: true })
      await page.screenshot({ path: process.env.SHOTS + '/' + name + '.png' })
    }
  }
  for (const [width, height] of [
    [1440, 900],
    [1280, 800],
    [390, 844],
    [320, 568],
  ]) {
    await page.setViewportSize({ width, height })
    await page.reload()
    await page
      .locator('#status')
      .filter({ hasText: 'Publicación sincronizada' })
      .waitFor()
    await page.waitForFunction(
      () => document.querySelector('.cover img').naturalWidth > 0,
    )
    for (const theme of ['light', 'dark']) {
      await page.locator('#theme').selectOption(theme)
      await page.evaluate(() => window.scrollTo(0, 0))
      await shot(width + '-' + theme)
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        'Overflow at ' + width,
      )
    }
    if (width === 390) {
      await page.locator('#phaseList').scrollIntoViewIfNeeded()
      await shot('mobile-phases')
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.reload()
  await page.locator('#theme').selectOption('light')
  await page.locator('#realista').click()
  await page.locator('#chart').scrollIntoViewIfNeeded()
  await shot('realista')
  await page.locator('#comparar').click()
  assert.equal(await page.locator('.secondBar').count(), 7)
  assert.equal(
    await page
      .locator('.baseBar,#baseline,.brief,#milestones,#obState')
      .count(),
    0,
  )
  assert.equal(writes, 0)
  await shot('compare')
  await page.locator('#optimista').click()
  await page.locator('#chart').scrollIntoViewIfNeeded()
  await shot('gantt')
  await page.locator('#chart button.caption').first().click()
  await page.locator('#phaseDialog[open]').waitFor()
  await page.locator('#phaseDialog button').click()
  await page.locator('#diario').scrollIntoViewIfNeeded()
  for (let i = 0; i < 2; i++) {
    await page.locator('#sharePhoto').setInputFiles({
      name: 'obra.png',
      mimeType: 'image/png',
      buffer: await readFile(
        new URL('../assets/icon-192.png', import.meta.url),
      ),
    })
    await page.locator('#addDaily').click()
    await page
      .getByText(
        'Foto enviada. Se publicará cuando la revise el administrador.',
      )
      .waitFor()
  }
  assert.equal(await page.locator('#dailyImages img').count(), 0)
  assert.match(await page.locator('#photoQuota').textContent(), /0 de 3/)
  assert.equal(await page.locator('#photoModeration').isVisible(), false)
  assert.ok(!(await page.locator('#commentForm').isVisible()))
  await shot('diary')
  offline = true
  await page.reload()
  await page
    .locator('#status')
    .filter({ hasText: 'Última publicación disponible' })
    .waitFor()
  await page.evaluate(() => window.scrollTo(0, 0))
  await shot('cached')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page
    .locator('#status')
    .filter({ hasText: 'Calendario orientativo inicial' })
    .waitFor()
  await page.evaluate(() => window.scrollTo(0, 0))
  await shot('fallback')
  offline = false
  await page.reload()
  async function login(password) {
    await page.locator('#email').fill('test@example.test')
    await page.locator('#password').fill(password)
    await page.locator('#enter').click()
  }
  await page.locator('#login').click()
  await login('incorrecta')
  await page.getByText('Correo o contraseña incorrectos.').waitFor()
  uid = '00000000-0000-4000-a000-000000000001'
  await login('fixture')
  await page.getByText('Sesión con acceso de solo lectura.').waitFor()
  assert.equal(await page.locator('.handle').count(), 0)
  await page.locator('#logout').click()
  await page.locator('#login').click()
  uid = owner
  await login('fixture')
  await page.locator('.handle').first().waitFor()
  await page.reload()
  await page.locator('.handle').first().waitFor()
  await page.locator('#admin').scrollIntoViewIfNeeded()
  await page.locator('#pendingPhotos img[src^="data:"]').first().waitFor()
  assert.equal(await page.locator('#pendingPhotos article').count(), 2)
  await page
    .locator('#pendingPhotos')
    .getByRole('button', { name: 'Aprobar' })
    .first()
    .click()
  await page.locator('#dailyImages img[src^="data:"]').waitFor()
  await page
    .locator('#pendingPhotos')
    .getByRole('button', { name: 'Rechazar' })
    .click()
  await page.getByText('No hay fotos pendientes.').waitFor()
  await page.locator('.albumMark').first().click()
  await page.locator('#dailyImages figure button').first().click()
  await page.locator('#photoDialog[open] img').waitFor()
  await page.locator('#photoDialog button').click()
  await shot('admin')
  await page.locator('#chart').scrollIntoViewIfNeeded()
  const handle = await page.locator('.bar .handle').nth(1).boundingBox()
  await page.mouse.move(handle.x + 6, handle.y + 9)
  await page.mouse.down()
  await page.mouse.move(handle.x + 46, handle.y + 9, { steps: 5 })
  await page.mouse.up()
  await page.waitForFunction(
    () =>
      document.querySelector('#status').textContent ===
      'Publicación sincronizada',
  )
  assert.equal(writes, 1)
  assert.ok(published.plans.pesimista[0].d > 4)
  const touch = await page.context().newCDPSession(page)
  await touch.send('Emulation.setTouchEmulationEnabled', { enabled: true })
  const bounds = await page.locator('.bar').first().boundingBox()
  const x = bounds.x + bounds.width / 2,
    y = bounds.y + bounds.height / 2
  for (const [type, points] of [
    ['touchStart', [{ x, y }]],
    ['touchMove', [{ x: x + 44, y }]],
    ['touchEnd', []],
  ]) {
    await touch.send('Input.dispatchTouchEvent', { type, touchPoints: points })
  }
  await page.waitForFunction(
    () =>
      document.querySelector('#status').textContent ===
      'Publicación sincronizada',
  )
  assert.equal(writes, 2)
  assert.ok(published.plans.pesimista[0].s > 0)
  await page.locator('#editor summary').focus()
  await page.keyboard.press('Enter')
  const end = page.locator('#manual input').nth(1)
  await end.focus()
  await end.fill('2027-08')
  await page.keyboard.press('Tab')
  await page.waitForFunction(
    () =>
      document.querySelector('#status').textContent ===
      'Publicación sincronizada',
  )
  assert.equal(writes, 3)
  await page.locator('#commentText').fill('Comentario de prueba')
  await page.locator('#postComment').click()
  await page.locator('.siteComment').waitFor()
  page.once('dialog', (d) => d.accept())
  await page.locator('.siteComment button').click()
  await page.locator('.siteComment').waitFor({ state: 'detached' })
  await page.locator('#newEntry').click()
  await page.locator('#entryTitle').fill('Observación de prueba')
  await page
    .locator('#entryText')
    .fill('Entrada de ensayo en un servicio simulado.')
  await page.locator('#photoFile').setInputFiles({
    name: 'wrong.png',
    mimeType: 'image/png',
    buffer: Buffer.from('invalid'),
  })
  await page.locator('#previewEntry').click()
  await page.locator('#entryError').filter({ hasText: 'formato' }).waitFor()
  await page.locator('#photoFile').setInputFiles({
    name: 'example.png',
    mimeType: 'image/png',
    buffer: await readFile(new URL('../assets/icon-192.png', import.meta.url)),
  })
  await page.locator('#previewEntry').click()
  await page.locator('#publishEntry').waitFor()
  assert.equal(diaryWrites, 0)
  await page.locator('#publishEntry').click()
  await page
    .locator('.entry h3')
    .filter({ hasText: 'Observación de prueba' })
    .waitFor()
  assert.equal(diaryWrites, 1)
  assert.ok(photoPath.endsWith('.jpg'))
  await page.reload()
  await page.locator('.entry h3').waitFor()
  await page
    .locator('#manageEntries button')
    .filter({ hasText: 'Editar' })
    .click()
  await page.locator('#entryTitle').fill('Observación revisada')
  await page.locator('#previewEntry').click()
  await page.locator('#publishEntry').click()
  await page.locator('.entry h3').filter({ hasText: 'revisada' }).waitFor()
  await page.locator('#filter').selectOption('delivery')
  assert.equal(await page.locator('.entry').count(), 0)
  await page.locator('#filter').selectOption('')
  await page.locator('.thumbnail').first().click()
  await page.locator('#photoDialog[open] img').waitFor()
  await page.locator('#photoDialog button').click()
  await page.locator('#diario').scrollIntoViewIfNeeded()
  await shot('diary-published-fixture')
  page.once('dialog', (dialog) => dialog.accept())
  await page
    .locator('#manageEntries button')
    .filter({ hasText: 'Retirar' })
    .click()
  await page.locator('.entry').waitFor({ state: 'detached' })
  assert.equal(diaryWrites, 3)
  await page.locator('#sharePhoto').setInputFiles({
    name: 'tercera.jpg',
    mimeType: 'image/jpeg',
    buffer: await readFile(new URL('fixtures/album.jpg', import.meta.url)),
  })
  await page.locator('#addDaily').click()
  await page.locator('#photoQuota').filter({ hasText: 'completo' }).waitFor()
  assert.equal(await page.locator('#dailyImages figure').count(), 3)
  assert.equal(await page.locator('#addDaily').isDisabled(), true)
  page.once('dialog', (dialog) => dialog.accept())
  await page.locator('#dailyImages .removePhoto').last().click()
  await page.getByText('Foto eliminada.').waitFor()
  await page.waitForFunction(
    () => document.querySelectorAll('#dailyImages figure').length === 2,
  )
  await page.locator('#sharePhoto').setInputFiles({
    name: 'reemplazo.jpg',
    mimeType: 'image/jpeg',
    buffer: await readFile(new URL('fixtures/album.jpg', import.meta.url)),
  })
  await page.locator('#addDaily').click()
  await page.locator('#photoQuota').filter({ hasText: 'completo' }).waitFor()
  const prior = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  dailyPhotos.push({ taken: prior, slot: 1, legacy: null })
  await page.reload()
  await page.locator('#chartAlbum').click()
  await page.locator('#monthDays button').last().click()
  assert.equal(await page.locator('#albumDate').inputValue(), prior)
  await page.locator('#newerDay').click()
  assert.equal(await page.locator('#dailyImages figure').count(), 3)
  await page.locator('#album').scrollIntoViewIfNeeded()
  await shot('album-days')
  await page.locator('#history').click()
  await page.locator('#list button').first().click()
  await page.locator('#apply').click()
  await page.waitForFunction(
    () =>
      document.querySelector('#status').textContent ===
      'Publicación sincronizada',
  )
  assert.equal(writes, 4)
  await page.locator('#logout').click()
  await page.locator('#login').waitFor()
  assert.equal(await page.locator('.handle').count(), 0)
  // Use a second isolated browser context and its own cache, as a new visitor.
  const publicContext = await browser.newContext({ serviceWorkers: 'allow' })
  await publicContext.route('https://*.supabase.co/**', (r) => {
    const path = new URL(r.request().url()).pathname
    return r.fulfill({
      json:
        path === '/rest/v1/schedule'
          ? { state: published, revision: rev, updated_at: stamp }
          : [],
    })
  })
  const other = await publicContext.newPage()
  await other.goto(url)
  await other
    .locator('#status')
    .filter({ hasText: 'Publicación sincronizada' })
    .waitFor()
  assert.equal(await other.locator('.handle').count(), 0)
  await other.evaluate(() => navigator.serviceWorker.ready.then(() => true))
  await other.reload()
  await other.waitForFunction(() => !!navigator.serviceWorker.controller)
  await publicContext.unrouteAll()
  await publicContext.setOffline(true)
  await other.reload()
  await other
    .locator('#status')
    .filter({ hasText: 'Última publicación disponible' })
    .waitFor()
  await other.locator('#comparar').click()
  assert.equal(await other.locator('.secondBar').count(), 7)
  const cached = await other.evaluate(async () => {
    const c = await caches.open(
      (await caches.keys()).find((k) => k.includes('adrio-shell')),
    )
    return (await c.keys()).map((r) => new URL(r.url).pathname)
  })
  assert.ok(
    cached.every(
      (path) =>
        !path.includes('config.js') &&
        !path.includes('/auth/') &&
        !path.includes('/rest/'),
    ),
  )
  const embed = await browser.newPage()
  await embed.route('https://*.supabase.co/**', (route) => route.abort())
  await embed.setContent('<iframe src="' + url + '"></iframe>')
  const framed = embed.frameLocator('iframe')
  await framed.locator('html[hidden]').waitFor({ state: 'attached' })
  assert.equal(await framed.locator('main').isVisible(), false)
  assert.equal(await framed.locator('#status').textContent(), '')
  await embed.close()
  await publicContext.close()
  assert.deepEqual(errors, [])
  console.log(
    'Public/offline, responsive layout, sharing, auth lifecycle, drag and history restore passed (mocked service).',
  )
} finally {
  await browser?.close()
  server.close()
}
