// Background Service Worker для Chrome MV3
// Поддержка IPQS (indeed.com) и Fingerprint Pro (fingerprint.com)
const SERVER_URL = 'https://check-ipqs.farm-mafia.cash';

let currentSessionId = null;
let checkTabId = null;  // ID вкладки проверки
let currentService = 'ipqs';  // 'ipqs' или 'fingerprint'

// Debug logging helper
async function addLog(message) {
    console.log('[Background]', message);
    try {
        const data = await chrome.storage.local.get('debugLogs');
        const logs = data.debugLogs || [];
        const timestamp = new Date().toLocaleTimeString('ru-RU');
        logs.push(`[${timestamp}] ${message}`);
        if (logs.length > 100) logs.shift();
        await chrome.storage.local.set({ debugLogs: logs });
    } catch (e) {
        console.error('Log error:', e);
    }
}

// Генерация ID сессии
function generateSessionId() {
    return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Отправка IPQS данных на сервер
async function sendIPQSToServer(sessionId, fingerprint) {
    addLog('Отправка IPQS на сервер...');
    try {
        const response = await fetch(`${SERVER_URL}/api/extension/report`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: sessionId,
                fingerprint: fingerprint,
                source: 'chrome-extension-ipqs'
            })
        });

        const result = await response.json();
        addLog(`Сервер ответил: ${JSON.stringify(result).substring(0, 100)}`);
        return result;
    } catch (error) {
        addLog(`Ошибка отправки: ${error.message}`);
        throw error;
    }
}

