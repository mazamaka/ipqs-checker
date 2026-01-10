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

// Listen for IPQS fetch responses
api.webRequest.onBeforeRequest.addListener(
    function(details) {
        if (details.url.includes('ipqscdn.com') && details.url.includes('learn/fetch')) {
            console.log('[IPQS Checker] Detected IPQS fetch request');

            let filter = api.webRequest.filterResponseData(details.requestId);
            let decoder = new TextDecoder("utf-8");
            let data = "";

            filter.ondata = event => {
                data += decoder.decode(event.data, {stream: true});
                filter.write(event.data);
            };

            filter.onstop = async event => {
                filter.disconnect();

                try {
                    const jsonData = JSON.parse(data);
                    if (jsonData.fraud_chance !== undefined) {
                        console.log('[IPQS Checker] Got fingerprint data, fraud_chance:', jsonData.fraud_chance);
                        await sendToServer(jsonData, details.tabId);
                    }
                } catch (e) {
                    console.error('[IPQS Checker] Failed to parse response:', e);
                }
            };
        }
    },
    { urls: ["*://*.ipqscdn.com/*"] },
    ["blocking"]
);

// Send data to our server
async function sendToServer(data, tabId) {
    const sid = await getSessionId();

    try {
        await fetch(SERVER_URL + '/api/extension/report', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: sid,
                fingerprint: data,
                source: 'indeed.com',
                timestamp: Date.now()
            })
        });
        console.log('[IPQS Checker] Fingerprint sent to server successfully');

        // Store locally
        await api.storage.local.set({ lastFingerprint: data, lastCheck: Date.now() });

        // Close the indeed tab and open results
        if (tabId) {
            try {
                // Open results page first
                await api.tabs.create({
                    url: SERVER_URL + '/result?session=' + sid,
                    active: true
                });

                // Then close the indeed tab
                setTimeout(() => {
                    api.tabs.remove(tabId).catch(() => {});
                }, 500);
            } catch (e) {
                console.log('[IPQS Checker] Could not manage tabs:', e);
            }
        }
    } catch (e) {
        console.error('[IPQS Checker] Failed to send to server:', e);
    }
}

// Listen for messages from popup or content script
api.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'GET_SESSION') {
        getSessionId().then(sid => sendResponse({ sessionId: sid }));
        return true; // async response
    }

    if (message.type === 'START_CHECK') {
        // Open indeed.com to trigger IPQS check
        api.tabs.create({
            url: 'https://secure.indeed.com/account/login',
            active: false
        });
        sendResponse({ status: 'started' });
    }

    if (message.type === 'IPQS_DATA') {
        sendToServer(message.data, sender.tab?.id);
    }
});

console.log('[IPQS Checker] Background script loaded - monitoring IPQS requests');
