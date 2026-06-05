// Перехватчик fetch/XHR для Fingerprint Pro на fingerprint.com
(function() {
    'use strict';

    // Паттерн для API endpoints fingerprint.com:
    //  - старый агент: короткие пути /r4a0Rd2Xs/, /Vtu1bhY5s/ ...
    //  - demo.fingerprint.com Smart Signals: /api/event/v4/{requestId} (богатый ответ)
    const FP_EVENT_PATTERN = /(fingerprint\.com\/[A-Za-z0-9]{4,12}(\/|\?|$)|\/api\/event\/v\d)/i;

    let capturedData = null;
    let dataSent = false;

    function isFingerprintResponse(data) {
        if (!data) return false;
        // Старый формат (products.{name}.data)
        if (data.products && data.products.identification && data.products.identification.data) {
            return true;
        }
        // Новый v4 Server API формат (demo.fingerprint.com): identification.visitor_id на верхнем уровне
        const ident = data.identification;
        if (ident && (ident.visitor_id || ident.visitorId)) {
            return true;
        }
        return false;
    }

    function sendFingerprintData(data) {
        if (dataSent) return;
        dataSent = true;

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
            // Проверяем Content-Type перед парсингом
            const contentType = response.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
                try {
                    const clone = response.clone();
                    const data = await clone.json();

                    if (isFingerprintResponse(data)) {
                        sendFingerprintData(data);
                    }
                } catch (e) {
                    // Игнорируем ошибки парсинга - не все ответы JSON
                }
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
                // Проверяем Content-Type перед парсингом
                const contentType = this.getResponseHeader('content-type') || '';
                if (!contentType.includes('application/json')) return;

                try {
                    const data = JSON.parse(this.responseText);

                    if (isFingerprintResponse(data)) {
                        sendFingerprintData(data);
                    }
                } catch (e) {
                    // Игнорируем ошибки парсинга
                }
            });
        }
        return originalXHRSend.apply(this, args);
    };
})();
