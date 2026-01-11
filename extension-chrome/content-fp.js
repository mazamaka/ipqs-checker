// Content script для fingerprint.com - инжектирует перехватчик и слушает события
(function() {
    'use strict';

    console.log('[FP Content] Loading on fingerprint.com...');

    // Инжектируем скрипт в страницу
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('injected-fp.js');
    script.onload = function() {
        this.remove();
    };
    (document.head || document.documentElement).appendChild(script);

    // Слушаем событие от injected-fp.js
    window.addEventListener('fingerprint-data', function(e) {
        const data = e.detail;
        console.log('[FP Content] Received Fingerprint data, sending to background...');

        // Отправляем в background script
        chrome.runtime.sendMessage({
            type: 'FINGERPRINT_DATA',
            data: data
        });
    });

    console.log('[FP Content] Ready');
})();
