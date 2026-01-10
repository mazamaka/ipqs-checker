// Background Service Worker для Chrome MV3
const SERVER_URL = 'https://check-ipqs.farm-mafia.cash';

let currentSessionId = null;
let indeedTabId = null;  // Храним ID вкладки indeed.com

// Debug logging helper
async function addLog(message) {
    console.log('[IPQS Background]', message);
    try {
        const data = await chrome.storage.local.get('debugLogs');
        const logs = data.debugLogs || [];
        const timestamp = new Date().toLocaleTimeString('ru-RU');
        logs.push(`[${timestamp}] ${message}`);
        // Keep last 100 logs
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

// Отправка данных на сервер
async function sendToServer(sessionId, fingerprint) {
    addLog('Отправка на сервер...');
    try {
        const response = await fetch(`${SERVER_URL}/api/extension/report`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: sessionId,
                fingerprint: fingerprint,
                source: 'chrome-extension'
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
        addLog('Данные очищены');
    } catch (e) {
        addLog(`Ошибка очистки: ${e.message}`);
    }
}

// Слушаем сообщения от content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    addLog(`Получено сообщение: ${message.type}`);

    if (message.type === 'IPQS_FINGERPRINT') {
        // Получаем sessionId из storage (Service Worker мог перезапуститься)
        chrome.storage.local.get(['sessionId']).then(data => {
            const sessionId = data.sessionId || currentSessionId;
            if (!sessionId) {
                addLog('Ошибка: sessionId не найден!');
                return;
            }
            currentSessionId = sessionId;

            const fingerprint = message.data;
            addLog(`Получен fingerprint для сессии ${sessionId}`);
            addLog(`Fraud Score: ${fingerprint.fraud_chance}%`);

            // Отправляем на сервер
            sendToServer(sessionId, fingerprint)
                .then(async () => {
                    addLog('Открываю страницу результатов...');

                    // Закрываем вкладку indeed.com
                    if (indeedTabId) {
                        chrome.tabs.remove(indeedTabId).catch(() => {});
                        indeedTabId = null;
                    }

                    // Очищаем данные indeed.com после проверки
                    await clearIndeedData();
                    addLog('Данные indeed.com очищены после проверки');

                    // Открываем страницу результатов
                    chrome.tabs.create({
                        url: `${SERVER_URL}/result?session=${sessionId}`
                    });

                    // Сохраняем результат для popup
                    chrome.storage.local.set({
                        lastFingerprint: fingerprint,
                        lastCheck: new Date().toISOString(),
                        checkComplete: true
                    });
                })
                .catch(err => {
                    addLog(`Ошибка: ${err.message}`);
                    chrome.storage.local.set({ checkComplete: true, checkError: err.message });
                });
        });

        sendResponse({ status: 'ok' });
    }

    if (message.type === 'START_CHECK') {
        currentSessionId = generateSessionId();
        addLog(`Новая сессия: ${currentSessionId}`);

        // Сохраняем sessionId и сбрасываем флаг завершения
        chrome.storage.local.set({
            sessionId: currentSessionId,
            checkComplete: false,
            checkError: null
        });

        // Очищаем данные и открываем indeed
        clearIndeedData().then(() => {
            addLog('Открываю secure.indeed.com/auth...');
            chrome.tabs.create({
                url: 'https://secure.indeed.com/auth',
                active: false  // Фоновая вкладка чтобы popup оставался открытым
            }, (tab) => {
                indeedTabId = tab.id;  // Сохраняем ID вкладки
                addLog(`Открыта вкладка ID: ${tab.id}`);
            });
        });

        sendResponse({ sessionId: currentSessionId });
    }

    return true; // async response
});

// Очищаем indeedTabId если вкладка закрыта вручную
chrome.tabs.onRemoved.addListener((tabId) => {
    if (tabId === indeedTabId) {
        indeedTabId = null;
    }
});

// При запуске Service Worker сбрасываем незавершённую проверку
chrome.storage.local.get(['checkComplete']).then(data => {
    if (data.checkComplete === false) {
        // Была незавершённая проверка - сбрасываем
        chrome.storage.local.set({
            checkComplete: true,
            sessionId: null,
            debugLogs: []
        });
        addLog('Сброшена незавершённая проверка');
    }
});

addLog('Service Worker запущен');
