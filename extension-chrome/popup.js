// Popup script для Chrome - поддержка IPQS и Fingerprint Pro
const SERVER_URL = 'https://check-ipqs.farm-mafia.cash';
const MAX_HISTORY_ITEMS = 10;

let logsVisible = false;
let logsInterval = null;
let currentLogs = [];
let checkInProgress = false;
let selectedService = 'ipqs';  // 'ipqs' или 'fingerprint'
let currentSessionId = null;

document.addEventListener('DOMContentLoaded', function() {
    const checkBtn = document.getElementById('checkBtn');
    const statusEl = document.getElementById('status');
    const debugToggle = document.getElementById('debugToggle');
    const copyBtn = document.getElementById('copyBtn');
    const debugLogs = document.getElementById('debugLogs');
    const serviceBtns = document.querySelectorAll('.service-btn');
    const historySection = document.getElementById('historySection');
    const historyList = document.getElementById('historyList');
    const clearHistoryBtn = document.getElementById('clearHistory');

    // Service selector
    serviceBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            if (checkInProgress) return;

            serviceBtns.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            selectedService = this.dataset.service;
        });
    });

    // History functions
    async function loadHistory() {
        const data = await chrome.storage.local.get('checkHistory');
        const history = data.checkHistory || [];
        renderHistory(history);
    }

    function renderHistory(history) {
        if (history.length === 0) {
            historyList.innerHTML = '<div class="history-empty">Нет проверок</div>';
            return;
        }

        historyList.innerHTML = history.map(item => {
            const score = item.score || 0;
            const scoreClass = score >= 70 ? 'high' : score >= 30 ? 'medium' : 'low';
            const serviceLabel = item.service === 'fingerprint' ? 'FP Pro' : 'IPQS';
            const scoreLabel = item.service === 'fingerprint' ? score : score + '%';
            const resultUrl = item.service === 'fingerprint'
                ? `${SERVER_URL}/result-fp?session=${item.sessionId}`
                : `${SERVER_URL}/result?session=${item.sessionId}`;

            return `<a href="${resultUrl}" target="_blank" class="history-item">
                <div class="history-item-left">
                    <span class="history-item-service">${serviceLabel}</span>
                    <span class="history-item-time">${item.time}</span>
                </div>
                <span class="history-item-score ${scoreClass}">${scoreLabel}</span>
            </a>`;
        }).join('');
    }

    async function addToHistory(sessionId, fingerprint, service) {
        const data = await chrome.storage.local.get('checkHistory');
        const history = data.checkHistory || [];

        let score;
        if (service === 'fingerprint') {
            score = fingerprint.products?.suspectScore?.data?.result || 0;
        } else {
            score = fingerprint.fraud_chance || 0;
        }

        const newItem = {
            sessionId: sessionId,
            service: service,
            score: score,
            time: new Date().toLocaleString('ru-RU')
        };

        // Add to beginning, limit to MAX_HISTORY_ITEMS
        history.unshift(newItem);
        if (history.length > MAX_HISTORY_ITEMS) {
            history.pop();
        }

        await chrome.storage.local.set({ checkHistory: history });
        renderHistory(history);
    }

    // Clear history button
    clearHistoryBtn.addEventListener('click', async function() {
        await chrome.storage.local.set({ checkHistory: [] });
        renderHistory([]);
    });

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
        checkBtn.textContent = loading ? 'Проверка...' : 'Проверить фингерпринт';
        checkInProgress = loading;
        document.getElementById('hint').style.display = loading ? 'block' : 'none';

        // Disable service selector during check
        serviceBtns.forEach(btn => {
            btn.style.pointerEvents = loading ? 'none' : 'auto';
            btn.style.opacity = loading ? '0.5' : '1';
        });
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
            chrome.runtime.sendMessage({
                type: 'START_CHECK',
                service: selectedService
            }, function(response) {
                if (chrome.runtime.lastError) {
                    setStatus('Ошибка: ' + chrome.runtime.lastError.message, 'error');
                    setLoading(false);
                    return;
                }

                if (response && response.sessionId) {
                    currentSessionId = response.sessionId;
                    const siteName = selectedService === 'fingerprint' ? 'fingerprint.com' : 'indeed.com';
                    setStatus(`Открыта вкладка ${siteName}...`, 'loading');
                    pollForCompletion(response.sessionId, selectedService);
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
    async function pollForCompletion(sessionId, service) {
        let attempts = 0;
        const maxAttempts = 120; // 60 seconds

        const poll = async () => {
            attempts++;

            try {
                const data = await chrome.storage.local.get(['checkComplete', 'checkError', 'lastFingerprint', 'lastService']);

                if (data.checkComplete) {
                    if (data.checkError) {
                        setStatus('Ошибка: ' + data.checkError, 'error');
                    } else if (data.lastFingerprint) {
                        showResult(data.lastFingerprint, data.lastService || service);
                        // Add to history
                        if (sessionId) {
                            await addToHistory(sessionId, data.lastFingerprint, data.lastService || service);
                        }
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
                    if (lastLog.includes('fingerprint') || lastLog.includes('Fingerprint')) {
                        setStatus('Получен fingerprint, отправка...', 'loading');
                    } else if (lastLog.includes('сервер')) {
                        setStatus('Отправка на сервер...', 'loading');
                    } else if (lastLog.includes('Открыта вкладка')) {
                        const siteName = service === 'fingerprint' ? 'fingerprint.com' : 'indeed.com';
                        setStatus(`Ожидание загрузки ${siteName}...`, 'loading');
                    }
                }

                if (attempts < maxAttempts) {
                    setTimeout(poll, 500);
                } else {
                    const siteName = service === 'fingerprint' ? 'fingerprint.com' : 'indeed.com';
                    setStatus(`Таймаут. Проверьте вкладку ${siteName}`, 'error');
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

    function showResult(fingerprint, service) {
        if (service === 'fingerprint') {
            // Fingerprint Pro result
            const identification = fingerprint.products?.identification?.data;
            const suspectScore = fingerprint.products?.suspectScore?.data?.result;
            const tampering = fingerprint.products?.tampering?.data;

            const score = suspectScore || 0;
            const antiDetect = tampering?.antiDetectBrowser;

            let statusText = `Suspect Score: ${score}`;
            if (antiDetect) {
                statusText += ' | Anti-detect: YES!';
                setStatus(statusText, 'error');
            } else {
                setStatus(statusText, 'success');
            }
            showLastCheck(fingerprint, service);
        } else {
            // IPQS result
            const score = fingerprint.fraud_chance || 0;
            setStatus(`Готово! Fraud Score: ${score}%`, 'success');
            showLastCheck(fingerprint, service);
        }
    }

    function showLastCheck(fingerprint, service) {
        const lastCheck = document.getElementById('lastCheck');
        const fraudScore = document.getElementById('fraudScore');
        const checkTime = document.getElementById('checkTime');
        const lastServiceEl = document.getElementById('lastService');
        const scoreLabelEl = document.getElementById('scoreLabel');

        if (fingerprint) {
            let score, scoreLabel;

            if (service === 'fingerprint') {
                score = fingerprint.products?.suspectScore?.data?.result || 0;
                scoreLabel = 'Suspect Score:';
                lastServiceEl.textContent = 'Fingerprint Pro';
            } else {
                score = fingerprint.fraud_chance || 0;
                scoreLabel = 'Fraud Score:';
                lastServiceEl.textContent = 'IPQS';
            }

            scoreLabelEl.textContent = scoreLabel;
            fraudScore.textContent = service === 'fingerprint' ? score : score + '%';

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
        const data = await chrome.storage.local.get(['lastFingerprint', 'lastCheck', 'lastService', 'checkComplete', 'currentService']);

        // Set selected service from storage
        if (data.currentService) {
            selectedService = data.currentService;
            serviceBtns.forEach(btn => {
                btn.classList.toggle('active', btn.dataset.service === selectedService);
            });
        }

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
                pollForCompletion(sessionData.sessionId, data.currentService || 'ipqs');
            }
        }

        if (data.lastFingerprint && data.lastCheck) {
            showLastCheck(data.lastFingerprint, data.lastService || 'ipqs');
        }

        // Load history
        loadHistory();
    }

    loadLastCheck();
});
