// Content script для Chrome - инжектирует перехватчик и слушает события
(function() {
    'use strict';

    console.log('[IPQS Content] Loading...');

    // Инжектируем скрипт в страницу
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('injected.js');
    script.onload = function() {
        this.remove();
    };
    (document.head || document.documentElement).appendChild(script);

    // Слушаем событие от injected.js
    window.addEventListener('ipqs-fingerprint', function(e) {
        const data = e.detail;
        console.log('[IPQS Content] Received fingerprint, sending to background...');
        
        // Отправляем в background script
        chrome.runtime.sendMessage({
            type: 'IPQS_FINGERPRINT',
            data: data
        });
    });

    console.log('[IPQS Content] Ready');
})();
