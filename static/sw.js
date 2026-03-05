const SW_VERSION = "v1";
const APP_SHELL_CACHE = `app-shell-${SW_VERSION}`;
const STATIC_CACHE = `static-${SW_VERSION}`;

const APP_SHELL_ASSETS = ["/", "/static/style.css", "/static/script.js", "/static/manifest.webmanifest"];

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(APP_SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL_ASSETS))
    );
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys
                    .filter((key) => ![APP_SHELL_CACHE, STATIC_CACHE].includes(key))
                    .map((key) => caches.delete(key))
            )
        )
    );
    self.clients.claim();
});

self.addEventListener("fetch", (event) => {
    if (event.request.method !== "GET") {
        return;
    }

    const url = new URL(event.request.url);
    if (url.origin !== self.location.origin) {
        return;
    }

    if (event.request.mode === "navigate") {
        event.respondWith(
            fetch(event.request).catch(async () => {
                const cached = await caches.match("/");
                return cached || Response.error();
            })
        );
        return;
    }

    if (url.pathname.startsWith("/static/")) {
        event.respondWith(
            caches.open(STATIC_CACHE).then(async (cache) => {
                const cached = await cache.match(event.request);
                const networkPromise = fetch(event.request)
                    .then((response) => {
                        if (response && response.ok) {
                            cache.put(event.request, response.clone());
                        }
                        return response;
                    })
                    .catch(() => cached);

                return cached || networkPromise;
            })
        );
    }
});
