// Content script для CreepJS - парсит результаты с abrahamjuliot.github.io/creepjs
(function() {
    'use strict';

    console.log('[CreepJS Content] Загружен на', location.href);

    // Ждём завершения CreepJS и парсим результаты
    async function waitAndParse() {
        const maxWait = 60000; // 60 секунд максимум
        const checkInterval = 500;
        const startTime = Date.now();

        while (Date.now() - startTime < maxWait) {
            // Ищем FP ID - главный индикатор завершения
            const fpEl = document.querySelector('#fingerprint-data .visitor-id, .fingerprint-header .ellipsis-all');
            const fpMatch = fpEl?.textContent?.match(/([a-f0-9]{64})/i);

            // Также проверяем наличие секции headless
            const headlessSection = document.getElementById('headless-detection') ||
                                   document.querySelector('[data-type="headless"]') ||
                                   document.querySelector('.headless-detection');

            if (fpMatch) {
                console.log('[CreepJS Content] Найден FP ID:', fpMatch[1].substring(0, 16) + '...');

                // Даём ещё немного времени для рендера всех секций
                await new Promise(r => setTimeout(r, 2000));

                const results = parseResults();
                sendResults(results);
                return;
            }

            await new Promise(r => setTimeout(r, checkInterval));
        }

        console.log('[CreepJS Content] Таймаут ожидания результатов');
        chrome.runtime.sendMessage({
            type: 'CREEPJS_ERROR',
            error: 'Таймаут ожидания результатов CreepJS'
        });
    }

    // Парсинг всех результатов из DOM
    function parseResults() {
        const results = {
            fpId: null,
            visitorId: null,
            fuzzyHash: null,
            timeMs: null,
            headless: {
                stealth: null,
                likeHeadless: null,
                headlessPercent: null,
                stealthRating: null
            },
            resistance: {
                privacy: null,
                security: null,
                mode: null,
                extension: null
            },
            lies: {
                count: 0,
                list: []
            },
            trash: {
                count: 0,
                list: []
            },
            fingerprints: {
                canvas: null,
                webgl: null,
                audio: null,
                fonts: null,
                screen: null,
                cssMedia: null
            },
            hardware: {
                gpu: null,
                cpuCores: null,
                memory: null,
                platform: null
            },
            browser: {
                userAgent: null,
                vendor: null,
                language: null,
                timezone: null
            },
            network: {
                webrtc: null,
                connection: null
            },
            rawSections: {}
        };

        try {
            // FP ID (главный идентификатор)
            const fpEl = document.querySelector('#fingerprint-data .visitor-id, .fingerprint-header .ellipsis-all, [class*="fingerprint"] [class*="id"]');
            const fpMatch = fpEl?.textContent?.match(/([a-f0-9]{64})/i);
            if (fpMatch) results.fpId = fpMatch[1];

            // Visitor ID (если отличается)
            const visitorEl = document.querySelector('.visitor-id, [data-visitor-id]');
            if (visitorEl) {
                const vMatch = visitorEl.textContent.match(/([a-f0-9]{32,64})/i);
                if (vMatch) results.visitorId = vMatch[1];
            }

            // Fuzzy hash
            const fuzzyEl = document.querySelector('.fuzzy-fingerprint, [class*="fuzzy"], .trust-score');
            if (fuzzyEl) {
                const fMatch = fuzzyEl.textContent.match(/([a-f0-9]{64})/i);
                if (fMatch) results.fuzzyHash = fMatch[1];
            }

            // Time
            const timeEl = document.querySelector('.fingerprint-time, [class*="time"], .perf-time');
            if (timeEl) {
                const tMatch = timeEl.textContent.match(/(\d+)\s*ms/i);
                if (tMatch) results.timeMs = parseInt(tMatch[1]);
            }

            // === HEADLESS DETECTION ===
            const headlessSection = document.getElementById('headless-detection') ||
                                   document.querySelector('[id*="headless"]');
            if (headlessSection) {
                // Stealth rating
                const stealthEl = headlessSection.querySelector('[class*="stealth"], .stealth-rating');
                if (stealthEl) {
                    const sMatch = stealthEl.textContent.match(/(\d+(?:\.\d+)?)/);
                    if (sMatch) results.headless.stealth = parseFloat(sMatch[1]);
                }

                // Like headless %
                const likeEl = headlessSection.querySelector('[class*="like-headless"], .like-headless');
                if (likeEl) {
                    const lMatch = likeEl.textContent.match(/(\d+(?:\.\d+)?)/);
                    if (lMatch) results.headless.likeHeadless = parseFloat(lMatch[1]);
                }

                // Headless %
                const hpEl = headlessSection.querySelector('[class*="headless-percent"], .headless-rating');
                if (hpEl) {
                    const hMatch = hpEl.textContent.match(/(\d+(?:\.\d+)?)/);
                    if (hMatch) results.headless.headlessPercent = parseFloat(hMatch[1]);
                }

                results.rawSections.headless = headlessSection.innerText.substring(0, 2000);
            }

            // === RESISTANCE ===
            const resistanceSection = document.getElementById('resistance') ||
                                      document.querySelector('[id*="resistance"]');
            if (resistanceSection) {
                const text = resistanceSection.innerText.toLowerCase();

                // Privacy
                if (text.includes('privacy')) {
                    const privacyMatch = text.match(/privacy[:\s]+([a-z]+)/i);
                    if (privacyMatch) results.resistance.privacy = privacyMatch[1];
                }

                // Security
                if (text.includes('security')) {
                    const secMatch = text.match(/security[:\s]+([a-z]+)/i);
                    if (secMatch) results.resistance.security = secMatch[1];
                }

                // Mode
                if (text.includes('mode')) {
                    const modeMatch = text.match(/mode[:\s]+([a-z]+)/i);
                    if (modeMatch) results.resistance.mode = modeMatch[1];
                }

                // Extension detection
                if (text.includes('extension')) {
                    results.resistance.extension = text.includes('extension detected') ||
                                                   text.includes('extensions: true');
                }

                results.rawSections.resistance = resistanceSection.innerText.substring(0, 2000);
            }

            // === LIES (подмены) ===
            const liesSection = document.getElementById('lies') ||
                               document.querySelector('[id*="lies"], [class*="lies"]');
            if (liesSection) {
                const lieItems = liesSection.querySelectorAll('li, .lie-item, [class*="lie"]');
                results.lies.count = lieItems.length;
                lieItems.forEach(li => {
                    const text = li.textContent.trim();
                    if (text && text.length < 200) {
                        results.lies.list.push(text);
                    }
                });
                results.rawSections.lies = liesSection.innerText.substring(0, 2000);
            }

            // === TRASH (аномалии) ===
            const trashSection = document.getElementById('trash') ||
                                document.querySelector('[id*="trash"], [class*="trash"]');
            if (trashSection) {
                const trashItems = trashSection.querySelectorAll('li, .trash-item');
                results.trash.count = trashItems.length;
                trashItems.forEach(ti => {
                    const text = ti.textContent.trim();
                    if (text && text.length < 200) {
                        results.trash.list.push(text);
                    }
                });
                results.rawSections.trash = trashSection.innerText.substring(0, 2000);
            }

            // === CANVAS ===
            const canvasSection = document.getElementById('canvas') ||
                                 document.querySelector('[id*="canvas-2d"], [id*="canvas"]');
            if (canvasSection) {
                results.fingerprints.canvas = canvasSection.innerText.substring(0, 1000);
            }

            // === WebGL ===
            const webglSection = document.getElementById('webgl') ||
                                document.querySelector('[id*="webgl"]');
            if (webglSection) {
                const gpuMatch = webglSection.innerText.match(/ANGLE[^)]+\)/i) ||
                               webglSection.innerText.match(/renderer[:\s]+([^\n]+)/i);
                if (gpuMatch) results.hardware.gpu = gpuMatch[0];
                results.fingerprints.webgl = webglSection.innerText.substring(0, 1000);
            }

            // === Audio ===
            const audioSection = document.getElementById('audio') ||
                                document.querySelector('[id*="audio"]');
            if (audioSection) {
                results.fingerprints.audio = audioSection.innerText.substring(0, 500);
            }

            // === Navigator ===
            const navSection = document.getElementById('navigator') ||
                              document.querySelector('[id*="navigator"]');
            if (navSection) {
                const text = navSection.innerText;

                // User Agent
                const uaMatch = text.match(/userAgent[:\s]+([^\n]+)/i);
                if (uaMatch) results.browser.userAgent = uaMatch[1].trim();

                // Platform
                const platMatch = text.match(/platform[:\s]+([^\n]+)/i);
                if (platMatch) results.hardware.platform = platMatch[1].trim();

                // Language
                const langMatch = text.match(/language[:\s]+([^\n]+)/i);
                if (langMatch) results.browser.language = langMatch[1].trim();

                // Hardware concurrency (CPU cores)
                const cpuMatch = text.match(/hardwareConcurrency[:\s]+(\d+)/i);
                if (cpuMatch) results.hardware.cpuCores = parseInt(cpuMatch[1]);

                // Device memory
                const memMatch = text.match(/deviceMemory[:\s]+(\d+)/i);
                if (memMatch) results.hardware.memory = parseInt(memMatch[1]);

                results.rawSections.navigator = text.substring(0, 2000);
            }

            // === Timezone ===
            const tzSection = document.getElementById('timezone') ||
                             document.querySelector('[id*="timezone"]');
            if (tzSection) {
                results.browser.timezone = tzSection.innerText.substring(0, 500);
            }

            // === Screen ===
            const screenSection = document.getElementById('screen') ||
                                 document.querySelector('[id*="screen"]');
            if (screenSection) {
                results.fingerprints.screen = screenSection.innerText.substring(0, 500);
            }

            // === WebRTC ===
            const rtcSection = document.getElementById('webrtc') ||
                              document.querySelector('[id*="webrtc"]');
            if (rtcSection) {
                results.network.webrtc = rtcSection.innerText.substring(0, 500);
            }

            // === CSS Media ===
            const cssSection = document.getElementById('css-media') ||
                              document.querySelector('[id*="css"], [id*="media"]');
            if (cssSection) {
                results.fingerprints.cssMedia = cssSection.innerText.substring(0, 500);
            }

            // === Собираем все секции для raw данных ===
            document.querySelectorAll('[id]').forEach(el => {
                const id = el.id;
                if (id && !results.rawSections[id] && el.innerText.length > 10) {
                    results.rawSections[id] = el.innerText.substring(0, 1500);
                }
            });

        } catch (e) {
            console.error('[CreepJS Content] Ошибка парсинга:', e);
        }

        console.log('[CreepJS Content] Результаты:', results);
        return results;
    }

    // Отправка результатов в background
    function sendResults(results) {
        chrome.runtime.sendMessage({
            type: 'CREEPJS_DATA',
            data: {
                ...results,
                url: location.href,
                timestamp: Date.now()
            }
        });
    }

    // Запуск
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', waitAndParse);
    } else {
        // Небольшая задержка для начала рендера
        setTimeout(waitAndParse, 1000);
    }
})();
