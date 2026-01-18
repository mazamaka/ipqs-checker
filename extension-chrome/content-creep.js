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
                hash: null,
                chromium: null,
                stealth: null,
                likeHeadless: null,
                headlessPercent: null,
                platformHints: null,
                platformHintsMetrics: null
            },
            resistance: {
                hash: null,
                privacy: null,
                security: null,
                mode: null,
                extension: null
            },
            timezone: {
                hash: null,
                displayName: null,
                location: null,
                rawOffset: null,
                offset: null
            },
            intl: {
                hash: null,
                locale: null,
                dateFormat: null,
                displayNames: null,
                numberFormat: null,
                relativeTime: null,
                pluralRules: null,
                pluralCategory: null
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
                canvasDataHash: null,
                canvasTextMetrics: null,
                canvasEmoji: null,
                webgl: null,
                webglHash: null,
                webglImages: null,
                webglPixels: null,
                webglParams: null,
                webglParamsCount: null,
                webglExts: null,
                webglExtsCount: null,
                webglConfidence: null,
                audio: null,
                audioHash: null,
                fonts: null,
                fontsHash: null,
                fontsApps: null,
                fontsList: null,
                screen: null,
                screenHash: null,
                screenAvail: null,
                screenDepth: null,
                screenViewport: null
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
                ip: null,
                sdpCapabilities: null,
                hostConnection: null,
                stunConnection: null,
                foundationIp: null,
                typeBaseIp: null
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
                keysHash: null,
                systemStyles: null,
                systemStylesHash: null
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
                propertiesCount: null,
                propertiesHash: null,
                dnt: null,
                gpc: null,
                lang: null,
                mimeTypes: null,
                mimeTypesCount: null,
                mimeTypesHash: null,
                permissions: null,
                permissionsCount: null,
                permissionsHash: null,
                plugins: null,
                pluginsCount: null,
                pluginsHash: null,
                vendor: null,
                webgpu: null,
                userAgentData: null,
                linuxVersion: null,
                device: null,
                uaParsed: null,
                appVersion: null,
                platform: null,
                cores: null,
                memory: null,
                touch: null,
                cookieEnabled: null,
                maxTouchPoints: null,
                pdfViewerEnabled: null
            },
            status: {
                hash: null,
                network: {
                    rtt: null,
                    downlink: null,
                    effectiveType: null,
                    saveData: null
                },
                battery: {
                    level: null,
                    charging: null,
                    chargeTime: null,
                    dischargeTime: null
                },
                available: {
                    storage: null,
                    storageRaw: null,
                    memory: null,
                    memoryRaw: null,
                    timingRes: null,
                    timingRes2: null,
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
            const headlessSection = fullText.match(/Headless([a-f0-9]*)\s*([\s\S]*?)(?=\d+\.\d+ms\s+Resistance|$)/i);
            if (headlessSection) {
                results.headless.hash = headlessSection[1];
                const headlessText = headlessSection[2];

                const chromiumMatch = headlessText.match(/chromium:\s*(true|false)/i);
                if (chromiumMatch) results.headless.chromium = chromiumMatch[1] === 'true';

                const likeHeadlessMatch = headlessText.match(/(\d+)%\s*like headless/i);
                if (likeHeadlessMatch) results.headless.likeHeadless = parseInt(likeHeadlessMatch[1]);

                const headlessPercentMatch = headlessText.match(/(\d+)%\s*headless:/i);
                if (headlessPercentMatch) results.headless.headlessPercent = parseInt(headlessPercentMatch[1]);

                const stealthMatch = headlessText.match(/(\d+)%\s*stealth:/i);
                if (stealthMatch) results.headless.stealth = parseInt(stealthMatch[1]);

                // Platform hints
                const platformHintsMatch = headlessText.match(/platform hints:\s*\n*([^\n]+)\n*([^\n]+)/i);
                if (platformHintsMatch) {
                    results.headless.platformHints = platformHintsMatch[1].trim();
                    results.headless.platformHintsMetrics = platformHintsMatch[2].trim();
                }
            }

            // === RESISTANCE ===
            const resistanceSection = fullText.match(/Resistance([a-f0-9]*)\s*([\s\S]*?)(?=\d+\.\d+ms\s+ServiceWorker|$)/i);
            if (resistanceSection) {
                results.resistance.hash = resistanceSection[1];
                const resText = resistanceSection[2];

                const privacyMatch = resText.match(/privacy:\s*(\w+)/i);
                if (privacyMatch) results.resistance.privacy = privacyMatch[1];

                const securityMatch = resText.match(/security:\s*(\w+)/i);
                if (securityMatch) results.resistance.security = securityMatch[1];

                const modeMatch = resText.match(/mode:\s*(\w+)/i);
                if (modeMatch) results.resistance.mode = modeMatch[1];

                const extensionMatch = resText.match(/extension:\s*(\w+)/i);
                if (extensionMatch) results.resistance.extension = extensionMatch[1];
            }

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
            // Format: Timezone[hash]\n[display name]\n[location]\n[rawOffset]\n[offset]
            const tzSection = fullText.match(/Timezone([a-f0-9]*)\s*([\s\S]*?)(?=\d+\.\d+ms\s+Intl|$)/i);
            if (tzSection) {
                results.timezone.hash = tzSection[1];
                const tzLines = tzSection[2].split('\n').filter(l => l.trim());
                if (tzLines[0]) results.timezone.displayName = tzLines[0].trim();
                if (tzLines[1]) results.timezone.location = tzLines[1].trim();
                if (tzLines[2]) results.timezone.rawOffset = tzLines[2].trim();
                if (tzLines[3]) results.timezone.offset = tzLines[3].trim();

                if (!results.browser.timezone) {
                    results.browser.timezone = results.timezone.location;
                }
                if (!results.browser.timezoneOffset && results.timezone.offset) {
                    results.browser.timezoneOffset = results.timezone.offset;
                }
            }

            // === WebRTC ===
            const webrtcSection = fullText.match(/WebRTC([a-f0-9]*)\s*([\s\S]*?)(?=\d+\.\d+ms\s+Timezone|$)/i);
            if (webrtcSection) {
                results.network.webrtcHash = webrtcSection[1];
                const rtcText = webrtcSection[2];

                // Host connection (full ICE candidate)
                const hostMatch = rtcText.match(/host connection:\s*\n*([^\n]+)/i);
                if (hostMatch) results.network.hostConnection = hostMatch[1].trim();

                // Foundation/IP
                const foundationMatch = rtcText.match(/foundation\/ip:\s*\n*type & base ip:\s*(\d+)/i);
                if (foundationMatch) results.network.foundationIp = foundationMatch[1];

                const typeBaseMatch = rtcText.match(/type & base ip:\s*(\d+)/i);
                if (typeBaseMatch) results.network.typeBaseIp = typeBaseMatch[1];

                // IP - ищем реальный IP после "ip:" (не foundation)
                const ipMatch = rtcText.match(/\nip:\s*([0-9.]+)/i);
                if (ipMatch) results.network.ip = ipMatch[1];

                // SDP capabilities
                const sdpMatch = rtcText.match(/sdp capabilities:\s*\n*([a-f0-9]+)/i);
                if (sdpMatch) results.network.sdpCapabilities = sdpMatch[1];

                // Stun connection
                const stunMatch = rtcText.match(/stun connection:\s*\n*([^\n]+)/i);
                if (stunMatch) results.network.stunConnection = stunMatch[1].trim();

                // Devices
                const devicesMatch = rtcText.match(/devices\s*\((\d+)\):\s*\n*([^\n]+)/i);
                if (devicesMatch) {
                    results.network.webrtc = `devices: ${devicesMatch[1]} (${devicesMatch[2].trim()})`;
                }
            }

            // === Intl ===
            // Format: Intl[hash]\n[locale]\n[dateFormat]\n[displayNames]\n[numberFormat]\n[relativeTime]\n[pluralRules]\n[pluralCategory]
            const intlSection = fullText.match(/Intl([a-f0-9]*)\s*([\s\S]*?)(?=\d+\.\d+ms\s+Headless|$)/i);
            if (intlSection) {
                results.intl.hash = intlSection[1];
                const lines = intlSection[2].split('\n').filter(l => l.trim());
                if (lines[0]) results.intl.locale = lines[0].trim();
                if (lines[1]) results.intl.dateFormat = lines[1].trim();
                if (lines[2]) results.intl.displayNames = lines[2].trim();
                if (lines[3]) results.intl.numberFormat = lines[3].trim();
                if (lines[4]) results.intl.relativeTime = lines[4].trim();
                if (lines[5]) results.intl.pluralRules = lines[5].trim();
                if (lines[6]) results.intl.pluralCategory = lines[6].trim();
            }

            // === CANVAS 2D ===
            const canvasSection = fullText.match(/Canvas\s*2d([a-f0-9]*)\s*([\s\S]*?)(?=\d+\.\d+ms\s+Fonts|$)/i);
            if (canvasSection) {
                results.fingerprints.canvasHash = canvasSection[1];
                const canvasText = canvasSection[2];
                results.fingerprints.canvas = canvasText.substring(0, 500).trim();

                // Data hash
                const dataHashMatch = canvasText.match(/data:\s*\n*([a-f0-9]+)/i);
                if (dataHashMatch) results.fingerprints.canvasDataHash = dataHashMatch[1];

                // textMetrics
                const textMetricsMatch = canvasText.match(/textMetrics:\s*\n*([0-9.-]+)/i);
                if (textMetricsMatch) results.fingerprints.canvasTextMetrics = textMetricsMatch[1];

                // Emoji pattern - ищем строку с emoji после textMetrics (содержит Unicode символы > U+1F000)
                const emojiLineMatch = canvasText.match(/textMetrics:[\s\S]*?\n([^\n]*[\u{1F300}-\u{1F9FF}][^\n]*)/u);
                if (emojiLineMatch) results.fingerprints.canvasEmoji = emojiLineMatch[1].trim();
            }

            // === WebGL ===
            const webglSection = fullText.match(/WebGL([a-f0-9]*)\s*([\s\S]*?)(?=\d+\.\d+ms\s+Screen|$)/i);
            if (webglSection) {
                results.fingerprints.webglHash = webglSection[1];
                const wglText = webglSection[2];

                // Images hash
                const imagesMatch = wglText.match(/images:([a-f0-9]+)/i);
                if (imagesMatch) results.fingerprints.webglImages = imagesMatch[1];

                // Pixels hash
                const pixelsMatch = wglText.match(/pixels:([a-f0-9]+)/i);
                if (pixelsMatch) results.fingerprints.webglPixels = pixelsMatch[1];

                // Params (count): hash
                const paramsMatch = wglText.match(/params\s*\((\d+)\):\s*\n*([a-f0-9]+)/i);
                if (paramsMatch) {
                    results.fingerprints.webglParamsCount = parseInt(paramsMatch[1]);
                    results.fingerprints.webglParams = paramsMatch[2];
                }

                // Exts (count): hash
                const extsMatch = wglText.match(/exts\s*\((\d+)\):\s*\n*([a-f0-9]+)/i);
                if (extsMatch) {
                    results.fingerprints.webglExtsCount = parseInt(extsMatch[1]);
                    results.fingerprints.webglExts = extsMatch[2];
                }

                // GPU confidence
                const confMatch = wglText.match(/confidence:\s*(\w+)/i);
                if (confMatch) results.fingerprints.webglConfidence = confMatch[1];

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

                const loadMatch = fontsText.match(/load\s*\(([^)]+)\):\s*([^\n]+)/i);
                if (loadMatch) results.fingerprints.fonts = `load (${loadMatch[1]}): ${loadMatch[2].trim()}`;

                // Apps status
                const appsMatch = fontsText.match(/apps:\s*(\w+)/i);
                if (appsMatch) results.fingerprints.fontsApps = appsMatch[1];

                // Font list - long line with comma-separated fonts
                const fontListMatch = fontsText.match(/apps:\s*\w+\s*\n([^\n]+)/i);
                if (fontListMatch && fontListMatch[1].includes(',')) {
                    results.fingerprints.fontsList = fontListMatch[1].trim();
                }

                const pixelsMatch = fontsText.match(/pixels:\s*([^\n]+)/i);
                if (pixelsMatch) results.fingerprints.fonts += `, pixels: ${pixelsMatch[1].trim()}`;
            }

            // === SCREEN ===
            const screenSection = fullText.match(/Screen([a-f0-9]*)\s*([\s\S]*?)(?=\d+\.\d+ms\s+Canvas|$)/i);
            if (screenSection) {
                results.fingerprints.screenHash = screenSection[1];
                const screenText = screenSection[2];

                // Main screen resolution
                const screenMatch = screenText.match(/screen:\s*(\d+\s*x\s*\d+)/i);
                if (screenMatch) results.fingerprints.screen = screenMatch[1];

                // Available screen
                const availMatch = screenText.match(/avail:\s*(\d+\s*x\s*\d+)/i);
                if (availMatch) results.fingerprints.screenAvail = availMatch[1];

                // Touch
                const touchMatch = screenText.match(/touch:\s*(\w+)/i);
                if (touchMatch) results.fingerprints.screen = (results.fingerprints.screen || '') + `, touch: ${touchMatch[1]}`;

                // Depth
                const depthMatch = screenText.match(/depth:\s*([^\n]+)/i);
                if (depthMatch) results.fingerprints.screenDepth = depthMatch[1].trim();

                // Viewport - multiple values on separate lines after "viewport:"
                const viewportMatch = screenText.match(/viewport:\s*([\s\S]*?)$/i);
                if (viewportMatch) {
                    const vpLines = viewportMatch[1].split('\n').filter(l => l.trim()).slice(0, 10);
                    results.fingerprints.screenViewport = vpLines.map(l => l.trim()).join(', ');
                }

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
            // Формат может быть:
            // 1. "Features[hash]\nJS/DOM:\n317\nv131" - старый формат
            // 2. "Features: 113-115+\nJS/DOM:  \n...\n(v114-115)" - новый формат с version range
            const featuresSection = fullText.match(/Features([a-f0-9]*)\s*([\s\S]*?)(?=\d+\.\d+ms\s+CSS Media|CSS Media Queries|$)/i);
            if (featuresSection) {
                const featText = featuresSection[2];

                // Парсим Features range из заголовка: "Features: 113-115+"
                const featRangeMatch = fullText.match(/Features[a-f0-9]*:\s*(\d+)-(\d+)\+?/i);
                if (featRangeMatch) {
                    results.features.rangeMin = parseInt(featRangeMatch[1]);
                    results.features.rangeMax = parseInt(featRangeMatch[2]);
                    results.features.range = `${featRangeMatch[1]}-${featRangeMatch[2]}`;
                }

                // JS/DOM может быть в формате:
                // 1. "JS/DOM:\n317\nv131" - значение после заголовка
                // 2. "JS/DOM:  \n...\n(v114-115)" - version range в конце секции
                const jsdomMatch = featText.match(/JS\s*[\/\\]\s*DOM[:\s]*\n?\s*(\d+)(?:\s*\n?\s*v?(\d+))?/i);
                if (jsdomMatch) {
                    results.features.jsdom = parseInt(jsdomMatch[1]);
                    if (jsdomMatch[2]) results.features.jsdomVersion = parseInt(jsdomMatch[2]);
                }
                // Парсим version range формат "(v114-115)"
                const jsdomVersionMatch = featText.match(/JS\s*[\/\\]\s*DOM[\s\S]*?\(v(\d+)-(\d+)\)/i);
                if (jsdomVersionMatch) {
                    results.features.jsdomVersionRange = `v${jsdomVersionMatch[1]}-${jsdomVersionMatch[2]}`;
                    if (!results.features.jsdomVersion) {
                        results.features.jsdomVersion = parseInt(jsdomVersionMatch[2]);
                    }
                }

                // CSS - аналогично
                const cssMatch = featText.match(/\nCSS[:\s]*\n?\s*(\d+)(?:\s*\n?\s*v?(\d+))?/i);
                if (cssMatch) {
                    results.features.css = parseInt(cssMatch[1]);
                    if (cssMatch[2]) results.features.cssVersion = parseInt(cssMatch[2]);
                }
                const cssVersionMatch = featText.match(/\nCSS[\s\S]*?\(v(\d+)-(\d+)\)/i);
                if (cssVersionMatch) {
                    results.features.cssVersionRange = `v${cssVersionMatch[1]}-${cssVersionMatch[2]}`;
                    if (!results.features.cssVersion) {
                        results.features.cssVersion = parseInt(cssVersionMatch[2]);
                    }
                }

                // Window (в Features секции)
                const windowFeatMatch = featText.match(/\nWindow[:\s]*\n?\s*(\d+)(?:\s*\n?\s*v?(\d+))?/i);
                if (windowFeatMatch) {
                    results.features.window = parseInt(windowFeatMatch[1]);
                    if (windowFeatMatch[2]) results.features.windowVersion = parseInt(windowFeatMatch[2]);
                }
                const windowVersionMatch = featText.match(/\nWindow[\s\S]*?\(v(\d+)-(\d+)\)/i);
                if (windowVersionMatch) {
                    results.features.windowVersionRange = `v${windowVersionMatch[1]}-${windowVersionMatch[2]}`;
                    if (!results.features.windowVersion) {
                        results.features.windowVersion = parseInt(windowVersionMatch[2]);
                    }
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

                // Keys (count): hash
                const keysMatch = compText.match(/keys\s*\((\d+)\):\s*\n*([a-f0-9]+)/i);
                if (keysMatch) {
                    results.computedStyle.keys = parseInt(keysMatch[1]);
                    results.computedStyle.keysHash = keysMatch[2];
                }

                // System styles: hash
                const systemMatch = compText.match(/system styles:\s*\n*([a-f0-9]+)/i);
                if (systemMatch) results.computedStyle.systemStylesHash = systemMatch[1];
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
            // 1. "1.20msWindow243e46a1\nkeys (1196):" - время + hash в заголовке, без hash после keys
            // 2. "Window\nkeys (1283): 996adf46" - hash после keys
            // 3. "Window996adf46\nkeys (1283):" - hash в заголовке, без hash после keys
            // Важно: перед Window может быть время (например "1.20ms")
            const windowSection = fullText.match(/(?:\d+\.\d+ms\s*)?Window([a-f0-9]+)\s*([\s\S]*?)(?=\d+\.\d+ms\s*HTMLElement|$)/i);
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
            const navSection = fullText.match(/Navigator([a-f0-9]*)\s*([\s\S]*?)(?=\nStatus[a-f0-9]|$)/i);
            if (navSection) {
                results.navigator.hash = navSection[1];
                const navText = navSection[2];

                // Properties (count): hash
                const propsMatch = navText.match(/properties\s*\((\d+)\):\s*\n*([a-f0-9]+)/i);
                if (propsMatch) {
                    results.navigator.propertiesCount = parseInt(propsMatch[1]);
                    results.navigator.propertiesHash = propsMatch[2];
                }

                const dntMatch = navText.match(/dnt:\s*(\w+)/i);
                if (dntMatch) results.navigator.dnt = dntMatch[1];

                const gpcMatch = navText.match(/gpc:\s*(\w+)/i);
                if (gpcMatch) results.navigator.gpc = gpcMatch[1];

                const langMatch = navText.match(/lang:\s*([^\n]+)/i);
                if (langMatch) results.navigator.lang = langMatch[1].trim();

                // mimeTypes (count): hash
                const mimeTypesFullMatch = navText.match(/mimeTypes\s*\((\d+)\):\s*\n*([a-f0-9]+)/i);
                if (mimeTypesFullMatch) {
                    results.navigator.mimeTypesCount = parseInt(mimeTypesFullMatch[1]);
                    results.navigator.mimeTypesHash = mimeTypesFullMatch[2];
                    results.navigator.mimeTypes = mimeTypesFullMatch[1];
                } else {
                    const mimeTypesCountMatch = navText.match(/mimeTypes\s*\((\d+)\)/i);
                    if (mimeTypesCountMatch) {
                        results.navigator.mimeTypes = mimeTypesCountMatch[1];
                        results.navigator.mimeTypesCount = parseInt(mimeTypesCountMatch[1]);
                    }
                }

                // permissions (count): hash
                const permissionsFullMatch = navText.match(/permissions\s*\((\d+)\):\s*\n*([a-f0-9]+)/i);
                if (permissionsFullMatch) {
                    results.navigator.permissionsCount = parseInt(permissionsFullMatch[1]);
                    results.navigator.permissionsHash = permissionsFullMatch[2];
                    results.navigator.permissions = permissionsFullMatch[1];
                } else {
                    const permissionsCountMatch = navText.match(/permissions\s*\((\d+)\)/i);
                    if (permissionsCountMatch) {
                        results.navigator.permissions = permissionsCountMatch[1];
                        results.navigator.permissionsCount = parseInt(permissionsCountMatch[1]);
                    }
                }

                // plugins (count): hash
                const pluginsFullMatch = navText.match(/plugins\s*\((\d+)\):\s*\n*([a-f0-9]+)/i);
                if (pluginsFullMatch) {
                    results.navigator.pluginsCount = parseInt(pluginsFullMatch[1]);
                    results.navigator.pluginsHash = pluginsFullMatch[2];
                    results.navigator.plugins = pluginsFullMatch[2];
                } else {
                    const pluginsMatch = navText.match(/plugins\s*\((\d+)\):\s*([^\n]+)/i);
                    if (pluginsMatch) {
                        results.navigator.pluginsCount = parseInt(pluginsMatch[1]);
                        results.navigator.plugins = pluginsMatch[2].trim();
                    }
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

                // RAM может быть как "memory:" так и "ram:" в комбинированной строке
                const memoryMatch = navText.match(/memory:\s*([0-9.]+)/i);
                if (memoryMatch) results.navigator.memory = parseFloat(memoryMatch[1]);

                const ramMatch = navText.match(/ram:\s*(\d+)/i);
                if (ramMatch && !results.navigator.memory) results.navigator.memory = parseFloat(ramMatch[1]);

                // Touch из комбинированной строки "cores: X, ram: Y, touch: Z"
                const touchMatch = navText.match(/touch:\s*(\d+)/i);
                if (touchMatch) results.navigator.touch = parseInt(touchMatch[1]);

                const cookieMatch = navText.match(/cookieEnabled:\s*(\w+)/i);
                if (cookieMatch) results.navigator.cookieEnabled = cookieMatch[1] === 'true';

                const touchPointsMatch = navText.match(/maxTouchPoints:\s*(\d+)/i);
                if (touchPointsMatch) results.navigator.maxTouchPoints = parseInt(touchPointsMatch[1]);

                const pdfMatch = navText.match(/pdfViewerEnabled:\s*(\w+)/i);
                if (pdfMatch) results.navigator.pdfViewerEnabled = pdfMatch[1] === 'true';

                // linuxVersion (для Linux профилей)
                const linuxVersionMatch = navText.match(/linux version:\s*([^\n]+)/i);
                if (linuxVersionMatch) results.navigator.linuxVersion = linuxVersionMatch[1].trim();
            }

            // === STATUS ===
            const statusSection = fullText.match(/Status([a-f0-9]*)\s*([\s\S]*?)$/i);
            if (statusSection) {
                results.status.hash = statusSection[1];
                const statText = statusSection[2];

                // Network
                const rttMatch = statText.match(/rtt:\s*(\d+)/i);
                if (rttMatch) results.status.network.rtt = parseInt(rttMatch[1]);

                const downlinkMatch = statText.match(/downlink:\s*([0-9.]+)/i);
                if (downlinkMatch) results.status.network.downlink = parseFloat(downlinkMatch[1]);

                const effectiveTypeMatch = statText.match(/effectiveType:\s*(\w+)/i);
                if (effectiveTypeMatch) results.status.network.effectiveType = effectiveTypeMatch[1];

                // saveData
                const saveDataMatch = statText.match(/saveData:\s*(\w+)/i);
                if (saveDataMatch) results.status.network.saveData = saveDataMatch[1] === 'true';

                // Battery
                const levelMatch = statText.match(/level:\s*([0-9.]+)/i);
                if (levelMatch) results.status.battery.level = parseFloat(levelMatch[1]);

                const chargingMatch = statText.match(/charging:\s*(\w+)/i);
                if (chargingMatch) results.status.battery.charging = chargingMatch[1] === 'true';

                // chargeTime / dischargeTime
                const chargeTimeMatch = statText.match(/charge\s*time:\s*([^\n,]+)/i);
                if (chargeTimeMatch) results.status.battery.chargeTime = chargeTimeMatch[1].trim();

                const dischargeTimeMatch = statText.match(/discharge\s*time:\s*([^\n,]+)/i);
                if (dischargeTimeMatch) results.status.battery.dischargeTime = dischargeTimeMatch[1].trim();

                // Available
                const storageMatch = statText.match(/storage:\s*([0-9.]+\s*\w+)/i);
                if (storageMatch) results.status.available.storage = storageMatch[1].trim();

                const memAvailMatch = statText.match(/memory:\s*([0-9.]+\s*\w+)/i);
                if (memAvailMatch) results.status.available.memory = memAvailMatch[1].trim();

                const timingMatch = statText.match(/timing res(?:olution)?:\s*([^\n]+)/i);
                if (timingMatch) results.status.available.timingRes = timingMatch[1].trim();

                // timingRes2 - альтернативный формат
                const timingRes2Match = statText.match(/timing res\s*2:\s*([^\n]+)/i);
                if (timingRes2Match) results.status.available.timingRes2 = timingRes2Match[1].trim();

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
