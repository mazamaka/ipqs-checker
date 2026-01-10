const api = typeof browser !== 'undefined' ? browser : chrome;

document.getElementById('checkBtn').addEventListener('click', async () => {
    const status = document.getElementById('status');
    status.className = 'status loading';
    status.textContent = 'Открываю indeed.com...';
    status.style.display = 'block';

    // Send message to background to start check
    api.runtime.sendMessage({ type: 'START_CHECK' });

    // Close popup after a short delay
    setTimeout(() => {
        window.close();
    }, 1500);
});

// Show last check result if available
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
