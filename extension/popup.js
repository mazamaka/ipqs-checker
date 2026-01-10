const api = typeof browser !== 'undefined' ? browser : chrome;
const SERVER_URL = 'https://check-ipqs.farm-mafia.cash';

let logsVisible = false;
let logsInterval = null;

document.getElementById('checkBtn').addEventListener('click', async () => {
    const btn = document.getElementById('checkBtn');
    const status = document.getElementById('status');

    // Disable button and show loading
    btn.disabled = true;
    btn.textContent = 'Проверка...';
    status.className = 'status loading';
    status.textContent = 'Запускаю проверку...';
    status.style.display = 'block';

    // Clear old logs
    await api.storage.local.set({ debugLogs: [] });

    // Show logs automatically
    document.getElementById('debugLogs').classList.add('show');
    document.getElementById('debugToggle').textContent = 'Скрыть логи';
    logsVisible = true;
    startLogsPolling();

    // Send message to background to start check
    api.runtime.sendMessage({ type: 'START_CHECK' });

    // Start polling for result
    const sessionData = await api.storage.local.get('sessionId');
    const sessionId = sessionData.sessionId;

    if (sessionId) {
        pollForResult(sessionId, status, btn);
    }
});

function startLogsPolling() {
    if (logsInterval) clearInterval(logsInterval);
    logsInterval = setInterval(updateLogs, 500);
    updateLogs();
}

async function updateLogs() {
    const data = await api.storage.local.get('debugLogs');
    const logs = data.debugLogs || [];
    const logsDiv = document.getElementById('debugLogs');
    logsDiv.innerHTML = logs.map(log => `<div class="log-entry">${log}</div>`).join('');
    logsDiv.scrollTop = logsDiv.scrollHeight;
}

document.getElementById('debugToggle').addEventListener('click', () => {
    const logsDiv = document.getElementById('debugLogs');
    const btn = document.getElementById('debugToggle');
    logsVisible = !logsVisible;

    if (logsVisible) {
        logsDiv.classList.add('show');
        btn.textContent = 'Скрыть логи';
        startLogsPolling();
    } else {
        logsDiv.classList.remove('show');
        btn.textContent = 'Показать логи отладки';
        if (logsInterval) {
            clearInterval(logsInterval);
            logsInterval = null;
        }
    }
});

async function pollForResult(sessionId, status, btn) {
    let attempts = 0;
    const maxAttempts = 120; // 60 seconds

    const poll = async () => {
        attempts++;

        try {
            const resp = await fetch(`${SERVER_URL}/api/extension/result/${sessionId}`);
            const data = await resp.json();

            if (data.fingerprint && data.timestamp) {
                const resultTime = new Date(data.timestamp).getTime();
                const now = Date.now();

                if (now - resultTime < 60000) {
                    // Got fresh result!
                    status.className = 'status success';
                    status.textContent = `Готово! Fraud Score: ${data.fingerprint.fraud_chance}%`;
                    btn.textContent = 'Проверить мой фингерпринт';
                    btn.disabled = false;
                    showLastCheck();
                    return;
                }
            }

            if (attempts < maxAttempts) {
                setTimeout(poll, 500);
            } else {
                status.className = 'status error';
                status.textContent = 'Таймаут. Проверьте логи.';
                btn.textContent = 'Проверить мой фингерпринт';
                btn.disabled = false;
            }
        } catch (e) {
            if (attempts < maxAttempts) {
                setTimeout(poll, 500);
            }
        }
    };

    setTimeout(poll, 2000);
}

async function showLastCheck() {
    const data = await api.storage.local.get(['lastFingerprint', 'lastCheck']);

    if (data.lastFingerprint && data.lastCheck) {
        const lastCheck = document.getElementById('lastCheck');
        const fraudScore = document.getElementById('fraudScore');
        const checkTime = document.getElementById('checkTime');

        const score = data.lastFingerprint.fraud_chance || 0;
        fraudScore.textContent = score + '%';

        if (score < 30) {
            fraudScore.className = 'fraud-score fraud-low';
        } else if (score < 70) {
            fraudScore.className = 'fraud-score fraud-medium';
        } else {
            fraudScore.className = 'fraud-score fraud-high';
        }

        const date = new Date(data.lastCheck);
        checkTime.textContent = date.toLocaleString('ru-RU');

        lastCheck.style.display = 'block';
    }
}

showLastCheck();
