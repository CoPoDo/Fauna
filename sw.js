// Fauna service worker — primarily exists to receive Web Share Target POSTs
// from Google Photos / system share sheet. Sharing photos via Android's share
// intent preserves the original file (including GPS EXIF), bypassing the
// MediaStore redaction that strips location from <input type="file"> picks.

// Bumping VERSION invalidates every old cache on activate so users upgrading
// from an installable-but-broken (data: URL icons) PWA shell get a clean
// slate on next launch.
const VERSION = 'v2';
const SHARE_CACHE = 'fauna-share-' + VERSION;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(n => n !== SHARE_CACHE).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method === 'POST' && url.pathname.endsWith('/share-target')) {
    event.respondWith(handleShare(event.request));
  }
});

async function handleShare(request) {
  const baseUrl = new URL('./', self.location).toString();
  try {
    const formData = await request.formData();
    const files = formData.getAll('photos').filter(f => f && typeof f === 'object' && f.size > 0);
    const cache = await caches.open(SHARE_CACHE);
    // Clear any leftover entries from a prior share so the page only sees this batch
    const keys = await cache.keys();
    await Promise.all(keys.map(k => cache.delete(k)));
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const headers = new Headers({
        'content-type': file.type || 'application/octet-stream',
        'x-fauna-name': encodeURIComponent(file.name || `shared-${i}.jpg`),
        'x-fauna-lm': String(file.lastModified || Date.now())
      });
      await cache.put(`/share-cache/${i}`, new Response(file, { headers }));
    }
    return Response.redirect(`${baseUrl}?shared=${files.length}`, 303);
  } catch (err) {
    return Response.redirect(`${baseUrl}?shared=error&msg=${encodeURIComponent(err.message || 'unknown')}`, 303);
  }
}
