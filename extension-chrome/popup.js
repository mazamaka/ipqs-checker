// Popup script для Chrome
const SERVER_URL = 'https://check-ipqs.farm-mafia.cash';

let logsVisible = false;
let logsInterval = null;
let currentLogs = [];
let checkInProgress = false;

document.addEventListener('DOMContentLoaded', function() {
    const checkBtn = document.getElementById('checkBtn');
    const statusEl = document.getElementById('status');
    const debugToggle = document.getElementById('debugToggle');
    const copyBtn = document.getElementById('copyBtn');
    const debugLogs = document.getElementById('debugLogs');

    function setStatus(text, type = 'loading') {
        if (type === 'loading') {
            statusEl.innerHTML = `<div class="spinner"></div><span class="loading-text">${text}</span>`;
        } else {
            statusEl.textContent = text;
        }
        statusEl.className = 'status ' + type;
    }

    function setLoading(loading) {
        checkBtn.disabled = loading;
        checkBtn.textContent = loading ? 'Проверка...' : 'Проверить мой фингерпринт';
        checkInProgress = loading;
    }

    async function updateLogs() {
        const data = await chrome.storage.local.get('debugLogs');
        currentLogs = data.debugLogs || [];
        debugLogs.innerHTML = currentLogs.map(log => `<div class="log-entry">${log}</div>`).join('');
        debugLogs.scrollTop = debugLogs.scrollHeight;
    }

    function startLogsPolling() {
        if (logsInterval) clearInterval(logsInterval);
        logsInterval = setInterval(updateLogs, 500);
        updateLogs();
    }

    function stopLogsPolling() {
        if (logsInterval) {
            clearInterval(logsInterval);
            logsInterval = null;
        }
    }

    // Debug toggle
    debugToggle.addEventListener('click', function() {
        logsVisible = !logsVisible;

        if (logsVisible) {
            debugLogs.classList.add('show');
            debugToggle.textContent = 'Скрыть логи';
            copyBtn.style.display = 'block';
            startLogsPolling();
        } else {
            debugLogs.classList.remove('show');
            debugToggle.textContent = 'Показать логи';
            copyBtn.style.display = 'none';
            stopLogsPolling();
        }
    });

    // Copy logs
    copyBtn.addEventListener('click', async function() {
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
            console.error('Copy failed:', e);
        }
    });

    // Main check button
    checkBtn.addEventListener('click', async function() {
        setLoading(true);
        setStatus('Очистка данных...', 'loading');

        // Clear old logs
        await chrome.storage.local.set({ debugLogs: [], checkComplete: false, checkError: null });

        // Show logs automatically
        debugLogs.classList.add('show');
        debugToggle.textContent = 'Скрыть логи';
        copyBtn.style.display = 'block';
        logsVisible = true;
        startLogsPolling();

        try {
            chrome.runtime.sendMessage({ type: 'START_CHECK' }, function(response) {
                if (chrome.runtime.lastError) {
                    setStatus('Ошибка: ' + chrome.runtime.lastError.message, 'error');
                    setLoading(false);
                    return;
                }

                if (response && response.sessionId) {
                    setStatus('Открыта вкладка indeed.com...', 'loading');
                    // Start polling for completion
                    pollForCompletion(response.sessionId);
                } else {
                    setStatus('Ошибка запуска', 'error');
                    setLoading(false);
                }
            });
        } catch (error) {
            console.error('Error:', error);
            setStatus('Ошибка: ' + error.message, 'error');
            setLoading(false);
        }
    });

    // Poll for check completion via storage
    async function pollForCompletion(sessionId) {
        let attempts = 0;
        const maxAttempts = 120; // 60 seconds

        const poll = async () => {
            attempts++;

            try {
                // Check storage for completion flag
                const data = await chrome.storage.local.get(['checkComplete', 'checkError', 'lastFingerprint']);

                if (data.checkComplete) {
                    if (data.checkError) {
                        setStatus('Ошибка: ' + data.checkError, 'error');
                    } else if (data.lastFingerprint) {
                        const score = data.lastFingerprint.fraud_chance || 0;
                        setStatus(`Готово! Fraud Score: ${score}%`, 'success');
                        showLastCheck(data.lastFingerprint);
                    } else {
                        setStatus('Готово!', 'success');
                    }
                    setLoading(false);
                    stopLogsPolling();

                    // Close popup after showing result
                    setTimeout(() => {
                        window.close();
                    }, 2000);
                    return;
                }

                // Update status based on logs
                if (currentLogs.length > 0) {
                    const lastLog = currentLogs[currentLogs.length - 1];
                    if (lastLog.includes('fingerprint')) {
                        setStatus('Получен fingerprint, отправка...', 'loading');
                    } else if (lastLog.includes('сервер')) {
                        setStatus('Отправка на сервер...', 'loading');
                    } else if (lastLog.includes('Открыта вкладка')) {
                        setStatus('Ожидание загрузки indeed.com...', 'loading');
                    }
                }

                if (attempts < maxAttempts) {
                    setTimeout(poll, 500);
                } else {
                    setStatus('Таймаут. Проверьте вкладку indeed.com', 'error');
                    setLoading(false);
                }
            } catch (e) {
                console.error('Poll error:', e);
                if (attempts < maxAttempts) {
                    setTimeout(poll, 500);
                }
            }
        };

        setTimeout(poll, 1000);
    }

    function showLastCheck(fingerprint) {
        const lastCheck = document.getElementById('lastCheck');
        const fraudScore = document.getElementById('fraudScore');
        const checkTime = document.getElementById('checkTime');

        if (fingerprint) {
            const score = fingerprint.fraud_chance || 0;
            fraudScore.textContent = score + '%';

            if (score < 30) {
                fraudScore.className = 'fraud-score fraud-low';
            } else if (score < 70) {
                fraudScore.className = 'fraud-score fraud-medium';
            } else {
                fraudScore.className = 'fraud-score fraud-high';
            }

            checkTime.textContent = new Date().toLocaleString('ru-RU');
            lastCheck.style.display = 'block';
        }
    }

    // Load last check on popup open
    async function loadLastCheck() {
        const data = await chrome.storage.local.get(['lastFingerprint', 'lastCheck', 'checkComplete']);

        // If check is in progress, resume monitoring
        if (data.checkComplete === false) {
            const sessionData = await chrome.storage.local.get('sessionId');
            if (sessionData.sessionId) {
                setLoading(true);
                setStatus('Проверка в процессе...', 'loading');
                debugLogs.classList.add('show');
                debugToggle.textContent = 'Скрыть логи';
                copyBtn.style.display = 'block';
                logsVisible = true;
                startLogsPolling();
                pollForCompletion(sessionData.sessionId);
            }
        }

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

            checkTime.textContent = new Date(data.lastCheck).toLocaleString('ru-RU');
            lastCheck.style.display = 'block';
        }
    }

    loadLastCheck();
});