// Отправка Fingerprint Pro данных на сервер
async function sendFingerprintToServer(sessionId, data) {
    addLog('Отправка Fingerprint Pro на сервер...');
    try {
        const response = await fetch(`${SERVER_URL}/api/extension/report-fp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: sessionId,
                fingerprint: data,
                source: 'chrome-extension-fingerprint'
            })
        });

        const result = await response.json();
        addLog(`Сервер ответил: ${JSON.stringify(result).substring(0, 100)}`);
        return result;
    } catch (error) {
        addLog(`Ошибка отправки: ${error.message}`);
        throw error;
    }
}

// Очистка данных indeed.com
async function clearIndeedData() {
    addLog('Очистка данных indeed.com...');
    try {
        await chrome.browsingData.remove({
            origins: ['https://indeed.com', 'https://www.indeed.com', 'https://secure.indeed.com']
        }, {
            cookies: true,
            cache: true,
            localStorage: true,
            indexedDB: true
        });
        addLog('Данные indeed.com очищены');
    } catch (e) {
        addLog(`Ошибка очистки indeed: ${e.message}`);
    }
}

// Очистка данных fingerprint.com
async function clearFingerprintData() {
    addLog('Очистка данных fingerprint.com...');
    try {
        await chrome.browsingData.remove({
            origins: ['https://fingerprint.com', 'https://www.fingerprint.com']
        }, {
            cookies: true,
            cache: true,
            localStorage: true,
            indexedDB: true
        });
        addLog('Данные fingerprint.com очищены');
    } catch (e) {
        addLog(`Ошибка очистки fingerprint: ${e.message}`);
    }
}

// Обработка завершения проверки
async function handleCheckComplete(sessionId, lastFingerprint, service) {
    addLog('Данные получены, закрываю вкладку...');

    // Небольшая задержка перед закрытием (чтобы страница успела отрисоваться)
    await new Promise(resolve => setTimeout(resolve, 500));

    // Закрываем вкладку проверки
    if (checkTabId) {
        chrome.tabs.remove(checkTabId).catch(() => {});
        checkTabId = null;
    }

    addLog('Открываю страницу результатов...');

    // Очищаем данные после проверки
    if (service === 'ipqs') {
        await clearIndeedData();
    } else {
        await clearFingerprintData();
    }
    addLog('Данные очищены после проверки');

    // Открываем страницу результатов
    const resultUrl = service === 'fingerprint'
        ? `${SERVER_URL}/result-fp?session=${sessionId}`
        : `${SERVER_URL}/result?session=${sessionId}`;

    chrome.tabs.create({ url: resultUrl });

    // Сохраняем результат для popup
    chrome.storage.local.set({
        lastFingerprint: lastFingerprint,
        lastCheck: new Date().toISOString(),
        lastService: service,
        checkComplete: true
    });
}

// Слушаем сообщения от content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    addLog(`Получено сообщение: ${message.type}`);

    // IPQS Fingerprint от indeed.com
    if (message.type === 'IPQS_FINGERPRINT') {
        chrome.storage.local.get(['sessionId', 'currentService']).then(data => {
            const sessionId = data.sessionId || currentSessionId;
            if (!sessionId) {
                addLog('Ошибка: sessionId не найден!');
                return;
            }
            currentSessionId = sessionId;

            const fingerprint = message.data;
            addLog(`Получен IPQS fingerprint для сессии ${sessionId}`);
            addLog(`Fraud Score: ${fingerprint.fraud_chance}%`);

            sendIPQSToServer(sessionId, fingerprint)
                .then(() => handleCheckComplete(sessionId, fingerprint, 'ipqs'))
                .catch(err => {
                    addLog(`Ошибка: ${err.message}`);
                    chrome.storage.local.set({ checkComplete: true, checkError: err.message });
                });
        });

        sendResponse({ status: 'ok' });
    }

    // Fingerprint Pro данные от fingerprint.com
    if (message.type === 'FINGERPRINT_DATA') {
        chrome.storage.local.get(['sessionId', 'currentService']).then(data => {
            const sessionId = data.sessionId || currentSessionId;
            if (!sessionId) {
                addLog('Ошибка: sessionId не найден!');
                return;
            }
            currentSessionId = sessionId;

            const fpData = message.data;
            const identification = fpData.products?.identification?.data;
            const tampering = fpData.products?.tampering?.data;
            const suspectScore = fpData.products?.suspectScore?.data?.result;

            addLog(`Получен Fingerprint Pro для сессии ${sessionId}`);
            addLog(`Visitor ID: ${identification?.visitorId}`);
            addLog(`Anti-detect: ${tampering?.antiDetectBrowser}`);
            addLog(`Suspect Score: ${suspectScore}`);

            sendFingerprintToServer(sessionId, fpData)
                .then(() => handleCheckComplete(sessionId, fpData, 'fingerprint'))
                .catch(err => {
                    addLog(`Ошибка: ${err.message}`);
                    chrome.storage.local.set({ checkComplete: true, checkError: err.message });
                });
        });

        sendResponse({ status: 'ok' });
    }

    // Запуск проверки
    if (message.type === 'START_CHECK') {
        const service = message.service || 'ipqs';
        currentService = service;
        currentSessionId = generateSessionId();
        addLog(`Новая сессия: ${currentSessionId} (${service})`);

        // Сохраняем sessionId и сервис
        chrome.storage.local.set({
            sessionId: currentSessionId,
            currentService: service,
            checkComplete: false,
            checkError: null
        });

        // Очищаем данные и открываем нужный сайт
        const clearFn = service === 'fingerprint' ? clearFingerprintData : clearIndeedData;
        const checkUrl = service === 'fingerprint'
            ? 'https://fingerprint.com/'
            : 'https://secure.indeed.com/auth';

        clearFn().then(() => {
            addLog(`Открываю ${checkUrl}...`);
            chrome.tabs.create({
                url: checkUrl,
                active: false  // Фоновая вкладка
            }, (tab) => {
                checkTabId = tab.id;
                addLog(`Открыта вкладка ID: ${tab.id}`);
            });
        });

        sendResponse({ sessionId: currentSessionId, service: service });
    }

    return true; // async response
});

// Очищаем checkTabId если вкладка закрыта вручную
chrome.tabs.onRemoved.addListener((tabId) => {
    if (tabId === checkTabId) {
        checkTabId = null;
    }
});

// При запуске Service Worker сбрасываем незавершённую проверку
chrome.storage.local.get(['checkComplete']).then(data => {
    if (data.checkComplete === false) {
        chrome.storage.local.set({
            checkComplete: true,
            sessionId: null,
            debugLogs: []
        });
        addLog('Сброшена незавершённая проверка');
    }
});

addLog('Service Worker запущен v2.0');
