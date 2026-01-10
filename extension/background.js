// Background script - intercept IPQS responses via webRequest

const SERVER_URL = 'https://check-ipqs.farm-mafia.cash';
const api = typeof browser !== 'undefined' ? browser : chrome;

// Generate unique session ID for this browser
let sessionId = null;

async function getSessionId() {
    if (sessionId) return sessionId;

    const stored = await api.storage.local.get('sessionId');
    if (stored.sessionId) {
        sessionId = stored.sessionId;
    } else {
        sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        await api.storage.local.set({ sessionId });
    }
    return sessionId;
}

// Log function that also saves to storage for popup to read
async function log(message) {
    const timestamp = new Date().toLocaleTimeString('ru-RU');
    const logMessage = `[${timestamp}] ${message}`;
    console.log('[IPQS]', logMessage);

    // Save last 20 logs
    const data = await api.storage.local.get('debugLogs');
    const logs = data.debugLogs || [];
    logs.push(logMessage);
    if (logs.length > 20) logs.shift();
    await api.storage.local.set({ debugLogs: logs });
}

// Clear cookies, cache and storage for indeed.com
async function clearIndeedCookies() {
    await log('Полная очистка данных indeed.com...');

    try {
        // Use browsingData API for complete cleanup
        await api.browsingData.remove({
            hostnames: ['indeed.com', 'www.indeed.com', 'secure.indeed.com']
        }, {
            cookies: true,
            cache: true,
            localStorage: true,
            indexedDB: true
        });
        await log('browsingData очищен для indeed.com');
    } catch (e) {
        await log(`browsingData ошибка: ${e.message}`);
    }

    // Also clear manually just in case
    const domains = ['.indeed.com', 'indeed.com', 'secure.indeed.com', 'www.indeed.com'];
    let totalCleared = 0;

    for (const domain of domains) {
        try {
            const cookies = await api.cookies.getAll({ domain });
            for (const cookie of cookies) {
                const url = `https://${cookie.domain.replace(/^\./, '')}${cookie.path}`;
                await api.cookies.remove({ url, name: cookie.name });
                totalCleared++;
            }
        } catch (e) {}
    }

    await log(`Очищено ${totalCleared} куков вручную`);

    // Small delay to ensure cleanup is complete
    await new Promise(r => setTimeout(r, 500));

    return totalCleared;
}

// Listen for IPQS fetch responses
api.webRequest.onBeforeRequest.addListener(
    function(details) {
        log(`IPQS запрос: ${details.url.substring(0, 100)}`);

        if (details.url.includes('learn/fetch')) {
            log('>>> ОБНАРУЖЕН IPQS fetch запрос! <<<');

            let filter = api.webRequest.filterResponseData(details.requestId);
            let decoder = new TextDecoder("utf-8");
            let data = "";

            filter.ondata = event => {
                data += decoder.decode(event.data, {stream: true});
                filter.write(event.data);
            };

            filter.onstop = async event => {
                filter.disconnect();
                await log(`Получен ответ IPQS: ${data.length} байт`);

                try {
                    const jsonData = JSON.parse(data);
                    if (jsonData.fraud_chance !== undefined) {
                        await log(`Fraud chance: ${jsonData.fraud_chance}%`);
                        await sendToServer(jsonData, details.tabId);
                    } else {
                        await log('Нет fraud_chance в ответе');
                    }
                } catch (e) {
                    await log(`Ошибка парсинга: ${e.message}`);
                }
            };

            filter.onerror = async event => {
                await log(`Filter error: ${filter.error}`);
            };
        }
    },
    { urls: ["*://*.ipqscdn.com/*", "*://ipqscdn.com/*"] },
    ["blocking"]
);

// Also log all requests to indeed.com for debugging
api.webRequest.onBeforeRequest.addListener(
    function(details) {
        if (details.url.includes('ipqs') || details.url.includes('fingerprint')) {
            log(`Indeed запрос: ${details.url.substring(0, 100)}`);
        }
    },
    { urls: ["*://*.indeed.com/*"] }
);

// Send data to our server
async function sendToServer(data, tabId) {
    const sid = await getSessionId();
    await log(`Отправляю на сервер (session: ${sid.substring(0, 20)}...)`);

    try {
        const resp = await fetch(SERVER_URL + '/api/extension/report', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: sid,
                fingerprint: data,
                source: 'indeed.com',
                timestamp: Date.now()
            })
        });

        if (resp.ok) {
            await log('Данные успешно отправлены на сервер!');
        } else {
            await log(`Ошибка сервера: ${resp.status}`);
        }

        // Store locally
        await api.storage.local.set({ lastFingerprint: data, lastCheck: Date.now() });

        // Очищаем данные indeed.com после проверки
        await clearIndeedCookies();
        await log('Данные indeed.com очищены после проверки');

        // Close the indeed tab and open results
        if (tabId) {
            try {
                await api.tabs.create({
                    url: SERVER_URL + '/result?session=' + sid,
                    active: true
                });
                setTimeout(() => {
                    api.tabs.remove(tabId).catch(() => {});
                }, 500);
            } catch (e) {
                await log(`Ошибка управления вкладками: ${e.message}`);
            }
        }
    } catch (e) {
        await log(`Ошибка отправки: ${e.message}`);
    }
}

// Listen for messages from popup or content script
api.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'GET_SESSION') {
        getSessionId().then(sid => sendResponse({ sessionId: sid }));
        return true;
    }

    if (message.type === 'GET_LOGS') {
        api.storage.local.get('debugLogs').then(data => {
            sendResponse({ logs: data.debugLogs || [] });
        });
        return true;
    }

    if (message.type === 'START_CHECK') {
        log('Получена команда START_CHECK');

        clearIndeedCookies().then(() => {
            log('Открываю secure.indeed.com/auth...');
            api.tabs.create({
                url: 'https://secure.indeed.com/auth',
                active: true
            });
        });
        sendResponse({ status: 'started' });
    }

    if (message.type === 'IPQS_DATA') {
        log('Получены данные от content script');
        sendToServer(message.data, sender.tab?.id);
    }
});

log('Background script загружен');
console.log('[IPQS Checker] Background script loaded - monitoring IPQS requests');
