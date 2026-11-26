// Only public, same-origin application assets. Never store config, API responses,
// uploaded photos, form data or a navigation URL containing user parameters.
const scope = new URL(self.registration.scope)
const prefix = 'adrio-shell:' + scope.pathname + ':'
const version = prefix + 'album-2'
const paths = [
  'index.html',
  'style.css',
  'vendor/supabase-2.119.2.js',
  'assets/section.svg',
  'manifest.webmanifest',
  'assets/icon-192.png',
  'assets/icon-512.png',
  ...[
    'app',
    'portal',
    'moderation',
    'backend',
    'chart',
    'schedule',
    'sync',
    'overview',
    'diary',
    'album',
    'photos',
    'phases',
  ].map((n) => 'src/' + n + '.js'),
]
const urls = new Set(paths.map((p) => new URL(p, scope).href))
self.addEventListener('install', (event) =>
  event.waitUntil(
    caches
      .open(version)
      .then((cache) =>
        cache.addAll(
          [...urls].map(
            (u) => new Request(u, { cache: 'reload', credentials: 'omit' }),
          ),
        ),
      ),
  ),
)
self.addEventListener('activate', (event) =>
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith(prefix) && k !== version)
            .map((k) => caches.delete(k)),
        ),
      ),
  ),
)
self.addEventListener('fetch', (event) => {
  const req = event.request,
    url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== scope.origin) return
  const navigation =
    req.mode === 'navigate' &&
    [scope.pathname, scope.pathname + 'index.html'].includes(url.pathname)
  url.search = ''
  url.hash = ''
  if (!navigation && !urls.has(url.href)) return
  event.respondWith(
    fetch(req).catch(async () => {
      const cache = await caches.open(version),
        hit = await cache.match(
          navigation ? new URL('index.html', scope).href : url.href,
        )
      return hit ?? Response.error()
    }),
  )
})
