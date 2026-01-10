// Background script - intercept IPQS responses via webRequest

const SERVER_URL = 'https://check-ipqs.farm-mafia.cash';
const api = typeof browser !== 'undefined' ? browser : chrome;

// Store for collecting response data
let responseData = {};

// Listen for IPQS fetch responses (both GET and POST)
api.webRequest.onBeforeRequest.addListener(
    function(details) {
        console.log('[IPQS Checker] Request:', details.method, details.url);

        if (details.url.includes('ipqscdn.com') && details.url.includes('learn/fetch')) {
            console.log('[IPQS Checker] Detected IPQS fetch request:', details.url);

            // Use a filter to read the response
            let filter = api.webRequest.filterResponseData(details.requestId);
            let decoder = new TextDecoder("utf-8");
            let encoder = new TextEncoder();
            let data = "";

            filter.ondata = event => {
                data += decoder.decode(event.data, {stream: true});
                filter.write(event.data);
            };

            filter.onstop = event => {
                filter.disconnect();

                try {
                    const jsonData = JSON.parse(data);
                    if (jsonData.fraud_chance !== undefined) {
                        console.log('[IPQS Checker] Got fingerprint data, fraud_chance:', jsonData.fraud_chance);
                        sendToServer(jsonData);
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
async function sendToServer(data) {
    try {
        await fetch(SERVER_URL + '/api/extension/report', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: 'default',
                fingerprint: data,
                source: 'indeed.com',
                timestamp: Date.now()
            })
        });
        console.log('[IPQS Checker] Fingerprint sent to server successfully');

        // Store locally too
        api.storage.local.set({ lastFingerprint: data });
    } catch (e) {
        console.error('[IPQS Checker] Failed to send to server:', e);
    }
}

// Listen for messages from content script
api.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'IPQS_DATA') {
        console.log('[IPQS Checker] Received data from content script');
        sendToServer(message.data);
    }
});

console.log('[IPQS Checker] Background script loaded - monitoring IPQS requests');
