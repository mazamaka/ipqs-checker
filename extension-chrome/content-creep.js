// Content script для CreepJS - парсит результаты с abrahamjuliot.github.io/creepjs
(function() {
    'use strict';

    console.log('[CreepJS Content] Загружен на', location.href);

    // Ждём завершения CreepJS и парсим результаты
    async function waitAndParse() {
        const maxWait = 120000; // 120 секунд максимум
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

                // Проверяем основные секции (Headless обычно загружается последним из важных)
                const headlessLoaded = text.includes('Headless') && (text.includes('chromium:') || text.includes('like headless'));
                const elapsed = Date.now() - startTime;

                // Ждём минимум 10 секунд после появления FP ID для полной загрузки
                if (!headlessLoaded && elapsed < 30000) {
                    console.log('[CreepJS Content] Ждём загрузки Headless секции...');
                    await new Promise(r => setTimeout(r, 2000));
                    continue;
                }

                // После 30 сек или если Headless загружен - даём ещё 3 сек на финальный рендер
                console.log('[CreepJS Content] Секции загружены, финальное ожидание...');
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
            // Новые секции
            domRect: {
                hash: null,
                elemsA: null,
                elemsB: null,
                rangeA: null,
                rangeB: null
            },
            svgRect: {
                hash: null,
                bBox: null,
                char: null,
                subs: null,
                text: null
            },
            features: {
                jsdom: null,
                jsdomVersion: null,
                css: null,
                cssVersion: null,
                window: null,
                windowVersion: null
            },
            cssMedia: {
                media: null,
                matchMedia: null,
                touchDevice: null,
                screenQuery: null,
                hash: null
            },
            computedStyle: {
                hash: null,
                keys: null,
                system: null
            },
            math: {
                hash: null,
                results: null
            },
            errorData: {
                hash: null,
                results: null
            },
            windowData: {
                hash: null,
                keys: null,
                keysCount: null
            },
            htmlElement: {
                hash: null,
                keys: null,
                keysCount: null
            },
            navigator: {
                hash: null,
                dnt: null,
                gpc: null,
                lang: null,
                mimeTypes: null,
                permissions: null,
                plugins: null,
                pluginsCount: null,
                vendor: null,
                webgpu: null,
                userAgentData: null,
                device: null,
                uaParsed: null,
                appVersion: null,
                platform: null,
                cores: null,
                memory: null,
                cookieEnabled: null,
                maxTouchPoints: null,
                pdfViewerEnabled: null
            },
            status: {
                network: {
                    rtt: null,
                    downlink: null,
                    effectiveType: null
                },
                battery: {
                    level: null,
                    charging: null
                },
                available: {
                    storage: null,
                    memory: null,
                    timingRes: null,
                    stack: null
                }
            },
            speech: {
                hash: null,
                voices: null,
                voicesCount: null,
                local: null,
                remote: null,
                lang: null,
                default: null,
                blocked: null
            },
            media: {
                hash: null,
                devices: null,
                devicesCount: null,
                audioinput: null,
                audiooutput: null,
                videoinput: null,
                mimesCount: null,
                mimesTotal: null,
                mimesHash: null
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

            // === WORKER ===
            const workerSection = fullText.match(/Worker([a-f0-9]+)\s*([\s\S]*?)(?=\d+\.\d+ms\s+WebGL|$)/i);
            if (workerSection) {
                results.worker.hash = workerSection[1];
                const workerText = workerSection[2];

                // GPU
                const gpuVendorMatch = workerText.match(/gpu:\s*\n*([^\n]+)\n*([^\n]+)/i);
                if (gpuVendorMatch) {
                    results.hardware.gpuVendor = gpuVendorMatch[1].trim();
                    results.hardware.gpu = gpuVendorMatch[2].trim();
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
                    } else {
                        results.browser.timezone = langTzMatch[2].trim();
                    }
                }

                // Confidence
                const confMatch = workerText.match(/confidence:\s*(\w+)/i);
                if (confMatch) results.worker.confidence = confMatch[1];
            }

            // === TIMEZONE ===
            const tzSection = fullText.match(/Timezone([a-f0-9]*)\s*\n*([^\n]+)\n*([^\n]+)/i);
            if (tzSection) {
                if (!results.browser.timezone) {
                    results.browser.timezone = tzSection[2].trim() + ', ' + tzSection[3].trim();
                }
            }

            // === WebRTC ===
            const webrtcSection = fullText.match(/WebRTC([a-f0-9]*)\s*([\s\S]*?)(?=\d+\.\d+ms\s+Timezone|$)/i);
            if (webrtcSection) {
                results.network.webrtcHash = webrtcSection[1];
                const rtcText = webrtcSection[2];

                // IP - ищем реальный IP после "ip:" (не foundation)
                const ipMatch = rtcText.match(/\nip:\s*([0-9.]+)/i);
                if (ipMatch) results.network.ip = ipMatch[1];

                const devicesMatch = rtcText.match(/devices\s*\((\d+)\):\s*\n*([^\n]+)/i);
                if (devicesMatch) {
                    results.network.webrtc = `devices: ${devicesMatch[1]} (${devicesMatch[2].trim()})`;
                }

                // SDP capabilities
                const sdpMatch = rtcText.match(/sdp capabilities:\s*([a-f0-9]+)/i);
                if (sdpMatch) results.network.sdpCapabilities = sdpMatch[1];
            }

            // === Intl ===
            const intlSection = fullText.match(/Intl([a-f0-9]*)\s*([\s\S]*?)(?=\d+\.\d+ms\s+Headless|$)/i);
            if (intlSection) {
                results.intl = {
                    hash: intlSection[1],
                    locale: null,
                    dateFormat: null,
                    numberFormat: null
                };
                const intlText = intlSection[2];
                const lines = intlText.split('\n').filter(l => l.trim());
                if (lines[0]) results.intl.locale = lines[0].trim();
                if (lines.length > 1) results.intl.dateFormat = lines.slice(1, 4).join(', ').trim();
            }

            // === CANVAS 2D ===
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

                const wglGpuMatch = wglText.match(/gpu:[^\n]*confidence:\s*\w+\s*\n*([^\n]+)\n*([^\n]+)/i);
                if (wglGpuMatch && !results.hardware.gpu) {
                    results.hardware.gpuVendor = wglGpuMatch[1].trim();
                    results.hardware.gpu = wglGpuMatch[2].trim();
                }

                results.fingerprints.webgl = wglText.substring(0, 500).trim();
            }

            // === AUDIO ===
            const audioSection = fullText.match(/Audio([a-f0-9]+)\s*([\s\S]*?)(?=\d*\.?\d+ms\s*Speech|Speech|$)/i);
            if (audioSection) {
                results.fingerprints.audioHash = audioSection[1];
                const audioText = audioSection[2];

                // Собираем все аудио параметры
                results.audio = {
                    hash: audioSection[1],
                    sum: null,
                    gain: null,
                    freq: null,
                    time: null,
                    trap: null,
                    unique: null,
                    data: null,
                    copy: null,
                    values: null
                };

                const sumMatch = audioText.match(/sum:\s*([0-9.-]+)/i);
                if (sumMatch) results.audio.sum = parseFloat(sumMatch[1]);

                const gainMatch = audioText.match(/gain:\s*([0-9.-]+)/i);
                if (gainMatch) results.audio.gain = parseFloat(gainMatch[1]);

                const freqMatch = audioText.match(/freq:\s*([0-9.-]+)/i);
                if (freqMatch) results.audio.freq = parseFloat(freqMatch[1]);

                const timeMatch = audioText.match(/time:\s*([0-9.-]+)/i);
                if (timeMatch) results.audio.time = parseFloat(timeMatch[1]);

                const trapMatch = audioText.match(/trap:\s*([0-9.-]+)/i);
                if (trapMatch) results.audio.trap = parseFloat(trapMatch[1]);

                const uniqueMatch = audioText.match(/unique:\s*(\d+)/i);
                if (uniqueMatch) results.audio.unique = parseInt(uniqueMatch[1]);

                const dataMatch = audioText.match(/data:([a-f0-9]+)/i);
                if (dataMatch) results.audio.data = dataMatch[1];

                const copyMatch = audioText.match(/copy:([a-f0-9]+)/i);
                if (copyMatch) results.audio.copy = copyMatch[1];

                const valuesMatch = audioText.match(/values:\s*([a-f0-9]+)/i);
                if (valuesMatch) results.audio.values = valuesMatch[1];

                // Краткая строка для fingerprints
                results.fingerprints.audio = `sum: ${results.audio.sum || 'N/A'}`;
            }

            // === FONTS ===
            const fontsSection = fullText.match(/Fonts([a-f0-9]*)\s*([\s\S]*?)(?=\d+\.\d+ms\s+DOMRect|$)/i);
            if (fontsSection) {
                results.fingerprints.fontsHash = fontsSection[1];
                const fontsText = fontsSection[2];

                const loadMatch = fontsText.match(/load\s*\(([^)]+)\)/i);
                if (loadMatch) results.fingerprints.fonts = `load: ${loadMatch[1]}`;

                const pixelsMatch = fontsText.match(/pixels:\s*([^\n]+)/i);
                if (pixelsMatch) results.fingerprints.fonts += `, pixels: ${pixelsMatch[1].trim()}`;
            }

            // === SCREEN ===
            const screenSection = fullText.match(/Screen([a-f0-9]*)\s*([\s\S]*?)(?=\d+\.\d+ms\s+Canvas|$)/i);
            if (screenSection) {
                results.fingerprints.screenHash = screenSection[1];
                const screenText = screenSection[2];

                const screenMatch = screenText.match(/screen:\s*(\d+\s*x\s*\d+)/i);
                if (screenMatch) results.fingerprints.screen = screenMatch[1];

                const touchMatch = screenText.match(/touch:\s*(\w+)/i);
                if (touchMatch) results.fingerprints.screen = (results.fingerprints.screen || '') + `, touch: ${touchMatch[1]}`;

                const deviceRatioMatch = screenText.match(/device ratio:\s*([0-9.]+)/i);
                if (deviceRatioMatch) results.fingerprints.screen += `, ratio: ${deviceRatioMatch[1]}`;
            }

            // === DOMRect ===
            const domRectSection = fullText.match(/DOMRect([a-f0-9]*)\s*([\s\S]*?)(?=\d+\.\d+ms\s+SVGRect|$)/i);
            if (domRectSection) {
                results.domRect.hash = domRectSection[1];
                const domText = domRectSection[2];

                const elemsAMatch = domText.match(/elems A:\s*([^\n]+)/i);
                if (elemsAMatch) results.domRect.elemsA = elemsAMatch[1].trim();

                const elemsBMatch = domText.match(/elems B:\s*([^\n]+)/i);
                if (elemsBMatch) results.domRect.elemsB = elemsBMatch[1].trim();

                const rangeAMatch = domText.match(/range A:\s*([^\n]+)/i);
                if (rangeAMatch) results.domRect.rangeA = rangeAMatch[1].trim();

                const rangeBMatch = domText.match(/range B:\s*([^\n]+)/i);
                if (rangeBMatch) results.domRect.rangeB = rangeBMatch[1].trim();
            }

            // === SVGRect ===
            const svgRectSection = fullText.match(/SVGRect([a-f0-9]*)\s*([\s\S]*?)(?=\d+\.\d+ms\s+Features|$)/i);
            if (svgRectSection) {
                results.svgRect.hash = svgRectSection[1];
                const svgText = svgRectSection[2];

                const bBoxMatch = svgText.match(/bBox:\s*([^\n]+)/i);
                if (bBoxMatch) results.svgRect.bBox = bBoxMatch[1].trim();

                const charMatch = svgText.match(/char:\s*([^\n]+)/i);
                if (charMatch) results.svgRect.char = charMatch[1].trim();

                const subsMatch = svgText.match(/subs:\s*([^\n]+)/i);
                if (subsMatch) results.svgRect.subs = subsMatch[1].trim();

                const textMatch = svgText.match(/text:\s*([^\n]+)/i);
                if (textMatch) results.svgRect.text = textMatch[1].trim();
            }

            // === Features ===
            // Формат: Features[hash]\nJS/DOM:\n317\nv131\nCSS:\n379\nv131\nWindow:\n3\nv131
            const featuresSection = fullText.match(/Features([a-f0-9]*)\s*([\s\S]*?)(?=\d+\.\d+ms\s+CSS Media|CSS Media Queries|$)/i);
            if (featuresSection) {
                const featText = featuresSection[2];

                // JS/DOM может быть в формате:
                // "JS/DOM:\n317\nv131" или "JS/DOM: 317 v131" или просто "JS/DOM\n317"
                const jsdomMatch = featText.match(/JS\s*[\/\\]\s*DOM[:\s]*\n?\s*(\d+)(?:\s*\n?\s*v?(\d+))?/i);
                if (jsdomMatch) {
                    results.features.jsdom = parseInt(jsdomMatch[1]);
                    if (jsdomMatch[2]) results.features.jsdomVersion = parseInt(jsdomMatch[2]);
                }

                // CSS
                const cssMatch = featText.match(/\nCSS[:\s]*\n?\s*(\d+)(?:\s*\n?\s*v?(\d+))?/i);
                if (cssMatch) {
                    results.features.css = parseInt(cssMatch[1]);
                    if (cssMatch[2]) results.features.cssVersion = parseInt(cssMatch[2]);
                }

                // Window (в Features секции, не путать с Window секцией)
                const windowFeatMatch = featText.match(/\nWindow[:\s]*\n?\s*(\d+)(?:\s*\n?\s*v?(\d+))?/i);
                if (windowFeatMatch) {
                    results.features.window = parseInt(windowFeatMatch[1]);
                    if (windowFeatMatch[2]) results.features.windowVersion = parseInt(windowFeatMatch[2]);
                }
            }

            // === CSS Media Queries ===
            const cssMediaSection = fullText.match(/CSS Media Queries([a-f0-9]*)\s*([\s\S]*?)(?=\d+\.\d+ms\s+Computed Style|$)/i);
            if (cssMediaSection) {
                results.cssMedia.hash = cssMediaSection[1];
                const cssText = cssMediaSection[2];

                const mediaMatch = cssText.match(/@media:\s*([^\n]+)/i);
                if (mediaMatch) results.cssMedia.media = mediaMatch[1].trim();

                const matchMediaMatch = cssText.match(/matchMedia:\s*([^\n]+)/i);
                if (matchMediaMatch) results.cssMedia.matchMedia = matchMediaMatch[1].trim();

                const touchDeviceMatch = cssText.match(/touch device:\s*(\w+)/i);
                if (touchDeviceMatch) results.cssMedia.touchDevice = touchDeviceMatch[1];

                const screenQueryMatch = cssText.match(/screen query:\s*([^\n]+)/i);
                if (screenQueryMatch) results.cssMedia.screenQuery = screenQueryMatch[1].trim();
            }

            // === Computed Style ===
            const computedSection = fullText.match(/Computed Style([a-f0-9]*)\s*([\s\S]*?)(?=\d+\.\d+ms\s+Math|$)/i);
            if (computedSection) {
                results.computedStyle.hash = computedSection[1];
                const compText = computedSection[2];

                const keysMatch = compText.match(/keys\s*\((\d+)\)/i);
                if (keysMatch) results.computedStyle.keys = parseInt(keysMatch[1]);

                const systemMatch = compText.match(/system:\s*([^\n]+)/i);
                if (systemMatch) results.computedStyle.system = systemMatch[1].trim();
            }

            // === Math ===
            const mathSection = fullText.match(/Math([a-f0-9]*)\s*([\s\S]*?)(?=\d+\.\d+ms\s+Error|$)/i);
            if (mathSection) {
                results.math.hash = mathSection[1];
                const mathText = mathSection[2];

                const resultsMatch = mathText.match(/results?:\s*([^\n]+)/i);
                if (resultsMatch) results.math.results = resultsMatch[1].trim();
            }

            // === Error ===
            const errorSection = fullText.match(/Error([a-f0-9]*)\s*([\s\S]*?)(?=\d+\.\d+ms\s+Window|$)/i);
            if (errorSection) {
                results.errorData.hash = errorSection[1];
                const errText = errorSection[2];

                const resultsMatch = errText.match(/results?:\s*([^\n]+)/i);
                if (resultsMatch) results.errorData.results = resultsMatch[1].trim();
            }

            // === Window ===
            // Window секция может быть в разных форматах:
            // 1. "1.10msWindow243e46a1\nkeys (1196):" - hash в заголовке, без hash после keys
            // 2. "Window\nkeys (1283): 996adf46" - hash после keys
            // 3. "Window996adf46\nkeys (1283):" - hash в заголовке, без hash после keys
            const windowSection = fullText.match(/\nWindow([a-f0-9]*)\s*([\s\S]*?)(?=\d+\.\d+ms\s+HTMLElement|$)/i);
            if (windowSection) {
                const winText = windowSection[2];

                // Сначала пробуем формат с hash после keys: "keys (count): hash"
                let keysMatch = winText.match(/keys\s*\((\d+)\):\s*([a-f0-9]+)/i);

                if (keysMatch) {
                    results.windowData.keysCount = parseInt(keysMatch[1]);
                    // Если секция Window имела хеша в заголовке, используем его
                    if (windowSection[1]) {
                        results.windowData.hash = windowSection[1];
                        results.windowData.keys = keysMatch[2].trim();
                    } else {
                        // Иначе hash из keys - это и есть Window hash
                        results.windowData.hash = keysMatch[2].trim();
                        results.windowData.keys = null;
                    }
                } else {
                    // Формат без hash после keys: "keys (count):" или "keys (count)"
                    keysMatch = winText.match(/keys\s*\((\d+)\)/i);
                    if (keysMatch) {
                        results.windowData.keysCount = parseInt(keysMatch[1]);
                        // Hash берём из заголовка Window секции
                        if (windowSection[1]) {
                            results.windowData.hash = windowSection[1];
                        }
                    }
                }
            }

            // === HTMLElement ===
            const htmlElemSection = fullText.match(/HTMLElement([a-f0-9]*)\s*([\s\S]*?)(?=\d+\.\d+ms\s+Navigator|$)/i);
            if (htmlElemSection) {
                results.htmlElement.hash = htmlElemSection[1];
                const htmlText = htmlElemSection[2];

                const keysMatch = htmlText.match(/keys\s*\((\d+)\):\s*([^\n]+)/i);
                if (keysMatch) {
                    results.htmlElement.keysCount = parseInt(keysMatch[1]);
                    results.htmlElement.keys = keysMatch[2].trim();
                }
            }

            // === Navigator (ПОЛНЫЙ) ===
            const navSection = fullText.match(/Navigator([a-f0-9]*)\s*([\s\S]*?)(?=\d+\.\d+ms\s+Status|Status$|$)/i);
            if (navSection) {
                results.navigator.hash = navSection[1];
                const navText = navSection[2];

                const dntMatch = navText.match(/dnt:\s*(\w+)/i);
                if (dntMatch) results.navigator.dnt = dntMatch[1];

                const gpcMatch = navText.match(/gpc:\s*(\w+)/i);
                if (gpcMatch) results.navigator.gpc = gpcMatch[1];

                const langMatch = navText.match(/lang:\s*([^\n]+)/i);
                if (langMatch) results.navigator.lang = langMatch[1].trim();

                const mimeTypesMatch = navText.match(/mimeTypes:\s*([^\n]+)/i);
                if (mimeTypesMatch) results.navigator.mimeTypes = mimeTypesMatch[1].trim();

                const permissionsMatch = navText.match(/permissions:\s*\n*([^\n]+)/i);
                if (permissionsMatch) results.navigator.permissions = permissionsMatch[1].trim();

                const pluginsMatch = navText.match(/plugins\s*\((\d+)\):\s*([^\n]+)/i);
                if (pluginsMatch) {
                    results.navigator.pluginsCount = parseInt(pluginsMatch[1]);
                    results.navigator.plugins = pluginsMatch[2].trim();
                }

                const vendorMatch = navText.match(/vendor:\s*([^\n]+)/i);
                if (vendorMatch) results.navigator.vendor = vendorMatch[1].trim();

                const webgpuMatch = navText.match(/webgpu:\s*([^\n]+)/i);
                if (webgpuMatch) results.navigator.webgpu = webgpuMatch[1].trim();

                const uaDataMatch = navText.match(/userAgentData:\s*([^\n]+)/i);
                if (uaDataMatch) results.navigator.userAgentData = uaDataMatch[1].trim();

                const navDeviceMatch = navText.match(/device:\s*([^\n]+)/i);
                if (navDeviceMatch) results.navigator.device = navDeviceMatch[1].trim();

                const uaParsedMatch = navText.match(/ua parsed:\s*([^\n]+)/i);
                if (uaParsedMatch) results.navigator.uaParsed = uaParsedMatch[1].trim();

                const appVersionMatch = navText.match(/appVersion:\s*([^\n]+)/i);
                if (appVersionMatch) results.navigator.appVersion = appVersionMatch[1].trim();

                const platformMatch = navText.match(/platform:\s*([^\n]+)/i);
                if (platformMatch) results.navigator.platform = platformMatch[1].trim();

                const coresMatch = navText.match(/cores:\s*(\d+)/i);
                if (coresMatch) results.navigator.cores = parseInt(coresMatch[1]);

                const memoryMatch = navText.match(/memory:\s*([0-9.]+)/i);
                if (memoryMatch) results.navigator.memory = parseFloat(memoryMatch[1]);

                const cookieMatch = navText.match(/cookieEnabled:\s*(\w+)/i);
                if (cookieMatch) results.navigator.cookieEnabled = cookieMatch[1] === 'true';

                const touchPointsMatch = navText.match(/maxTouchPoints:\s*(\d+)/i);
                if (touchPointsMatch) results.navigator.maxTouchPoints = parseInt(touchPointsMatch[1]);

                const pdfMatch = navText.match(/pdfViewerEnabled:\s*(\w+)/i);
                if (pdfMatch) results.navigator.pdfViewerEnabled = pdfMatch[1] === 'true';
            }

            // === STATUS ===
            const statusSection = fullText.match(/Status([a-f0-9]*)\s*([\s\S]*?)$/i);
            if (statusSection) {
                const statText = statusSection[2];

                // Network
                const rttMatch = statText.match(/rtt:\s*(\d+)/i);
                if (rttMatch) results.status.network.rtt = parseInt(rttMatch[1]);

                const downlinkMatch = statText.match(/downlink:\s*([0-9.]+)/i);
                if (downlinkMatch) results.status.network.downlink = parseFloat(downlinkMatch[1]);

                const effectiveTypeMatch = statText.match(/effectiveType:\s*(\w+)/i);
                if (effectiveTypeMatch) results.status.network.effectiveType = effectiveTypeMatch[1];

                // Battery
                const levelMatch = statText.match(/level:\s*([0-9.]+)/i);
                if (levelMatch) results.status.battery.level = parseFloat(levelMatch[1]);

                const chargingMatch = statText.match(/charging:\s*(\w+)/i);
                if (chargingMatch) results.status.battery.charging = chargingMatch[1] === 'true';

                // Available
                const storageMatch = statText.match(/storage:\s*([0-9.]+\s*\w+)/i);
                if (storageMatch) results.status.available.storage = storageMatch[1].trim();

                const memAvailMatch = statText.match(/memory:\s*([0-9.]+\s*\w+)/i);
                if (memAvailMatch) results.status.available.memory = memAvailMatch[1].trim();

                const timingMatch = statText.match(/timing res(?:olution)?:\s*([^\n]+)/i);
                if (timingMatch) results.status.available.timingRes = timingMatch[1].trim();

                const stackMatch = statText.match(/stack:\s*([^\n]+)/i);
                if (stackMatch) results.status.available.stack = stackMatch[1].trim();
            }

            // === Speech ===
            // Speech секция часто идёт без хеша: "Speech\nlocal (0): blocked"
            const speechSection = fullText.match(/\nSpeech([a-f0-9]*)\s*\n([\s\S]*?)(?=\d+\.\d+ms\s*\n*Media|Media[a-f0-9]|$)/i);
            if (speechSection) {
                results.speech.hash = speechSection[1] || null;
                const speechText = speechSection[2];

                // Парсим local, remote, lang, default - формат: "local (0): blocked" или "local: value"
                const localMatch = speechText.match(/local\s*\(?(\d*)\)?:\s*([^\n]+)/i);
                if (localMatch) {
                    results.speech.local = localMatch[2].trim();
                    if (localMatch[1]) results.speech.voicesCount = parseInt(localMatch[1]);
                }

                const remoteMatch = speechText.match(/remote\s*\(?(\d*)\)?:\s*([^\n]+)/i);
                if (remoteMatch) results.speech.remote = remoteMatch[2].trim();

                const langMatch = speechText.match(/lang\s*\(?(\d*)\)?:\s*([^\n]+)/i);
                if (langMatch) results.speech.lang = langMatch[2].trim();

                const defaultMatch = speechText.match(/default:\s*\n?([^\n]+)/i);
                if (defaultMatch) results.speech.default = defaultMatch[1].trim();

                // Проверяем blocked статус
                results.speech.blocked = speechText.toLowerCase().includes('blocked');

                // Альтернативный парсинг voices если есть
                const voicesMatch = speechText.match(/voices\s*\((\d+)\):\s*([^\n]+)/i);
                if (voicesMatch) {
                    results.speech.voicesCount = parseInt(voicesMatch[1]);
                    results.speech.voices = voicesMatch[2].trim();
                }
            }

            // === Media ===
            // Media секция: "Media[hash]\nmimes (10/12): [hash]"
            const mediaSection = fullText.match(/Media([a-f0-9]+)\s*([\s\S]*?)(?=\d+\.\d+ms|$)/i);
            if (mediaSection) {
                results.media.hash = mediaSection[1];
                const mediaText = mediaSection[2];

                // Парсим mimes - формат: "mimes (10/12): 9e5a765a"
                const mimesMatch = mediaText.match(/mimes\s*\((\d+)\/(\d+)\):\s*([a-f0-9]+)/i);
                if (mimesMatch) {
                    results.media.mimesCount = parseInt(mimesMatch[1]);
                    results.media.mimesTotal = parseInt(mimesMatch[2]);
                    results.media.mimesHash = mimesMatch[3];
                }

                // devices если есть в Media секции
                const devicesMatch = mediaText.match(/devices\s*\((\d+)\):\s*([^\n]+)/i);
                if (devicesMatch) {
                    results.media.devicesCount = parseInt(devicesMatch[1]);
                    results.media.devices = devicesMatch[2].trim();
                }

                // Парсим типы устройств: audioinput, audiooutput, videoinput
                const audioInputMatch = mediaText.match(/audioinput:\s*(\d+)/i);
                if (audioInputMatch) results.media.audioinput = parseInt(audioInputMatch[1]);

                const audioOutputMatch = mediaText.match(/audiooutput:\s*(\d+)/i);
                if (audioOutputMatch) results.media.audiooutput = parseInt(audioOutputMatch[1]);

                const videoInputMatch = mediaText.match(/videoinput:\s*(\d+)/i);
                if (videoInputMatch) results.media.videoinput = parseInt(videoInputMatch[1]);
            }

            // Если media devices не найдены, попробуем получить из WebRTC
            if (!results.media.devicesCount && results.network.webrtc) {
                // webrtc уже в формате "devices: 3 (mic, audio, webcam)"
                const webrtcDevicesMatch = results.network.webrtc.match(/devices:\s*(\d+)/i);
                if (webrtcDevicesMatch) {
                    results.media.devicesCount = parseInt(webrtcDevicesMatch[1]);
                }
                // Подсчитываем типы из текста
                if (results.network.webrtc.includes('mic')) results.media.audioinput = 1;
                if (results.network.webrtc.includes('audio')) results.media.audiooutput = 1;
                if (results.network.webrtc.includes('webcam')) results.media.videoinput = 1;
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

            // Альтернативный парсинг lies из текста
            if (results.lies.count === 0) {
                const liesMatch = fullText.match(/lies\s*\((\d+)\)/i);
                if (liesMatch && parseInt(liesMatch[1]) > 0) {
                    results.lies.count = parseInt(liesMatch[1]);
                }
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
                if (id && el.innerText.length > 10 && el.innerText.length < 5000) {
                    results.rawSections[id] = el.innerText.substring(0, 3000);
                }
            });

        } catch (e) {
            console.error('[CreepJS Content] Ошибка парсинга:', e);
        }

        console.log('[CreepJS Content] Результаты собраны, секций:', Object.keys(results.rawSections).length);
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
        setTimeout(waitAndParse, 1000);
    }
})();
