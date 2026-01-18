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

                // Ждём пока ВСЕ секции загрузятся (Status обычно последний)
                const statusLoaded = text.includes('Status') && text.includes('available:');
                const navigatorLoaded = text.includes('Navigator') && text.includes('permissions:');

                if ((!statusLoaded || !navigatorLoaded) && Date.now() - startTime < 60000) {
                    console.log('[CreepJS Content] Ждём загрузки всех секций...');
                    await new Promise(r => setTimeout(r, 3000));
                    continue;
                }

                // Даём время для полного рендера
                await new Promise(r => setTimeout(r, 5000));

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
                voicesCount: null
            },
            media: {
                hash: null,
                devices: null,
                devicesCount: null
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
            const workerSection = fullText.match(/Worker([a-f0-9]*)\s*([\s\S]*?)(?=\d+\.\d+ms\s+WebGL|$)/i);
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

                const ipMatch = rtcText.match(/ip:\s*([0-9a-f.:]+)/i);
                if (ipMatch) results.network.ip = ipMatch[1];

                const devicesMatch = rtcText.match(/devices\s*\((\d+)\):\s*\n*([^\n]+)/i);
                if (devicesMatch) {
                    results.network.webrtc = `devices: ${devicesMatch[1]} (${devicesMatch[2].trim()})`;
                }
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
            const audioSection = fullText.match(/Audio([a-f0-9]*)\s*([\s\S]*?)(?=\d+\.\d+ms\s+Speech|$)/i);
            if (audioSection) {
                results.fingerprints.audioHash = audioSection[1];
                const audioText = audioSection[2];

                const sumMatch = audioText.match(/sum:\s*([0-9.-]+)/i);
                if (sumMatch) results.fingerprints.audio = `sum: ${sumMatch[1]}`;

                const copyMatch = audioText.match(/copy:\s*([0-9.-]+)/i);
                if (copyMatch) results.fingerprints.audio += `, copy: ${copyMatch[1]}`;
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
            const featuresSection = fullText.match(/Features([a-f0-9]*)\s*([\s\S]*?)(?=\d+\.\d+ms\s+CSS Media Queries|$)/i);
            if (featuresSection) {
                const featText = featuresSection[2];

                const jsdomMatch = featText.match(/JS\/DOM:\s*(\d+)(?:\s*v?(\d+))?/i);
                if (jsdomMatch) {
                    results.features.jsdom = parseInt(jsdomMatch[1]);
                    if (jsdomMatch[2]) results.features.jsdomVersion = parseInt(jsdomMatch[2]);
                }

                const cssMatch = featText.match(/CSS:\s*(\d+)(?:\s*v?(\d+))?/i);
                if (cssMatch) {
                    results.features.css = parseInt(cssMatch[1]);
                    if (cssMatch[2]) results.features.cssVersion = parseInt(cssMatch[2]);
                }

                const windowMatch = featText.match(/Window:\s*(\d+)(?:\s*v?(\d+))?/i);
                if (windowMatch) {
                    results.features.window = parseInt(windowMatch[1]);
                    if (windowMatch[2]) results.features.windowVersion = parseInt(windowMatch[2]);
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
            const windowSection = fullText.match(/Window([a-f0-9]*)\s*([\s\S]*?)(?=\d+\.\d+ms\s+HTMLElement|$)/i);
            if (windowSection) {
                results.windowData.hash = windowSection[1];
                const winText = windowSection[2];

                const keysMatch = winText.match(/keys\s*\((\d+)\):\s*([^\n]+)/i);
                if (keysMatch) {
                    results.windowData.keysCount = parseInt(keysMatch[1]);
                    results.windowData.keys = keysMatch[2].trim();
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
            const speechSection = fullText.match(/Speech([a-f0-9]*)\s*([\s\S]*?)(?=\d+\.\d+ms\s+Media|$)/i);
            if (speechSection) {
                results.speech.hash = speechSection[1];
                const speechText = speechSection[2];

                const voicesMatch = speechText.match(/voices\s*\((\d+)\):\s*([^\n]+)/i);
                if (voicesMatch) {
                    results.speech.voicesCount = parseInt(voicesMatch[1]);
                    results.speech.voices = voicesMatch[2].trim();
                }
            }

            // === Media ===
            const mediaSection = fullText.match(/Media([a-f0-9]*)\s*([\s\S]*?)(?=\d+\.\d+ms\s+Audio|$)/i);
            if (mediaSection) {
                results.media.hash = mediaSection[1];
                const mediaText = mediaSection[2];

                const devicesMatch = mediaText.match(/devices\s*\((\d+)\):\s*([^\n]+)/i);
                if (devicesMatch) {
                    results.media.devicesCount = parseInt(devicesMatch[1]);
                    results.media.devices = devicesMatch[2].trim();
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
