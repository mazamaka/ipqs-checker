// Background service worker

const SERVER_URL = 'https://check-ipqs.farm-mafia.cash';

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'IPQS_DATA') {
        console.log('[IPQS Checker] Received fingerprint data');
        // Store latest data
        chrome.storage.local.set({ lastFingerprint: message.data });
    }
});

// Listen for messages from our website
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
    if (message.type === 'CHECK_FINGERPRINT') {
        // Open indeed.com to trigger fingerprint collection
        chrome.tabs.create({
            url: 'https://secure.indeed.com/auth',
            active: false
        }, (tab) => {
            // Close tab after fingerprint is collected (give it 10 seconds)
            setTimeout(() => {
                chrome.tabs.remove(tab.id);
            }, 10000);
        });
        sendResponse({ status: 'started' });
    }

    if (message.type === 'GET_FINGERPRINT') {
        chrome.storage.local.get('lastFingerprint', (result) => {
            sendResponse({ fingerprint: result.lastFingerprint });
        });
        return true; // Keep channel open for async response
    }
});

console.log('[IPQS Checker] Background script loaded');
