// Content script для CreepJS - парсит результаты с abrahamjuliot.github.io/creepjs
(function() {
    'use strict';

    console.log('[CreepJS Content] Загружен на', location.href);

    // Ждём завершения CreepJS и парсим результаты
    async function waitAndParse() {
        const maxWait = 90000; // 90 секунд максимум (CreepJS может долго считать)
        const checkInterval = 1000;
        const startTime = Date.now();

        while (Date.now() - startTime < maxWait) {
            // Ищем FP ID в заголовке - главный индикатор завершения
            const fpApp = document.getElementById('fp-app');
            if (!fpApp) {
                await new Promise(r => setTimeout(r, checkInterval));
                continue;
            }

            const text = fpApp.innerText || '';
            const fpMatch = text.match(/FP ID:\s*([a-f0-9]{64})/i);

            if (fpMatch) {
                console.log('[CreepJS Content] Найден FP ID:', fpMatch[1].substring(0, 16) + '...');

                // Ждём пока все секции загрузятся (Worker обычно последний)
                const workerLoaded = text.includes('Worker') && text.includes('gpu:');
                if (!workerLoaded && Date.now() - startTime < 30000) {
                    console.log('[CreepJS Content] Ждём загрузки Worker секции...');
                    await new Promise(r => setTimeout(r, 2000));
                    continue;
                }

                // Даём ещё немного времени для рендера
                await new Promise(r => setTimeout(r, 3000));

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
                chromium: null,
                stealth: null,
                likeHeadless: null,
                headlessPercent: null
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
                canvasHash: null,
                webgl: null,
                webglHash: null,
                audio: null,
                audioHash: null,
                fonts: null,
                fontsHash: null,
                screen: null,
                screenHash: null
            },
            hardware: {
                gpu: null,
                gpuVendor: null,
                cpuCores: null,
                memory: null,
                platform: null,
                device: null
            },
            browser: {
                userAgent: null,
                vendor: null,
                language: null,
                timezone: null,
                timezoneOffset: null
            },
            network: {
                webrtc: null,
                webrtcHash: null,
                ip: null
            },
            worker: {
                hash: null,
                confidence: null
            },
            rawSections: {}
        };

        try {
            const fpApp = document.getElementById('fp-app');
            if (!fpApp) {
                console.error('[CreepJS Content] fp-app не найден');
                return results;
            }

            const fullText = fpApp.innerText || '';

            // === FP ID и Fuzzy ===
            const fpMatch = fullText.match(/FP ID:\s*([a-f0-9]{64})/i);
            if (fpMatch) results.fpId = fpMatch[1];

            const fuzzyMatch = fullText.match(/Fuzzy:\s*([a-f0-9]{64})/i);
            if (fuzzyMatch) results.fuzzyHash = fuzzyMatch[1];

            // === Total Time ===
            const timeMatch = fullText.match(/(\d+(?:\.\d+)?)\s*ms\s*\n*WebRTC/i);
            if (timeMatch) results.timeMs = parseFloat(timeMatch[1]);

            // === HEADLESS DETECTION ===
            const headlessMatch = fullText.match(/Headless[a-f0-9]*\s*\n*chromium:\s*(true|false)/i);
            if (headlessMatch) results.headless.chromium = headlessMatch[1] === 'true';

            const likeHeadlessMatch = fullText.match(/(\d+)%\s*like headless/i);
            if (likeHeadlessMatch) results.headless.likeHeadless = parseInt(likeHeadlessMatch[1]);

            const headlessPercentMatch = fullText.match(/(\d+)%\s*headless:/i);
            if (headlessPercentMatch) results.headless.headlessPercent = parseInt(headlessPercentMatch[1]);

            const stealthMatch = fullText.match(/(\d+)%\s*stealth:/i);
            if (stealthMatch) results.headless.stealth = parseInt(stealthMatch[1]);

            // === RESISTANCE ===
            const privacyMatch = fullText.match(/privacy:\s*(\w+)/i);
            if (privacyMatch) results.resistance.privacy = privacyMatch[1];

            const securityMatch = fullText.match(/security:\s*(\w+)/i);
            if (securityMatch) results.resistance.security = securityMatch[1];

            const modeMatch = fullText.match(/mode:\s*(\w+)/i);
            if (modeMatch) results.resistance.mode = modeMatch[1];

            const extensionMatch = fullText.match(/extension:\s*(\w+)/i);
            if (extensionMatch) results.resistance.extension = extensionMatch[1];

            // === WORKER (основной источник hardware/browser данных) ===
            const workerSection = fullText.match(/Worker[a-f0-9]*\s*([\s\S]*?)(?=\d+\.\d+ms\s+WebGL|$)/i);
            if (workerSection) {
                const workerText = workerSection[1];

                // GPU
                const gpuVendorMatch = workerText.match(/gpu:\s*\n*([^\n]+)\n*([^\n]+)/i);
                if (gpuVendorMatch) {
                    results.hardware.gpuVendor = gpuVendorMatch[1].trim();
                    results.hardware.gpu = gpuVendorMatch[2].trim();
                }

                // Альтернативный формат GPU (ANGLE)
                const angleMatch = workerText.match(/ANGLE\s*\([^)]+\)/i);
                if (angleMatch && !results.hardware.gpu) {
                    results.hardware.gpu = angleMatch[0];
                }

                // User Agent
                const uaMatch = workerText.match(/userAgent:\s*\n*(?:ua reduction\n*)?([^\n]+)/i);
                if (uaMatch) results.browser.userAgent = uaMatch[1].trim();

                // Device/Platform
                const deviceMatch = workerText.match(/device:\s*\n*([^\n]+)\n*([^\n]+)/i);
                if (deviceMatch) {
                    results.hardware.device = deviceMatch[1].trim();
                    results.hardware.platform = deviceMatch[2].trim();
                }

                // Cores and RAM
                const coresMatch = workerText.match(/cores:\s*(\d+)/i);
                if (coresMatch) results.hardware.cpuCores = parseInt(coresMatch[1]);

                const ramMatch = workerText.match(/ram:\s*(\d+)/i);
                if (ramMatch) results.hardware.memory = parseInt(ramMatch[1]);

                // Language/Timezone from Worker
                const langTzMatch = workerText.match(/lang\/timezone:\s*\n*([^\n]+)\n*([^\n]+)/i);
                if (langTzMatch) {
                    results.browser.language = langTzMatch[1].trim();
                    const tzParts = langTzMatch[2].match(/([^\(]+)\s*\(([^)]+)\)/);
                    if (tzParts) {
                        results.browser.timezone = tzParts[1].trim();
                        results.browser.timezoneOffset = tzParts[2].trim();
                    }
                }

                // Confidence
                const confMatch = workerText.match(/confidence:\s*(\w+)/i);
                if (confMatch) results.worker.confidence = confMatch[1];
            }

            // === TIMEZONE (отдельная секция) ===
            const tzSection = fullText.match(/Timezone[a-f0-9]*\s*\n*([^\n]+)\n*([^\n]+)/i);
            if (tzSection) {
                if (!results.browser.timezone) {
                    results.browser.timezone = tzSection[1].trim() + ', ' + tzSection[2].trim();
                }
            }

            // === WebRTC ===
            const webrtcSection = fullText.match(/WebRTC[a-f0-9]*\s*([\s\S]*?)(?=\d+\.\d+ms\s+Timezone|$)/i);
            if (webrtcSection) {
                const rtcText = webrtcSection[1];

                // IP
                const ipMatch = rtcText.match(/ip:\s*([0-9.]+)/i);
                if (ipMatch) results.network.ip = ipMatch[1];

                // Devices
                const devicesMatch = rtcText.match(/devices\s*\((\d+)\):\s*\n*([^\n]+)/i);
                if (devicesMatch) {
                    results.network.webrtc = `devices: ${devicesMatch[1]} (${devicesMatch[2].trim()})`;
                }
            }

            // === CANVAS ===
            const canvasSection = fullText.match(/Canvas\s*2d([a-f0-9]*)\s*([\s\S]*?)(?=\d+\.\d+ms\s+Fonts|$)/i);
            if (canvasSection) {
                results.fingerprints.canvasHash = canvasSection[1];
                results.fingerprints.canvas = canvasSection[2].substring(0, 500).trim();
            }

            // === WebGL ===
            const webglSection = fullText.match(/WebGL([a-f0-9]*)\s*([\s\S]*?)(?=\d+\.\d+ms\s+Screen|$)/i);
            if (webglSection) {
                results.fingerprints.webglHash = webglSection[1];
                const wglText = webglSection[2];

                // GPU from WebGL section
                const wglGpuMatch = wglText.match(/gpu:[^\n]*confidence:\s*\w+\s*\n*([^\n]+)\n*([^\n]+)/i);
                if (wglGpuMatch && !results.hardware.gpu) {
                    results.hardware.gpuVendor = wglGpuMatch[1].trim();
                    results.hardware.gpu = wglGpuMatch[2].trim();
                }

                results.fingerprints.webgl = wglText.substring(0, 500).trim();
            }

            // === AUDIO ===
            const audioSection = fullText.match(/Audio([a-f0-9]*)\s*([\s\S]*?)(?=\d+\.\d+ms\s+Speech|$)/i);
            if (audioSection) {
                results.fingerprints.audioHash = audioSection[1];
                const audioText = audioSection[2];

                const sumMatch = audioText.match(/sum:\s*([0-9.]+)/i);
                if (sumMatch) {
                    results.fingerprints.audio = `sum: ${sumMatch[1]}`;
                }
            }

            // === FONTS ===
            const fontsSection = fullText.match(/Fonts([a-f0-9]*)\s*([\s\S]*?)(?=\d+\.\d+ms\s+DOMRect|$)/i);
            if (fontsSection) {
                results.fingerprints.fontsHash = fontsSection[1];
                const fontsText = fontsSection[2];

                const loadMatch = fontsText.match(/load\s*\(([^)]+)\)/i);
                if (loadMatch) {
                    results.fingerprints.fonts = `load: ${loadMatch[1]}`;
                }
            }

            // === SCREEN ===
            const screenSection = fullText.match(/Screen([a-f0-9]*)\s*([\s\S]*?)(?=\d+\.\d+ms\s+Canvas|$)/i);
            if (screenSection) {
                results.fingerprints.screenHash = screenSection[1];
                const screenText = screenSection[2];

                const screenMatch = screenText.match(/screen:\s*(\d+\s*x\s*\d+)/i);
                if (screenMatch) {
                    results.fingerprints.screen = screenMatch[1];
                }

                const touchMatch = screenText.match(/touch:\s*(\w+)/i);
                if (touchMatch) {
                    results.fingerprints.screen = (results.fingerprints.screen || '') + `, touch: ${touchMatch[1]}`;
                }
            }

            // === NAVIGATOR (дополнительно) ===
            const navSection = fullText.match(/Navigator([a-f0-9]*)\s*([\s\S]*?)(?=Status|$)/i);
            if (navSection) {
                const navText = navSection[2];

                if (!results.browser.language) {
                    const langMatch = navText.match(/lang:\s*([^\n]+)/i);
                    if (langMatch) results.browser.language = langMatch[1].trim();
                }

                if (!results.hardware.cpuCores) {
                    const coresMatch = navText.match(/cores:\s*(\d+)/i);
                    if (coresMatch) results.hardware.cpuCores = parseInt(coresMatch[1]);
                }
            }

            // === LIES ===
            const liesSection = document.querySelector('.lies-list, [class*="lies"]');
            if (liesSection) {
                const items = liesSection.querySelectorAll('li, .lie-item');
                results.lies.count = items.length;
                items.forEach(li => {
                    const text = li.textContent.trim();
                    if (text && text.length < 200) {
                        results.lies.list.push(text);
                    }
                });
            }

            // === TRASH ===
            const trashSection = document.querySelector('.trash-list, [class*="trash"]');
            if (trashSection) {
                const items = trashSection.querySelectorAll('li, .trash-item');
                results.trash.count = items.length;
                items.forEach(ti => {
                    const text = ti.textContent.trim();
                    if (text && text.length < 200) {
                        results.trash.list.push(text);
                    }
                });
            }

            // === Собираем все секции с ID для raw данных ===
            document.querySelectorAll('[id]').forEach(el => {
                const id = el.id;
                if (id && el.innerText.length > 10) {
                    results.rawSections[id] = el.innerText.substring(0, 3000);
                }
            });

        } catch (e) {
            console.error('[CreepJS Content] Ошибка парсинга:', e);
        }

        console.log('[CreepJS Content] Результаты:', JSON.stringify(results, null, 2));
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
