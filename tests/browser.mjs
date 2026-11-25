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
  let published = legacy
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
    if (path === '/auth/v1/logout') return send({})
    if (path === '/rest/v1/rpc/adrio_is_admin') return send(uid === owner)
    if (path === '/rest/v1/rpc/adrio_publish') {
      writes++
      published = req.postDataJSON().proposed
      return send({ revision: ++rev, updated_at: stamp })
    }
    if (path === '/rest/v1/rpc/adrio_history')
      return send([{ revision: 0, state: legacy, updated_at: stamp }])
    throw Error(path)
  })
  const url = 'http://127.0.0.1:' + server.address().port + '/'
  await page.goto(url + '?access_token=fixture#sensitive')
  await page.getByText(/Sin conexión · calendario inicial/).waitFor()
  await page.locator('#pesimista').click()
  assert.equal(
    await page.locator('#pesimista').getAttribute('aria-pressed'),
    'true',
  )
  for (let i = 0; i < 3; i++) {
    await page.locator('#optimista').click()
    await page.locator('#pesimista').click()
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
    url + '?escenario=pesimista',
  )
  offline = false
  await page.reload()
  await page.getByText('Publicación sincronizada').waitFor()
  if (process.env.SHOTS) {
    await mkdir(process.env.SHOTS, { recursive: true })
    await page.screenshot({
      path: process.env.SHOTS + '/desktop.png',
      fullPage: true,
    })
  }
  await page.setViewportSize({ width: 390, height: 844 })
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  )
  if (process.env.SHOTS)
    await page.screenshot({
      path: process.env.SHOTS + '/mobile.png',
      fullPage: true,
    })
  await page.setViewportSize({ width: 1440, height: 1000 })
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
  assert.ok(published.plans.optimista[0].d > 3)
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
  assert.ok(published.plans.optimista[0].s > 0)
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
  assert.deepEqual(errors, [])
  console.log(
    'Public/offline, responsive layout, sharing, auth lifecycle, drag and history restore passed (mocked service).',
  )
} finally {
  await browser?.close()
  server.close()
}
