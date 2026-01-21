// Content script для AntCpt - перехватывает reCAPTCHA v3 score с antcpt.com/score_detector/
(function() {
    'use strict';

    console.log('[AntCpt Content] Загружен на', location.href);

    // Инжектим скрипт для перехвата fetch/XHR
    function injectScript() {
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL('injected-antcpt.js');
        script.onload = function() {
            this.remove();
        };
        (document.head || document.documentElement).appendChild(script);
    }

    // Слушаем событие от injected скрипта
    window.addEventListener('antcpt-result', (event) => {
        const data = event.detail;
        console.log('[AntCpt Content] Получены данные:', data);

        // Отправляем в background
        chrome.runtime.sendMessage({
            type: 'ANTCPT_DATA',
            data: data
        }, (response) => {
            console.log('[AntCpt Content] Background ответил:', response);
        });
    });

    // Также слушаем ошибки
    window.addEventListener('antcpt-error', (event) => {
        console.error('[AntCpt Content] Ошибка:', event.detail);
        chrome.runtime.sendMessage({
            type: 'ANTCPT_ERROR',
            error: event.detail.error || 'Unknown error'
        });
    });

    // Инжектим скрипт
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectScript);
    } else {
        injectScript();
    }
})();
