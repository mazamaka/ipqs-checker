// Popup script для Chrome
document.addEventListener('DOMContentLoaded', function() {
    const checkBtn = document.getElementById('checkBtn');
    const statusEl = document.getElementById('status');
    const spinner = document.querySelector('.spinner');

    function setStatus(text, isError = false) {
        statusEl.textContent = text;
        statusEl.style.color = isError ? '#ef4444' : '#6b7280';
    }

    function setLoading(loading) {
        checkBtn.disabled = loading;
        spinner.style.display = loading ? 'block' : 'none';
        checkBtn.querySelector('span').textContent = loading ? 'Проверка...' : 'Проверить Fingerprint';
    }

    checkBtn.addEventListener('click', async function() {
        setLoading(true);
        setStatus('Очистка данных...');

        try {
            // Отправляем сообщение в background для старта проверки
            chrome.runtime.sendMessage({ type: 'START_CHECK' }, function(response) {
                if (response && response.sessionId) {
                    setStatus('Открываю indeed.com...');
                    // Popup закроется автоматически когда откроется новая вкладка
                    setTimeout(() => window.close(), 500);
                } else {
                    setStatus('Ошибка запуска', true);
                    setLoading(false);
                }
            });
        } catch (error) {
            console.error('Error:', error);
            setStatus('Ошибка: ' + error.message, true);
            setLoading(false);
        }
    });

    setStatus('Готов к проверке');
});
