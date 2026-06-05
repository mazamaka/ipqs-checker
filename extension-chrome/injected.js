// Перехватчик fetch/XHR для IPQS
(function() {
    'use strict';

    const IPQS_PATTERN = /ipqscdn\.com.*learn\/fetch/i;

    // ── Обогащение из тела запроса (dt*) ───────────────────────────────────────
    // IPQS с недавних пор отдаёт в ОТВЕТЕ только вердикт (fraud/proxy/vpn/гео).
    // Но КЛИЕНТ всё ещё шлёт богатый device-fingerprint в теле запроса learn/fetch
    // в обфусцированных ключах dt*. Достаём то, в чём уверены, и мёржим в data —
    // под теми же именами, что читает result.html / create_check.
    // ВАЖНО: это аддитивно, логику перехвата ответа не трогаем.
    function deriveBrowser(ua) {
        let m;
        if ((m = ua.match(/Edg\/(\d+)/))) return 'Edge ' + m[1];
        if ((m = ua.match(/OPR\/(\d+)/))) return 'Opera ' + m[1];
        if ((m = ua.match(/Firefox\/(\d+)/))) return 'Firefox ' + m[1];
        if ((m = ua.match(/Chrome\/(\d+)/))) return 'Chrome ' + m[1];
        if (/Safari/.test(ua) && (m = ua.match(/Version\/(\d+)/))) return 'Safari ' + m[1];
        return null;
    }
    function deriveOS(ua) {
        let m;
        if ((m = ua.match(/Windows NT ([\d.]+)/))) {
            const map = { '10.0': 'Windows 10/11', '6.3': 'Windows 8.1', '6.2': 'Windows 8', '6.1': 'Windows 7' };
            return map[m[1]] || ('Windows NT ' + m[1]);
        }
        if ((m = ua.match(/Mac OS X (\d+[._]\d+(?:[._]\d+)?)/))) return 'Mac OS X ' + m[1].replace(/_/g, '.');
        if ((m = ua.match(/Android (\d+(?:\.\d+)?)/))) return 'Android ' + m[1];
        if (/iPhone|iPad/.test(ua) && (m = ua.match(/OS (\d+[._]\d+)/))) return 'iOS ' + m[1].replace(/_/g, '.');
        if (/CrOS/.test(ua)) return 'ChromeOS';
        if (/Linux/.test(ua)) return 'Linux';
        return null;
    }

    function parseIpqsRequest(body) {
        const out = {};
        try {
            if (!body) return out;
            const str = typeof body === 'string' ? body : (body.toString ? body.toString() : '');
            if (!str || str.indexOf('dt') === -1) return out;
            const p = new URLSearchParams(str);
            const get = (k) => { try { return p.get(k); } catch (e) { return null; } };

            const ua = get('dtb');
            if (ua) {
                out.user_agent = ua;
                const br = deriveBrowser(ua); if (br) out.browser = br;
                const os = deriveOS(ua); if (os) { out.operating_system = os; out.true_os = os; }
                out.mobile = /Mobile|Android|iPhone|iPad|iPod/i.test(ua);
            }
            const dts = get('dts');              // WebGL renderer (vendor, renderer)
            if (dts) out.graphics_card = dts;
            const dtg = get('dtg');              // [width, height] экрана
            if (dtg) { try { const a = JSON.parse(dtg); if (Array.isArray(a) && a.length >= 2) out.resolution = a[0] + 'x' + a[1]; } catch (e) {} }
            const dtdt = get('dtdt');            // {locale, timeZone, ...}
            if (dtdt) { try { const o = JSON.parse(dtdt); if (o && o.timeZone) out.device_timezone = o.timeZone; } catch (e) {} }
            const dtc = get('dtc');              // язык
            if (dtc) out.language = dtc;
            const plugins = p.getAll('dtq[]');   // плагины (JSON-объекты)
            if (plugins && plugins.length) {
                const names = plugins.map(s => { try { return JSON.parse(s).name; } catch (e) { return null; } }).filter(Boolean);
                if (names.length) out.plugins = names.join(', ');
            }
            const dtme = get('dtme');            // эвристика: hardwareConcurrency
            if (dtme && /^\d+$/.test(dtme)) out.cpu_cores = parseInt(dtme, 10);
            // dtr / dtt — стабильные device-хэши (canvas/webgl); метки эвристические
            const dtr = get('dtr'); if (dtr && /^[a-f0-9]{16,}$/i.test(dtr)) out.canvas_hash = dtr;
            const dtt = get('dtt'); if (dtt && /^[a-f0-9]{16,}$/i.test(dtt)) out.webgl_hash = dtt;
        } catch (e) {
            // обогащение опционально — никогда не ломаем основной поток
        }
        return out;
    }

    function dispatchIpqs(responseData, requestBody) {
        let detail = responseData;
        try {
            const enrich = parseIpqsRequest(requestBody);
            // ответ IPQS (вердикт) имеет приоритет; обогащение лишь добавляет device-поля
            detail = Object.assign({}, enrich, responseData);
        } catch (e) { /* fall back to raw response */ }
        window.dispatchEvent(new CustomEvent('ipqs-fingerprint', { detail }));
    }

    // Перехват fetch
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        const response = await originalFetch.apply(this, args);
        const url = args[0]?.url || args[0];

        if (typeof url === 'string' && IPQS_PATTERN.test(url)) {
            try {
                const clone = response.clone();
                const data = await clone.json();
                const reqBody = (args[1] && args[1].body) || (args[0] && args[0].body) || null;
                dispatchIpqs(data, reqBody);
            } catch (e) {
                // Silent fail in production
            }
        }
        return response;
    };

    // Перехват XMLHttpRequest
    const originalXHROpen = XMLHttpRequest.prototype.open;
    const originalXHRSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
        this._ipqsUrl = url;
        return originalXHROpen.apply(this, [method, url, ...rest]);
    };

    XMLHttpRequest.prototype.send = function(...args) {
        if (this._ipqsUrl && IPQS_PATTERN.test(this._ipqsUrl)) {
            const reqBody = args && args[0];
            this.addEventListener('load', function() {
                try {
                    const data = JSON.parse(this.responseText);
                    dispatchIpqs(data, reqBody);
                } catch (e) {
                    // Silent fail in production
                }
            });
        }
        return originalXHRSend.apply(this, args);
    };
})();
