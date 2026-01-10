// Background Service Worker для Chrome MV3
const SERVER_URL = 'https://check-ipqs.farm-mafia.cash';

let currentSessionId = null;
let pendingFingerprint = null;

// Генерация ID сессии
function generateSessionId() {
    return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Отправка данных на сервер
async function sendToServer(sessionId, fingerprint) {
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
        console.log('[IPQS Background] Server response:', result);
        return result;
    } catch (error) {
        console.error('[IPQS Background] Send error:', error);
        throw error;
    }
}

// Очистка данных indeed.com
async function clearIndeedData() {
    const since = Date.now() - (365 * 24 * 60 * 60 * 1000); // 1 год
    
    try {
        await chrome.browsingData.remove({
            origins: ['https://indeed.com', 'https://www.indeed.com', 'https://secure.indeed.com']
        }, {
            cookies: true,
            cache: true,
            localStorage: true,
            indexedDB: true
        });
        console.log('[IPQS Background] Indeed data cleared');
    } catch (e) {
        console.error('[IPQS Background] Clear error:', e);
    }
}

// Слушаем сообщения от content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[IPQS Background] Message received:', message.type);

    if (message.type === 'IPQS_FINGERPRINT' && currentSessionId) {
        const fingerprint = message.data;
        console.log('[IPQS Background] Got fingerprint for session:', currentSessionId);
        
        // Отправляем на сервер
        sendToServer(currentSessionId, fingerprint)
            .then(() => {
                // Открываем страницу результатов
                chrome.tabs.create({
                    url: `${SERVER_URL}/result?session=${currentSessionId}`
                });
            })
            .catch(err => {
                console.error('[IPQS Background] Failed to send:', err);
            });
        
        sendResponse({ status: 'ok' });
    }
    
    if (message.type === 'START_CHECK') {
        currentSessionId = generateSessionId();
        console.log('[IPQS Background] Starting check, session:', currentSessionId);
        
        // Очищаем данные и открываем indeed
        clearIndeedData().then(() => {
            chrome.tabs.create({
                url: 'https://secure.indeed.com/auth'
            });
        });
        
        sendResponse({ sessionId: currentSessionId });
    }

    return true; // async response
});

console.log('[IPQS Background] Service Worker started');
