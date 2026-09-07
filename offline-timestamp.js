(function preserveOfflineWriteTimestamp() {
    let attempts = 0;
    const maxAttempts = 120;

    const timer = window.setInterval(() => {
        attempts += 1;

        if (!window.glenGrowthOfflineQueue || typeof window.postToApi !== 'function') {
            if (attempts >= maxAttempts) {
                window.clearInterval(timer);
                console.warn('Offline timestamp layer did not attach.');
            }
            return;
        }

        window.clearInterval(timer);

        const queueFirstPost = window.postToApi;

        window.postToApi = function timestampedQueuedPost(payload) {
            const nextPayload = {
                ...(payload || {}),
                clientCreatedAt:
                    String(payload?.clientCreatedAt || '').trim() ||
                    new Date().toISOString()
            };

            return queueFirstPost(nextPayload);
        };
    }, 50);
})();
