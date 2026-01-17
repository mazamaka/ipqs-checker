const api = typeof browser !== 'undefined' ? browser : chrome;
const SERVER_URL = 'https://check.maxbob.xyz';

let logsVisible = false;
let logsInterval = null;
let currentLogs = [];

document.getElementById('checkBtn').addEventListener('click', async () => {
    const btn = document.getElementById('checkBtn');
    const status = document.getElementById('status');

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
    document.getElementById('copyBtn').style.display = 'block';
    logsVisible = true;
    startLogsPolling();

    api.runtime.sendMessage({ type: 'START_CHECK' });

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
    currentLogs = data.debugLogs || [];
    const logsDiv = document.getElementById('debugLogs');
    logsDiv.innerHTML = currentLogs.map(log => `<div class="log-entry">${log}</div>`).join('');
    logsDiv.scrollTop = logsDiv.scrollHeight;
}

// Copy logs button
document.getElementById('copyBtn').addEventListener('click', async () => {
    const copyBtn = document.getElementById('copyBtn');
    const logsText = currentLogs.join('\n');

    try {
        await navigator.clipboard.writeText(logsText);
        copyBtn.textContent = 'Скопировано!';
        copyBtn.classList.add('copied');
        setTimeout(() => {
            copyBtn.textContent = 'Копировать';
            copyBtn.classList.remove('copied');
        }, 2000);
    } catch (e) {
        // Fallback for older browsers
        const textarea = document.createElement('textarea');
        textarea.value = logsText;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        copyBtn.textContent = 'Скопировано!';
        copyBtn.classList.add('copied');
        setTimeout(() => {
            copyBtn.textContent = 'Копировать';
            copyBtn.classList.remove('copied');
        }, 2000);
    }
});

document.getElementById('debugToggle').addEventListener('click', () => {
    const logsDiv = document.getElementById('debugLogs');
    const toggleBtn = document.getElementById('debugToggle');
    const copyBtn = document.getElementById('copyBtn');
    logsVisible = !logsVisible;

    if (logsVisible) {
        logsDiv.classList.add('show');
        toggleBtn.textContent = 'Скрыть логи';
        copyBtn.style.display = 'block';
        startLogsPolling();
    } else {
        logsDiv.classList.remove('show');
        toggleBtn.textContent = 'Показать логи';
        copyBtn.style.display = 'none';
        if (logsInterval) {
            clearInterval(logsInterval);
            logsInterval = null;
        }
    }
});

async function pollForResult(sessionId, status, btn) {
    let attempts = 0;
    const maxAttempts = 120;

    const poll = async () => {
        attempts++;

        try {
            const resp = await fetch(`${SERVER_URL}/api/extension/result/${sessionId}`);
            const data = await resp.json();

            if (data.fingerprint && data.timestamp) {
                const resultTime = new Date(data.timestamp).getTime();
                const now = Date.now();

                if (now - resultTime < 60000) {
                    status.className = 'status success';
                    status.textContent = `Готово! Fraud Score: ${data.fingerprint.fraud_chance}%`;
                    btn.textContent = 'Проверить мой фингерпринт';
                    btn.disabled = false;
                    showLastCheck();

                    // Close popup after 1.5 seconds
                    setTimeout(() => {
                        window.close();
                    }, 1500);
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
