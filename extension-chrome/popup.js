// Popup script для Chrome
document.addEventListener('DOMContentLoaded', function() {
    const checkBtn = document.getElementById('checkBtn');
    const statusEl = document.getElementById('status');

    function setStatus(text, type = 'loading') {
        statusEl.textContent = text;
        statusEl.className = 'status ' + type;
    }

    function setLoading(loading) {
        checkBtn.disabled = loading;
        checkBtn.textContent = loading ? 'Проверка...' : 'Проверить мой фингерпринт';
    }

    checkBtn.addEventListener('click', async function() {
        setLoading(true);
        setStatus('Очистка данных...', 'loading');

        try {
            // Отправляем сообщение в background для старта проверки
            chrome.runtime.sendMessage({ type: 'START_CHECK' }, function(response) {
                if (chrome.runtime.lastError) {
                    setStatus('Ошибка: ' + chrome.runtime.lastError.message, 'error');
                    setLoading(false);
                    return;
                }

                if (response && response.sessionId) {
                    setStatus('Открываю indeed.com...', 'success');
                    // Popup закроется автоматически когда откроется новая вкладка
                    setTimeout(() => window.close(), 500);
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
});
