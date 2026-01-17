// Background Service Worker для Chrome MV3
// Поддержка IPQS (indeed.com) и Fingerprint Pro (fingerprint.com)
const SERVER_URL = 'https://check.maxbob.xyz';

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
    addLog('Открываю страницу результатов...');

    // Формируем URL результатов
    const resultUrl = service === 'fingerprint'
        ? `${SERVER_URL}/result-fp?session=${sessionId}`
        : `${SERVER_URL}/result?session=${sessionId}`;

    // Редирект вкладки проверки на страницу результатов (вместо закрытия)
    if (checkTabId) {
        try {
            await chrome.tabs.update(checkTabId, { url: resultUrl, active: true });
            addLog(`Вкладка ${checkTabId} перенаправлена на результаты`);
        } catch (e) {
            // Если вкладка закрыта — создаём новую
            addLog(`Вкладка закрыта, создаю новую: ${e.message}`);
            chrome.tabs.create({ url: resultUrl });
        }
        checkTabId = null;
    } else {
        // Вкладки нет — создаём новую
        chrome.tabs.create({ url: resultUrl });
    }

    // Очищаем данные после проверки (в фоне)
    if (service === 'ipqs') {
        clearIndeedData();
    } else {
        clearFingerprintData();
    }
    addLog('Данные очищены после проверки');

    // Сохраняем в историю
    await addToHistory(sessionId, lastFingerprint, service);

    // Сохраняем результат для popup
    chrome.storage.local.set({
        lastFingerprint: lastFingerprint,
        lastCheck: new Date().toISOString(),
        lastService: service,
        checkComplete: true
    });
}

// Добавление в историю проверок
async function addToHistory(sessionId, fingerprint, service) {
    const MAX_HISTORY = 10;
    const data = await chrome.storage.local.get('checkHistory');
    const history = data.checkHistory || [];

    let score;
    if (service === 'fingerprint') {
        score = fingerprint.products?.suspectScore?.data?.result || 0;
    } else {
        score = fingerprint.fraud_chance || 0;
    }

    const newItem = {
        sessionId: sessionId,
        service: service,
        score: score,
        time: new Date().toLocaleString('ru-RU')
    };

    // Add to beginning, limit to MAX_HISTORY
    history.unshift(newItem);
    if (history.length > MAX_HISTORY) {
        history.pop();
    }

    await chrome.storage.local.set({ checkHistory: history });
    addLog(`Добавлено в историю: ${service} - ${score}`);
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
                active: true
            }, (tab) => {
                checkTabId = tab.id;
                addLog(`Открыта вкладка ID: ${tab.id}`);
                // Принудительная активация для Octo Browser
                setTimeout(() => {
                    chrome.tabs.update(tab.id, { active: true });
                    chrome.windows.update(tab.windowId, { focused: true });
                }, 100);
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

addLog('Service Worker запущен v2.1');
