// Перехватчик fetch/XHR для Fingerprint Pro на fingerprint.com
(function() {
    'use strict';

    // Паттерн для API endpoints fingerprint.com
    // Они используют короткие случайные пути типа /HNCm0CwV/, /L9VR/, /r4a0Rd2Xs/?ci=...
    // Примеры из анализа: Vtu1bhY5s, r4a0Rd2Xs, sdub4ver, NsV02kcx, cpaJ, DRDgIsvG, CToT
    const FP_EVENT_PATTERN = /fingerprint\.com\/[A-Za-z0-9]{4,12}(\/|\?|$)/i;

    let capturedData = null;
    let dataSent = false;

    function isFingerprintResponse(data) {
        // Проверяем что это ответ с products (event endpoint)
        return data &&
               data.products &&
               data.products.identification &&
               data.products.identification.data;
    }

    function sendFingerprintData(data) {
        if (dataSent) return;
        dataSent = true;

        console.log('[FP Interceptor] Captured Fingerprint Pro data:', data);

        // Отправляем данные через CustomEvent
        window.dispatchEvent(new CustomEvent('fingerprint-data', {
            detail: data
        }));
    }

    // Перехват fetch
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        const response = await originalFetch.apply(this, args);
        const url = args[0]?.url || args[0];

        if (typeof url === 'string' && FP_EVENT_PATTERN.test(url)) {
            try {
                const clone = response.clone();
                const data = await clone.json();

                if (isFingerprintResponse(data)) {
                    sendFingerprintData(data);
                }
            } catch (e) {
                console.error('[FP Interceptor] Parse error:', e);
            }
        }
        return response;
    };

    // Перехват XMLHttpRequest
    const originalXHROpen = XMLHttpRequest.prototype.open;
    const originalXHRSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
        this._fpUrl = url;
        return originalXHROpen.apply(this, [method, url, ...rest]);
    };

    XMLHttpRequest.prototype.send = function(...args) {
        if (this._fpUrl && FP_EVENT_PATTERN.test(this._fpUrl)) {
            this.addEventListener('load', function() {
                try {
                    const data = JSON.parse(this.responseText);

                    if (isFingerprintResponse(data)) {
                        sendFingerprintData(data);
                    }
                } catch (e) {
                    console.error('[FP Interceptor] XHR parse error:', e);
                }
            });
        }
        return originalXHRSend.apply(this, args);
    };

    console.log('[FP Interceptor] Initialized for fingerprint.com');
})();
