// Service Worker to fix IPQS fn.fn bug
self.addEventListener('fetch', (event) => {
    const url = event.request.url;

    // Fix fn.fn.us.ipqscdn.com -> fn.us.ipqscdn.com
    if (url.includes('fn.fn.us.ipqscdn.com')) {
        const fixedUrl = url.replace('fn.fn.us.ipqscdn.com', 'fn.us.ipqscdn.com');

        event.respondWith(
            fetch(fixedUrl, {
                method: event.request.method,
                headers: event.request.headers,
                body: event.request.method !== 'GET' ? event.request.body : undefined,
                mode: 'cors',
                credentials: 'omit'
            })
        );
        return;
    }

    event.respondWith(fetch(event.request));
});

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => self.clients.claim());
