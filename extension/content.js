// Content script for indeed.com - backup interceptor for IPQS fingerprint data
// Main interception happens in background.js via webRequest.filterResponseData
// This is a fallback if filterResponseData doesn't catch the data

(function() {
    'use strict';

    const api = typeof browser !== 'undefined' ? browser : chrome;
    let dataSent = false;

    // Send data via background script (proper session handling)
    function sendViaBackground(data) {
        if (dataSent) return;
        dataSent = true;

        console.log('[IPQS Content] Sending fingerprint via background script');
        api.runtime.sendMessage({
            type: 'IPQS_DATA',
            data: data
        });
    }

    // Hook into IPQS Startup when it becomes available (fallback method)
    function hookStartup() {
        if (typeof Startup !== 'undefined' && Startup.Store) {
            console.log('[IPQS Content] Found Startup, hooking...');

            // Call Startup.Store to get the data
            Startup.Store(function(data) {
                console.log('[IPQS Content] Got IPQS data via Startup.Store');
                sendViaBackground(data);
            }, function(error) {
                console.error('[IPQS Content] IPQS Startup error:', error);
            });

            return true;
        }
        return false;
    }

    // Keep trying to hook Startup
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

    console.log('[IPQS Content] Content script loaded (backup interceptor)');
})();
