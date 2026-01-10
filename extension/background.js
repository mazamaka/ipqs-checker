// Background script (Firefox compatible)

const SERVER_URL = 'https://check-ipqs.farm-mafia.cash';

// Use browser.* API (Firefox) with chrome.* fallback
const api = typeof browser !== 'undefined' ? browser : chrome;

// Listen for messages from content script
api.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'IPQS_DATA') {
        console.log('[IPQS Checker] Received fingerprint data:', message.data);
        // Store latest data
        api.storage.local.set({ lastFingerprint: message.data });
    }
});

console.log('[IPQS Checker] Background script loaded');
