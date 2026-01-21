// Injected script для AntCpt - перехватывает reCAPTCHA v3 score
(function() {
    'use strict';

    console.log('[AntCpt Injected] Инициализация перехвата');

    let verifyResult = null;
    let ipResult = null;
    let uaResult = null;
    const startTime = Date.now();

    // Функция отправки результатов
    function sendResults() {
        if (!verifyResult) {
            console.log('[AntCpt Injected] Ждём verify.php...');
            return;
        }

        const elapsed = Date.now() - startTime;
        console.log('[AntCpt Injected] Отправка результатов, время:', elapsed, 'ms');

        const data = {
            // reCAPTCHA v3 score (основные данные)
            score: verifyResult.score,
            success: verifyResult.success,
            action: verifyResult.action,
            hostname: verifyResult.hostname,
            challenge_ts: verifyResult.challenge_ts,

            // IP адрес
            ip: ipResult?.ip || null,

            // User-Agent (из navigator)
            userAgent: navigator.userAgent,
            platform: navigator.platform,
            language: navigator.language,
            languages: navigator.languages,

            // Screen info
            screen: {
                width: screen.width,
                height: screen.height,
                availWidth: screen.availWidth,
                availHeight: screen.availHeight,
                colorDepth: screen.colorDepth,
                pixelRatio: window.devicePixelRatio
            },

            // Timezone
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            timezoneOffset: new Date().getTimezoneOffset(),

            // Hardware
            hardwareConcurrency: navigator.hardwareConcurrency,
            deviceMemory: navigator.deviceMemory,
            maxTouchPoints: navigator.maxTouchPoints,

            // WebGL info (quick fingerprint)
            webgl: getWebGLInfo(),

            // Время проверки
            checkTime: elapsed,
            timestamp: Date.now()
        };

        window.dispatchEvent(new CustomEvent('antcpt-result', { detail: data }));
    }

    // Получение WebGL info
    function getWebGLInfo() {
        try {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            if (!gl) return null;

            const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
            return {
                vendor: debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
                renderer: debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
                version: gl.getParameter(gl.VERSION)
            };
        } catch (e) {
            return null;
        }
    }

    // Перехват fetch
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        const [url, options] = args;
        const urlStr = typeof url === 'string' ? url : url?.url || '';

        const response = await originalFetch.apply(this, args);

        // Перехватываем verify.php (основной результат)
        if (urlStr.includes('verify.php')) {
            try {
                const clone = response.clone();
                const data = await clone.json();
                console.log('[AntCpt Injected] verify.php ответ:', data);
                verifyResult = data;

                // Даём небольшую задержку для getMyIp
                setTimeout(sendResults, 500);
            } catch (e) {
                console.error('[AntCpt Injected] Ошибка парсинга verify.php:', e);
            }
        }

        // Перехватываем getMyIp.php
        if (urlStr.includes('getMyIp.php')) {
            try {
                const clone = response.clone();
                const data = await clone.json();
                console.log('[AntCpt Injected] getMyIp.php ответ:', data);
                ipResult = data;
            } catch (e) {
                console.error('[AntCpt Injected] Ошибка парсинга getMyIp.php:', e);
            }
        }

        return response;
    };

    // Перехват XHR (jQuery использует XHR)
    const originalXHROpen = XMLHttpRequest.prototype.open;
    const originalXHRSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
        this._url = url;
        return originalXHROpen.apply(this, [method, url, ...rest]);
    };

    XMLHttpRequest.prototype.send = function(...args) {
        const xhr = this;
        const url = this._url || '';

        xhr.addEventListener('load', function() {
            try {
                // Перехватываем verify.php
                if (url.includes('verify.php')) {
                    const data = JSON.parse(xhr.responseText);
                    console.log('[AntCpt Injected] XHR verify.php ответ:', data);
                    verifyResult = data;
                    setTimeout(sendResults, 500);
                }

                // Перехватываем getMyIp.php
                if (url.includes('getMyIp.php')) {
                    const data = JSON.parse(xhr.responseText);
                    console.log('[AntCpt Injected] XHR getMyIp.php ответ:', data);
                    ipResult = data;
                }
            } catch (e) {
                // Не JSON ответ - игнорируем
            }
        });

        return originalXHRSend.apply(this, args);
    };

    // Таймаут на случай если verify.php не вызывается автоматически
    setTimeout(() => {
        if (!verifyResult) {
            console.log('[AntCpt Injected] Таймаут ожидания verify.php');
            window.dispatchEvent(new CustomEvent('antcpt-error', {
                detail: { error: 'Таймаут ожидания результата reCAPTCHA' }
            }));
        }
    }, 60000);

    console.log('[AntCpt Injected] Перехват настроен');
})();
