(function GlenGrowthOfflineWriteEngine() {
    const QUEUE_KEY = 'glenGrowth:offlineQueue:v1';
    const RETRY_DELAY_MS = 12000;
    const VERIFY_DELAY_MS = 850;
    const MAX_VERIFY_ATTEMPTS = 5;

    let flushing = false;
    let retryTimer = null;

    const nativePostToApi = window.postToApi;

    if (typeof nativePostToApi !== 'function') {
        console.error('Offline queue could not start: postToApi is unavailable.');
        return;
    }

    window.postToApi = async function queueFirstPost(payload) {
        const item = enqueueMutation(payload);
        renderQueueState();

        window.dispatchEvent(new CustomEvent('glen-growth-write-queued', {
            detail: {
                mutationId: item.mutationId,
                action: item.payload.action,
                queuedAt: item.createdAt
            }
        }));

        if (navigator.onLine) {
            scheduleFlush(40);
        }

        return {
            ok: true,
            queued: true,
            mutationId: item.mutationId
        };
    };

    window.glenGrowthOfflineQueue = {
        flush: flushQueue,
        count: () => readQueue().length,
        list: () => readQueue().map((item) => ({ ...item })),
        retryNow: () => flushQueue(true)
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupQueueUi, { once: true });
    } else {
        setupQueueUi();
    }

    window.addEventListener('online', () => {
        renderQueueState();
        scheduleFlush(150);
    });

    window.addEventListener('offline', renderQueueState);
    window.addEventListener('glen-growth-network-sync', renderQueueState);

    function makeMutationId() {
        if (window.crypto && typeof window.crypto.randomUUID === 'function') {
            return window.crypto.randomUUID();
        }

        return `gg-${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
    }

    function enqueueMutation(payload) {
        if (!payload || typeof payload !== 'object') {
            throw new Error('Cannot queue an empty write.');
        }

        const action = String(payload.action || '').trim();

        if (!['addAction', 'addDeal', 'markDealPaid'].includes(action)) {
            throw new Error(`Unsupported queued action: ${action || 'unknown'}`);
        }

        const mutationId = String(payload.clientMutationId || '').trim() || makeMutationId();
        const cleanPayload = {
            ...payload,
            clientMutationId: mutationId
        };

        if (action === 'addDeal') {
            cleanPayload.dealId = String(payload.dealId || '').trim() || mutationId;
        }

        const queue = readQueue();
        const existing = queue.find((item) => item.mutationId === mutationId);
        if (existing) return existing;

        const item = {
            mutationId,
            type: action,
            createdAt: new Date().toISOString(),
            lastAttemptAt: '',
            attemptCount: 0,
            lastError: '',
            payload: cleanPayload
        };

        queue.push(item);
        writeQueue(queue);
        return item;
    }

    function readQueue() {
        try {
            const raw = localStorage.getItem(QUEUE_KEY);
            if (!raw) return [];

            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return [];

            return parsed.filter((item) =>
                item &&
                typeof item === 'object' &&
                item.mutationId &&
                item.payload &&
                item.payload.action
            );
        } catch (error) {
            console.error('Could not read offline write queue:', error);
            return [];
        }
    }

    function writeQueue(queue) {
        try {
            localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
        } catch (error) {
            console.error('Could not save offline write queue:', error);
            throw new Error('This device could not save the offline queue.');
        }
    }

    function removeMutation(mutationId) {
        const next = readQueue().filter((item) => item.mutationId !== mutationId);
        writeQueue(next);
    }

    function updateMutation(item) {
        const queue = readQueue();
        const index = queue.findIndex((entry) => entry.mutationId === item.mutationId);
        if (index === -1) return;
        queue[index] = item;
        writeQueue(queue);
    }

    function scheduleFlush(delayMs = 0) {
        window.clearTimeout(retryTimer);
        retryTimer = window.setTimeout(() => {
            flushQueue().catch((error) => {
                console.error('Offline queue flush failed:', error);
            });
        }, delayMs);
    }

    async function flushQueue(force = false) {
        if (flushing || !navigator.onLine) {
            renderQueueState();
            return;
        }

        const initialQueue = readQueue();
        if (!initialQueue.length) {
            renderQueueState();
            return;
        }

        flushing = true;
        renderQueueState();

        try {
            for (const original of initialQueue) {
                if (!navigator.onLine) break;

                const current = readQueue().find((item) => item.mutationId === original.mutationId);
                if (!current) continue;

                if (!force && current.lastAttemptAt) {
                    const elapsed = Date.now() - new Date(current.lastAttemptAt).getTime();
                    if (Number.isFinite(elapsed) && elapsed < 1200) continue;
                }

                current.lastAttemptAt = new Date().toISOString();
                current.attemptCount = Number(current.attemptCount || 0) + 1;
                current.lastError = '';
                updateMutation(current);
                renderQueueState();

                try {
                    await nativePostToApi(current.payload);

                    const applied = await confirmMutationApplied(current);

                    if (applied) {
                        removeMutation(current.mutationId);

                        window.dispatchEvent(new CustomEvent('glen-growth-write-confirmed', {
                            detail: {
                                mutationId: current.mutationId,
                                action: current.type
                            }
                        }));
                    } else {
                        current.lastError = 'Sent but not confirmed yet.';
                        updateMutation(current);
                    }
                } catch (error) {
                    current.lastError = String(error?.message || error || 'Sync failed');
                    updateMutation(current);
                    break;
                }
            }
        } finally {
            flushing = false;
            renderQueueState();
        }

        const remaining = readQueue();

        if (remaining.length && navigator.onLine) {
            scheduleFlush(RETRY_DELAY_MS);
        } else if (!remaining.length) {
            window.dispatchEvent(new CustomEvent('glen-growth-queue-empty'));
            refreshAfterQueueSync();
        }
    }

    async function confirmMutationApplied(item) {
        for (let attempt = 0; attempt < MAX_VERIFY_ATTEMPTS; attempt += 1) {
            if (!navigator.onLine) return false;

            await wait(VERIFY_DELAY_MS + attempt * 250);

            try {
                const response = await window.jsonpRequest({
                    action: 'getMutationStatus',
                    mutationId: item.mutationId,
                    mutationType: item.type,
                    dealId: String(item.payload.dealId || item.payload.dealId === 0 ? item.payload.dealId : item.payload.dealId || '')
                }, 9000);

                if (response && response.ok === true && response.applied === true) {
                    return true;
                }
            } catch (error) {
                if (!navigator.onLine) return false;
                console.warn('Could not verify queued write yet:', error);
            }
        }

        return false;
    }

    function setupQueueUi() {
        injectQueueStyles();
        injectQueueStatus();
        bindQueueEvents();
        renderQueueState();

        if (navigator.onLine && readQueue().length) {
            scheduleFlush(200);
        }
    }

    function injectQueueStyles() {
        if (document.getElementById('glen-growth-queue-styles')) return;

        const style = document.createElement('style');
        style.id = 'glen-growth-queue-styles';
        style.textContent = `
            .pwa-queue-status {
                color: #ccff00;
                font-weight: 900;
                white-space: nowrap;
            }

            .pwa-queue-status.pending {
                color: #ffba00;
            }

            .pwa-sync-btn {
                min-height: 34px;
                padding: 0 10px;
                border: 1px solid rgba(255, 186, 0, 0.35);
                border-radius: 9px;
                background: rgba(255, 186, 0, 0.07);
                color: #ffba00;
                font: inherit;
                font-size: 0.65rem;
                font-weight: 900;
                letter-spacing: 0.45px;
                cursor: pointer;
            }

            .pwa-sync-btn[hidden] { display: none; }
            .pwa-sync-btn:disabled { opacity: 0.55; cursor: wait; }

            .win-payment-queued {
                margin-top: 10px;
                color: #ffba00;
                font-size: 0.7rem;
                font-weight: 900;
                letter-spacing: 0.35px;
            }
        `;
        document.head.appendChild(style);
    }

    function injectQueueStatus() {
        const copy = document.querySelector('.pwa-status-copy');
        if (copy && !document.getElementById('pwa-queue-status')) {
            const queueStatus = document.createElement('span');
            queueStatus.id = 'pwa-queue-status';
            queueStatus.className = 'pwa-queue-status';
            copy.appendChild(queueStatus);
        }

        const bar = document.getElementById('pwa-status-bar');
        if (bar && !document.getElementById('pwa-sync-btn')) {
            const button = document.createElement('button');
            button.id = 'pwa-sync-btn';
            button.className = 'pwa-sync-btn';
            button.type = 'button';
            button.textContent = 'SYNC NOW';
            button.hidden = true;
            button.addEventListener('click', () => flushQueue(true));

            const install = document.getElementById('pwa-install-btn');
            if (install) {
                install.insertAdjacentElement('beforebegin', button);
            } else {
                bar.appendChild(button);
            }
        }
    }

    function bindQueueEvents() {
        window.addEventListener('glen-growth-write-queued', renderQueueState);
        window.addEventListener('glen-growth-write-confirmed', () => {
            renderQueueState();
            refreshAfterQueueSync();
        });
        window.addEventListener('glen-growth-queue-empty', renderQueueState);
    }

    function renderQueueState() {
        const queue = readQueue();
        const status = document.getElementById('pwa-queue-status');
        const button = document.getElementById('pwa-sync-btn');

        if (status) {
            if (!queue.length) {
                status.textContent = '· ALL SYNCED';
                status.classList.remove('pending');
            } else {
                status.textContent = `· ${queue.length} ${queue.length === 1 ? 'WRITE' : 'WRITES'} QUEUED`;
                status.classList.add('pending');
            }
        }

        if (button) {
            button.hidden = !queue.length || !navigator.onLine;
            button.disabled = flushing;
            button.textContent = flushing ? 'SYNCING...' : 'SYNC NOW';
        }
    }

    function refreshAfterQueueSync() {
        window.clearTimeout(refreshAfterQueueSync.timer);
        refreshAfterQueueSync.timer = window.setTimeout(() => {
            const tasks = [];

            if (typeof window.loadTodayState === 'function') tasks.push(window.loadTodayState());
            if (typeof window.loadWeekState === 'function') tasks.push(window.loadWeekState());
            if (typeof window.loadMoneyState === 'function') tasks.push(window.loadMoneyState());
            if (typeof window.loadWinsState === 'function') tasks.push(window.loadWinsState());
            if (typeof window.loadStreakState === 'function') tasks.push(window.loadStreakState());

            Promise.allSettled(tasks).catch(() => {});
        }, 500);
    }

    function wait(ms) {
        return new Promise((resolve) => window.setTimeout(resolve, ms));
    }
})();
