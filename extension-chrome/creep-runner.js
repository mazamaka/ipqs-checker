// CreepJS Runner - загружает и выполняет CreepJS, собирает результаты
(async function() {
    'use strict';

    const CREEP_JS_URL = 'https://abrahamjuliot.github.io/creepjs/creep.js';
    const CREEP_CSS_URL = 'https://abrahamjuliot.github.io/creepjs/style.min.css';

    const statusBar = document.getElementById('statusBar');
    const statusText = document.getElementById('statusText');
    const spinner = document.getElementById('spinner');
    const versionText = document.getElementById('versionText');
    const updateBtn = document.getElementById('updateBtn');

    let creepJSVersion = 'bundled';
    let isFromCache = false;

    function setStatus(text, type = 'loading') {
        statusText.textContent = text;
        statusBar.className = 'status-bar ' + type;
        if (type !== 'loading') {
            spinner.style.display = 'none';
        }
    }

    // Получить URL для загрузки CreepJS (remote или bundled)
    async function getCreepJSUrl() {
        // Проверяем доступность remote версии
        try {
            setStatus('Проверка свежей версии CreepJS...', 'loading');
            const response = await fetch(CREEP_JS_URL, {
                method: 'HEAD',
                cache: 'no-cache',
                signal: AbortSignal.timeout(5000)
            });

            if (response.ok) {
                console.log('[CreepJS] Используем remote версию');
                creepJSVersion = new Date().toISOString().split('T')[0];
                return { url: CREEP_JS_URL, type: 'remote' };
            }
        } catch (e) {
            console.log('[CreepJS] Remote недоступен:', e.message);
        }

        // Fallback на bundled версию
        console.log('[CreepJS] Используем bundled версию');
        creepJSVersion = 'bundled';
        return { url: chrome.runtime.getURL('creep-bundled.js'), type: 'bundled' };
    }

    // Загрузить CSS стили CreepJS
    async function loadCreepCSS() {
        try {
            const response = await fetch(CREEP_CSS_URL, {
                cache: 'no-cache',
                signal: AbortSignal.timeout(5000)
            });
            if (response.ok) {
                const css = await response.text();
                const style = document.createElement('style');
                style.textContent = css;
                document.head.appendChild(style);
            }
        } catch (e) {
            console.log('[CreepJS] CSS не загружен, используем базовые стили');
        }
    }

    // Парсинг результатов из DOM
    function parseCreepJSResults() {
        const results = {
            fpId: null,
            fuzzyHash: null,
            timeMs: null,
            headless: {},
            resistance: {},
            webgl: {},
            canvas: {},
            audio: {},
            screen: {},
            worker: {},
            timezone: {},
            navigator: {},
            raw: {}
        };

        try {
            // FP ID
            const fpHeader = document.querySelector('.fingerprint-header .ellipsis-all');
            if (fpHeader) {
                const match = fpHeader.textContent.match(/FP ID:\s*([a-f0-9]+)/i);
                if (match) results.fpId = match[1];
            }

            // Fuzzy hash
            const fuzzyEl = document.querySelector('.fuzzy-fp');
            if (fuzzyEl) {
                const match = fuzzyEl.textContent.match(/Fuzzy:\s*([a-f0-9]+)/i);
                if (match) results.fuzzyHash = match[1];
            }

            // Time
            const timeEl = document.querySelector('.time');
            if (timeEl) {
                const match = timeEl.textContent.match(/(\d+)\s*ms/);
                if (match) results.timeMs = parseInt(match[1]);
            }

            // Headless detection
            const headlessSection = document.getElementById('headless-resistance-detection');
            if (headlessSection) {
                const headlessDiv = headlessSection.querySelector('.col-six:first-child');
                if (headlessDiv) {
                    const text = headlessDiv.textContent;

                    const chromiumMatch = text.match(/chromium:\s*(\w+)/i);
                    if (chromiumMatch) results.headless.chromium = chromiumMatch[1];

                    const likeHeadlessMatch = text.match(/(\d+)%\s*like headless/i);
                    if (likeHeadlessMatch) results.headless.likeHeadless = parseInt(likeHeadlessMatch[1]);

                    const headlessMatch = text.match(/(\d+)%\s*headless:/i);
                    if (headlessMatch) results.headless.headless = parseInt(headlessMatch[1]);

                    const stealthMatch = text.match(/(\d+)%\s*stealth/i);
                    if (stealthMatch) results.headless.stealth = parseInt(stealthMatch[1]);
                }

                // Resistance
                const resistanceDiv = headlessSection.querySelector('.col-six:last-child');
                if (resistanceDiv) {
                    const text = resistanceDiv.textContent;

                    const privacyMatch = text.match(/privacy:\s*(\w+)/i);
                    if (privacyMatch) results.resistance.privacy = privacyMatch[1];

                    const securityMatch = text.match(/security:\s*(\w+)/i);
                    if (securityMatch) results.resistance.security = securityMatch[1];

                    const modeMatch = text.match(/mode:\s*(\w+)/i);
                    if (modeMatch) results.resistance.mode = modeMatch[1];

                    const extensionMatch = text.match(/extension:\s*(\w+)/i);
                    if (extensionMatch) results.resistance.extension = extensionMatch[1];
                }
            }

            // Собираем все блоки данных
            const allBlocks = document.querySelectorAll('.flex-grid');
            allBlocks.forEach(block => {
                const strong = block.querySelector('strong');
                if (!strong) return;

                const section = strong.textContent.toLowerCase().trim();
                const blockText = block.querySelector('.block-text');

                if (blockText) {
                    results.raw[section] = blockText.textContent.trim();
                }
            });

        } catch (e) {
            console.error('[CreepJS] Ошибка парсинга:', e);
        }

        return results;
    }

    // Ждём завершения расчёта fingerprint
    function waitForCompletion(timeout = 60000) {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();

            const check = () => {
                const fpHeader = document.querySelector('.fingerprint-header .ellipsis-all');

                if (fpHeader && !fpHeader.textContent.includes('Computing')) {
                    // Fingerprint готов
                    setTimeout(() => {
                        resolve(parseCreepJSResults());
                    }, 500); // Даём немного времени на рендер
                    return;
                }

                if (Date.now() - startTime > timeout) {
                    reject(new Error('Таймаут ожидания CreepJS'));
                    return;
                }

                setTimeout(check, 500);
            };

            check();
        });
    }

    // Отправка результатов в background
    function sendResults(results) {
        chrome.runtime.sendMessage({
            type: 'CREEPJS_DATA',
            data: {
                ...results,
                version: creepJSVersion,
                fromCache: isFromCache,
                timestamp: Date.now()
            }
        });
    }

    // Обновить CreepJS вручную (просто перезагружает страницу)
    function forceUpdate() {
        updateBtn.disabled = true;
        updateBtn.textContent = 'Перезагрузка...';
        location.reload();
    }

    // Главная функция
    async function main() {
        try {
            setStatus('Загрузка CreepJS...', 'loading');

            // Загружаем CSS и получаем URL для JS
            const [creepInfo] = await Promise.all([
                getCreepJSUrl(),
                loadCreepCSS()
            ]);

            // Показываем версию
            const typeLabel = creepInfo.type === 'bundled' ? ' (встроенный)' : '';
            versionText.textContent = `CreepJS: ${creepJSVersion}${typeLabel}`;
            updateBtn.style.display = 'inline-block';
            updateBtn.onclick = forceUpdate;

            setStatus('Выполнение fingerprint...', 'loading');

            // Загружаем CreepJS через script.src (не inline!)
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = creepInfo.url;
                script.onload = resolve;
                script.onerror = () => reject(new Error('Не удалось загрузить скрипт'));
                document.body.appendChild(script);
            });

            // Ждём результат
            const results = await waitForCompletion();

            if (results.fpId) {
                setStatus(`Готово! FP ID: ${results.fpId.substring(0, 16)}...`, 'success');
                sendResults(results);
            } else {
                setStatus('Fingerprint получен, но ID не найден', 'error');
                sendResults(results);
            }

        } catch (error) {
            console.error('[CreepJS] Ошибка:', error);
            setStatus('Ошибка: ' + error.message, 'error');

            chrome.runtime.sendMessage({
                type: 'CREEPJS_ERROR',
                error: error.message
            });
        }
    }

    // Запускаем
    main();
})();
