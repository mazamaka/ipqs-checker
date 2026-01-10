// Content script for indeed.com - intercepts IPQS fingerprint data

(function() {
    'use strict';

    const SERVER_URL = 'https://check-ipqs.farm-mafia.cash';
    let dataSent = false;

    // Override XMLHttpRequest to intercept IPQS responses
    const origXHROpen = XMLHttpRequest.prototype.open;
    const origXHRSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
        this._ipqsUrl = url;
        return origXHROpen.call(this, method, url, ...rest);
    };

    XMLHttpRequest.prototype.send = function(body) {
        if (this._ipqsUrl && this._ipqsUrl.includes('ipqscdn.com')) {
            this.addEventListener('load', function() {
                try {
                    if (this.responseText && !dataSent) {
                        const data = JSON.parse(this.responseText);
                        if (data.fraud_chance !== undefined) {
                            sendToServer(data);
                        }
                    }
                } catch (e) {}
            });
        }
        return origXHRSend.call(this, body);
    };

    // Override fetch to intercept IPQS responses
    const origFetch = window.fetch;
    window.fetch = async function(url, opts) {
        const response = await origFetch.call(this, url, opts);

        if (url && url.toString().includes('ipqscdn.com')) {
            try {
                const clone = response.clone();
                const data = await clone.json();
                if (data.fraud_chance !== undefined && !dataSent) {
                    sendToServer(data);
                }
            } catch (e) {}
        }

        return response;
    };

    // Also try to hook into IPQS Startup if available
    function hookStartup() {
        if (typeof Startup !== 'undefined' && Startup.Store && !dataSent) {
            const origStore = Startup.Store;
            Startup.Store = function(callback, error) {
                return origStore.call(this, function(data) {
                    if (!dataSent) {
                        sendToServer(data);
                    }
                    if (callback) callback(data);
                }, error);
            };
        }
    }

    // Send data to our server
    async function sendToServer(data) {
        if (dataSent) return;
        dataSent = true;

        // Get session ID from localStorage (set by our page)
        const sessionId = localStorage.getItem('ipqs_session') ||
                          sessionStorage.getItem('ipqs_session') ||
                          'default';

        try {
            await fetch(SERVER_URL + '/api/extension/report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    session_id: sessionId,
                    fingerprint: data,
                    source: 'indeed.com',
                    timestamp: Date.now()
                })
            });
            console.log('[IPQS Checker] Fingerprint sent to server');

            // Notify extension background
            const api = typeof browser !== 'undefined' ? browser : chrome;
            api.runtime.sendMessage({ type: 'IPQS_DATA', data: data });
        } catch (e) {
            console.error('[IPQS Checker] Failed to send:', e);
        }
    }

    // Try hooking periodically until Startup is available
    const hookInterval = setInterval(() => {
        hookStartup();
        if (typeof Startup !== 'undefined') {
            clearInterval(hookInterval);
        }
    }, 100);

    // Stop trying after 30 seconds
    setTimeout(() => clearInterval(hookInterval), 30000);

    console.log('[IPQS Checker] Content script loaded');
})();
