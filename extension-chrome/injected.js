// Перехватчик fetch/XHR для IPQS
(function() {
    'use strict';

    const IPQS_PATTERN = /ipqscdn\.com.*learn\/fetch/i;

    // Перехват fetch
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        const response = await originalFetch.apply(this, args);
        const url = args[0]?.url || args[0];

        if (typeof url === 'string' && IPQS_PATTERN.test(url)) {
            try {
                const clone = response.clone();
                const data = await clone.json();
                console.log('[IPQS Interceptor] Captured fingerprint:', data);
                
                // Отправляем данные через CustomEvent
                window.dispatchEvent(new CustomEvent('ipqs-fingerprint', {
                    detail: data
                }));
            } catch (e) {
                console.error('[IPQS Interceptor] Parse error:', e);
            }
        }
        return response;
    };

    // Перехват XMLHttpRequest
    const originalXHROpen = XMLHttpRequest.prototype.open;
    const originalXHRSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
        this._ipqsUrl = url;
        return originalXHROpen.apply(this, [method, url, ...rest]);
    };

    XMLHttpRequest.prototype.send = function(...args) {
        if (this._ipqsUrl && IPQS_PATTERN.test(this._ipqsUrl)) {
            this.addEventListener('load', function() {
                try {
                    const data = JSON.parse(this.responseText);
                    console.log('[IPQS Interceptor] Captured XHR fingerprint:', data);
                    
                    window.dispatchEvent(new CustomEvent('ipqs-fingerprint', {
                        detail: data
                    }));
                } catch (e) {
                    console.error('[IPQS Interceptor] XHR parse error:', e);
                }
            });
        }
        return originalXHRSend.apply(this, args);
    };

    console.log('[IPQS Interceptor] Initialized');
})();
