(function GlenGrowthOfflineWriteEngineV2() {
    const QUEUE_KEY = 'glenGrowth:offlineQueue:v2';
    const RETRY_DELAY_MS = 12000;
    const VERIFY_DELAY_MS = 850;
    const MAX_VERIFY_ATTEMPTS = 5;
    const QUEUE_LOCK = `${QUEUE_KEY}:lock`;
    const UNDOABLE_TYPES = new Set(Object.values(actionValues)
        .filter((action) => action.persist).map((action) => action.actionType));

    let flushing = false;
    let retryTimer = null;

    const nativePostToApi = window.postToApi;

    if (typeof nativePostToApi !== 'function') {
        console.error('Offline queue could not start: postToApi is unavailable.');
        return;
    }

    window.postToApi = async function queueFirstPost(payload) {
        const item = await withQueueLock(() => enqueueMutation(payload));
        renderQueueState();

        window.dispatchEvent(new CustomEvent('glen-growth-write-queued', {
            detail: {
                mutationId: item.mutationId,
                action: item.type,
                queuedAt: item.createdAt,
                item
            }
        }));

        if (navigator.onLine) scheduleFlush(40);

        return {
            ok: true,
            queued: true,
            mutationId: item.mutationId,
            item
        };
    };

    installPaymentQueueOverride();

    window.glenGrowthOfflineQueue = {
        flush: flushQueue,
        retryNow: () => flushQueue(true),
        count: () => readQueue().length,
        list: () => readQueue().map((item) => ({ ...item })),
        undoAction
    };

    function withQueueLock(callback) {
        return navigator.locks ? navigator.locks.request(QUEUE_LOCK, callback) : Promise.resolve().then(callback);
    }

    async function undoAction(record) {
        const actionId = String(record?.id || '').trim();
        if (!actionId || !UNDOABLE_TYPES.has(record.actionType)) throw new Error('This action is protected from Undo.');
        // Without a cross-tab lock we cannot promise that another tab has not begun sending.
        if (!navigator.locks) throw new Error('Safe local Undo is unavailable in this browser.');
        const result = await withQueueLock(() => {
            const queue = readQueue();
            const match = queue.find((entry) => entry.type === 'addAction' && entry.mutationId === actionId);
            // A failed or timed-out POST may already have reached Sheets. Never cancel its retry.
            if (match && UNDOABLE_TYPES.has(match.payload.actionType) && Number(match.attemptCount) === 0 && !match.lastAttemptAt) {
                writeQueue(queue.filter((entry) => entry.mutationId !== match.mutationId));
                return { cancelled: true, item: match };
            }
            const item = enqueueMutation({ action: 'undoAction', actionId, actionType: record.actionType });
            return { queued: true, item };
        });
        renderQueueState();
        window.dispatchEvent(new CustomEvent('glen-growth-action-undone', { detail: result }));
        if (result.queued && navigator.onLine) scheduleFlush(40);
        return result;
    }

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

        const type = String(payload.action || '').trim();

        if (!['addAction', 'addDeal', 'markDealPaid', 'undoAction'].includes(type)) {
            throw new Error(`Unsupported queued action: ${type || 'unknown'}`);
        }

        const queue = readQueue();

        if (type === 'undoAction') {
            if (!payload.actionId || !UNDOABLE_TYPES.has(payload.actionType)) throw new Error('Invalid Undo action.');
            const existing = queue.find((item) => item.type === type && item.payload.actionId === payload.actionId);
            if (existing) return existing;
        }

        if (type === 'markDealPaid') {
            const requestedDealId = String(payload.dealId || '').trim();
            const existingPayment = queue.find((item) =>
                item.type === 'markDealPaid' &&
                String(item.payload?.dealId || '').trim() === requestedDealId
            );

            if (existingPayment) return existingPayment;
        }

        const mutationId = String(payload.clientMutationId || '').trim() || makeMutationId();
        const cleanPayload = {
            ...payload,
            clientMutationId: mutationId,
            clientCreatedAt: payload.clientCreatedAt || new Date().toISOString()
        };

        if (type === 'addAction' && UNDOABLE_TYPES.has(cleanPayload.actionType)) {
            cleanPayload.actionId = mutationId;
        }

        if (type === 'addDeal') {
            cleanPayload.dealId = String(payload.dealId || '').trim() || mutationId;
        }

        const existingId = queue.find((item) => item.mutationId === mutationId);
        if (existingId) return existingId;

        const item = {
            mutationId,
            type,
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
        writeQueue(readQueue().filter((item) => item.mutationId !== mutationId));
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

        const initial = readQueue();
        if (!initial.length) {
            renderQueueState();
            return;
        }

        flushing = true;
        renderQueueState();

        try {
            for (const original of initial) {
                if (!navigator.onLine) break;

                const item = await withQueueLock(() => {
                    const current = readQueue().find((entry) => entry.mutationId === original.mutationId);
                    if (!current) return null;
                    if (current.type === 'undoAction' && readQueue().some((entry) =>
                        entry.type === 'addAction' && entry.mutationId === current.payload.actionId)) return null;
                    if (!force && current.lastAttemptAt) {
                        const elapsed = Date.now() - new Date(current.lastAttemptAt).getTime();
                        if (Number.isFinite(elapsed) && elapsed < 1200) return null;
                    }
                    current.lastAttemptAt = new Date().toISOString();
                    current.attemptCount = Number(current.attemptCount || 0) + 1;
                    current.lastError = '';
                    updateMutation(current);
                    return current;
                });
                if (!item) continue;
                renderQueueState();
                window.dispatchEvent(new CustomEvent('glen-growth-write-started'));

                try {
                    await nativePostToApi(item.payload);

                    const applied = await confirmMutationApplied(item);
                    if (applied) {
                        // Keep the overlay queued until a fresh snapshot includes the confirmed write.
                        // Removing it earlier could briefly restore an undone action or lose logged XP.
                        await window.glenGrowthXpActivity.refresh(true);
                        await withQueueLock(() => removeMutation(item.mutationId));
                        window.dispatchEvent(new CustomEvent('glen-growth-write-confirmed', {
                            detail: {
                                mutationId: item.mutationId,
                                action: item.type
                            }
                        }));
                    } else {
                        item.lastError = 'Sent but not confirmed yet.';
                        await withQueueLock(() => updateMutation(item));
                    }
                } catch (error) {
                    item.lastError = String(error?.message || error || 'Sync failed');
                    await withQueueLock(() => updateMutation(item));
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
                    actionId: String(item.payload?.actionId || ''),
                    dealId: String(item.payload?.dealId || '')
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

    function installPaymentQueueOverride() {
        if (typeof window.markWinPaid !== 'function') return;

        window.markWinPaid = async function queuedMarkWinPaid(win, button) {
            const dealId = String(win?.dealId || '').trim();
            if (!dealId) {
                setWinsSyncStatus('DEAL ID MISSING');
                return;
            }

            const client = String(win?.client || 'this deal');
            const amount = formatCurrency(safeNumber(win?.bookedAmount));
            const confirmed = window.confirm(`Mark ${client} — ${amount} as paid?`);
            if (!confirmed) return;

            const originalText = button.textContent;
            button.disabled = true;
            button.textContent = navigator.onLine ? 'QUEUEING PAYMENT...' : 'PAYMENT QUEUED';

            try {
                const result = await window.postToApi({
                    action: 'markDealPaid',
                    dealId,
                    mode: getModeLabel(),
                    bookedAmount: safeNumber(win?.bookedAmount),
                    client: String(win?.client || ''),
                    category: String(win?.category || '')
                });

                button.textContent = 'PAYMENT QUEUED';
                setWinsSyncStatus(navigator.onLine ? 'PAYMENT QUEUED — SYNCING' : 'PAYMENT QUEUED OFFLINE');

                const note = document.createElement('div');
                note.className = 'win-payment-queued';
                note.textContent = 'PAYMENT CHANGE QUEUED';
                button.insertAdjacentElement('beforebegin', note);

                if (navigator.onLine) scheduleFlush(50);

                return result;
            } catch (error) {
                console.error('Could not queue payment:', error);
                setWinsSyncStatus('PAYMENT QUEUE FAILED');
                button.disabled = false;
                button.textContent = originalText;
                showToast('Payment could not be queued on this device.');
            }
        };
    }

    function setupQueueUi() {
        injectStyles();
        injectStatus();
        bindEvents();
        renderQueueState();

        if (navigator.onLine && readQueue().length) {
            scheduleFlush(200);
        }
    }

    function injectStyles() {
        if (document.getElementById('glen-growth-queue-v2-styles')) return;

        const style = document.createElement('style');
        style.id = 'glen-growth-queue-v2-styles';
        style.textContent = `
            .pwa-queue-status {
                color: #ccff00;
                font-weight: 900;
                white-space: nowrap;
            }

            .pwa-queue-status.pending { color: #ffba00; }

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

    function injectStatus() {
        const copy = document.querySelector('.pwa-status-copy');
        if (copy && !document.getElementById('pwa-queue-status')) {
            const status = document.createElement('span');
            status.id = 'pwa-queue-status';
            status.className = 'pwa-queue-status';
            copy.appendChild(status);
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
            if (install) install.insertAdjacentElement('beforebegin', button);
            else bar.appendChild(button);
        }
    }

    function bindEvents() {
        window.addEventListener('glen-growth-write-queued', () => {
            renderQueueState();
            showToast(navigator.onLine ? 'Change queued. Syncing now.' : 'Saved on this device. It will sync when you reconnect.');
        });

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

    function showToast(message) {
        if (typeof window.showGlenGrowthToast === 'function') {
            window.showGlenGrowthToast(message);
            return;
        }
        console.log(message);
    }

    function wait(ms) {
        return new Promise((resolve) => window.setTimeout(resolve, ms));
    }
})();
