// CreepJS Runner - загружает и выполняет CreepJS, собирает результаты
(async function() {
    'use strict';

    const CREEP_JS_URL = 'https://abrahamjuliot.github.io/creepjs/creep.js';
    const CREEP_CSS_URL = 'https://abrahamjuliot.github.io/creepjs/style.min.css';
    const CACHE_KEY = 'creepjs_cache';
    const CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 часа

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

    // Получить CreepJS код (из кэша, с сервера или bundled)
    async function getCreepJSCode() {
        // 1. Проверяем кэш
        try {
            const data = await chrome.storage.local.get(CACHE_KEY);
            if (data[CACHE_KEY]) {
                const cached = data[CACHE_KEY];
                const age = Date.now() - cached.timestamp;
                if (age < CACHE_EXPIRY) {
                    console.log('[CreepJS] Используем кэшированную версию');
                    isFromCache = true;
                    creepJSVersion = cached.version || 'cached';
                    return cached.code;
                }
            }
        } catch (e) {
            console.log('[CreepJS] Ошибка чтения кэша:', e);
        }

        // 2. Пробуем загрузить свежую версию
        try {
            setStatus('Загрузка свежей версии CreepJS...', 'loading');
            const response = await fetch(CREEP_JS_URL, {
                cache: 'no-cache',
                signal: AbortSignal.timeout(10000)
            });

            if (response.ok) {
                const code = await response.text();
                const version = new Date().toISOString().split('T')[0];

                // Сохраняем в кэш
                await chrome.storage.local.set({
                    [CACHE_KEY]: {
                        code: code,
                        timestamp: Date.now(),
                        version: version
                    }
                });

                console.log('[CreepJS] Загружена свежая версия');
                creepJSVersion = version;
                return code;
            }
        } catch (e) {
            console.log('[CreepJS] Не удалось загрузить с сервера:', e);
        }

        // 3. Fallback на bundled версию
        try {
            setStatus('Загрузка встроенной версии...', 'loading');
            const bundledUrl = chrome.runtime.getURL('creep-bundled.js');
            const response = await fetch(bundledUrl);
            const code = await response.text();
            creepJSVersion = 'bundled';
            console.log('[CreepJS] Используем bundled версию');
            return code;
        } catch (e) {
            throw new Error('Не удалось загрузить CreepJS');
        }
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

    // Обновить CreepJS вручную
    async function forceUpdate() {
        updateBtn.disabled = true;
        updateBtn.textContent = 'Обновление...';

        try {
            const response = await fetch(CREEP_JS_URL, {
                cache: 'no-cache',
                signal: AbortSignal.timeout(15000)
            });

            if (response.ok) {
                const code = await response.text();
                const version = new Date().toISOString().split('T')[0];

                await chrome.storage.local.set({
                    [CACHE_KEY]: {
                        code: code,
                        timestamp: Date.now(),
                        version: version
                    }
                });

                versionText.textContent = `CreepJS: ${version} (обновлено)`;
                updateBtn.textContent = 'Обновлено!';
                updateBtn.style.background = 'rgba(46, 213, 115, 0.3)';

                setTimeout(() => {
                    location.reload();
                }, 1000);
            }
        } catch (e) {
            updateBtn.textContent = 'Ошибка';
            setTimeout(() => {
                updateBtn.textContent = 'Обновить';
                updateBtn.disabled = false;
            }, 2000);
        }
    }

    // Главная функция
    async function main() {
        try {
            setStatus('Загрузка CreepJS...', 'loading');

            // Загружаем CSS и JS параллельно
            const [creepCode] = await Promise.all([
                getCreepJSCode(),
                loadCreepCSS()
            ]);

            // Показываем версию
            const cacheLabel = isFromCache ? ' (из кэша)' : '';
            versionText.textContent = `CreepJS: ${creepJSVersion}${cacheLabel}`;
            updateBtn.style.display = 'inline-block';
            updateBtn.onclick = forceUpdate;

            setStatus('Выполнение fingerprint...', 'loading');

            // Выполняем CreepJS
            const script = document.createElement('script');
            script.textContent = creepCode;
            document.body.appendChild(script);

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
