// Content script for indeed.com - intercepts IPQS fingerprint data

(function() {
    'use strict';

    const SERVER_URL = 'https://check-ipqs.farm-mafia.cash';
    let dataSent = false;

    // Send data to our server
    async function sendToServer(data) {
        if (dataSent) return;
        dataSent = true;

        const sessionId = 'default';

        try {
            const response = await fetch(SERVER_URL + '/api/extension/report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    session_id: sessionId,
                    fingerprint: data,
                    source: 'indeed.com',
                    timestamp: Date.now()
                })
            });
            console.log('[IPQS Checker] Fingerprint sent to server:', data.fraud_chance + '%');

            // Notify extension background
            const api = typeof browser !== 'undefined' ? browser : chrome;
            api.runtime.sendMessage({ type: 'IPQS_DATA', data: data });
        } catch (e) {
            console.error('[IPQS Checker] Failed to send:', e);
        }
    }

    // Hook into IPQS Startup when it becomes available
    function hookStartup() {
        if (typeof Startup !== 'undefined' && Startup.Store) {
            console.log('[IPQS Checker] Found Startup, hooking...');

            // Call Startup.Store to get the data
            Startup.Store(function(data) {
                console.log('[IPQS Checker] Got IPQS data');
                sendToServer(data);
            }, function(error) {
                console.error('[IPQS Checker] IPQS error:', error);
            });

            return true;
        }
        return false;
    }

    // Also listen for IPQS callback via MutationObserver on script elements
    function watchForIPQS() {
        // Try immediately
        if (hookStartup()) return;

        // Keep trying every 500ms for 30 seconds
        let attempts = 0;
        const interval = setInterval(() => {
            attempts++;
            if (hookStartup() || attempts > 60) {
                clearInterval(interval);
            }
        }, 500);
    }

    // Start watching when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', watchForIPQS);
    } else {
        watchForIPQS();
    }

    console.log('[IPQS Checker] Content script loaded');
})();
