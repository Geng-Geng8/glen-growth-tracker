(function GlenGrowthProductHardening() {
    const BUILD_VERSION = '2026.09.07-final1';
    const SW_URL = './sw-v3.js?v=20260907-1';
    const UPDATE_CHECK_KEY = 'glenGrowth:lastUpdateCheck';
    const UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1000;

    let registration = null;
    let updateWorker = null;
    let reloadingForUpdate = false;
    let renderTimer = null;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }

    function init() {
        ensureMeta('mobile-web-app-capable', 'yes');
        ensureMeta('apple-mobile-web-app-capable', 'yes');
        ensureMeta('apple-mobile-web-app-status-bar-style', 'black-translucent');

        injectStyles();
        installDetailsUi();
        installRapidTapGuard();
        bindRuntimeEvents();
        registerFinalServiceWorker();
        renderSystemState();

        window.setTimeout(renderSystemState, 400);
        window.setTimeout(renderSystemState, 1400);
    }

    function ensureMeta(name, content) {
        let meta = document.querySelector(`meta[name="${name}"]`);
        if (!meta) {
            meta = document.createElement('meta');
            meta.name = name;
            document.head.appendChild(meta);
        }
        meta.content = content;
    }

    function injectStyles() {
        if (document.getElementById('glen-growth-hardening-styles')) return;

        const style = document.createElement('style');
        style.id = 'glen-growth-hardening-styles';
        style.textContent = `
            .pwa-details-btn,
            .pwa-update-btn {
                min-height: 34px;
                padding: 0 10px;
                border-radius: 9px;
                font: inherit;
                font-size: 0.65rem;
                font-weight: 900;
                letter-spacing: 0.45px;
                cursor: pointer;
            }

            .pwa-details-btn {
                border: 1px solid #333;
                background: #121212;
                color: #bbb;
            }

            .pwa-update-btn {
                border: 1px solid rgba(204,255,0,0.42);
                background: rgba(204,255,0,0.09);
                color: #ccff00;
            }

            .pwa-update-btn[hidden] { display: none; }

            .system-sheet-backdrop {
                position: fixed;
                inset: 0;
                z-index: 2600;
                display: none;
                align-items: flex-end;
                justify-content: center;
                padding: 14px;
                background: rgba(0,0,0,0.72);
                backdrop-filter: blur(5px);
            }

            .system-sheet-backdrop.open { display: flex; }

            .system-sheet {
                width: min(520px, 100%);
                max-height: min(82vh, 720px);
                overflow: auto;
                padding: 20px;
                border: 1px solid #303030;
                border-radius: 18px;
                background: #101010;
                box-shadow: 0 24px 70px rgba(0,0,0,0.7);
            }

            .system-sheet-head {
                display: flex;
                align-items: flex-start;
                justify-content: space-between;
                gap: 14px;
                margin-bottom: 18px;
            }

            .system-sheet-kicker {
                color: #999;
                font-size: 0.67rem;
                font-weight: 900;
                letter-spacing: 1.2px;
            }

            .system-sheet-title {
                margin-top: 4px;
                color: #fff;
                font-size: 1.05rem;
                font-weight: 900;
            }

            .system-sheet-close {
                width: 40px;
                height: 40px;
                flex: 0 0 auto;
                border: 1px solid #333;
                border-radius: 10px;
                background: #080808;
                color: #ddd;
                font: inherit;
                font-size: 1rem;
                cursor: pointer;
            }

            .system-health-grid {
                display: grid;
                grid-template-columns: repeat(2, minmax(0,1fr));
                gap: 9px;
                margin-bottom: 16px;
            }

            .system-health-card {
                min-width: 0;
                padding: 12px;
                border: 1px solid #292929;
                border-radius: 11px;
                background: #080808;
            }

            .system-health-label {
                display: block;
                margin-bottom: 5px;
                color: #888;
                font-size: 0.62rem;
                font-weight: 900;
                letter-spacing: 0.55px;
                text-transform: uppercase;
            }

            .system-health-value {
                display: block;
                color: #eee;
                font-size: 0.78rem;
                font-weight: 900;
                line-height: 1.3;
                overflow-wrap: anywhere;
            }

            .system-health-value.good { color: #39ff14; }
            .system-health-value.warn { color: #ffba00; }

            .system-queue-title {
                margin: 4px 0 9px;
                color: #999;
                font-size: 0.65rem;
                font-weight: 900;
                letter-spacing: 0.9px;
            }

            .system-queue-empty,
            .system-install-note {
                color: #888;
                font-size: 0.72rem;
                line-height: 1.45;
            }

            .system-queue-item {
                margin-bottom: 8px;
                padding: 10px 11px;
                border: 1px solid rgba(255,186,0,0.22);
                border-radius: 10px;
                background: rgba(255,186,0,0.04);
            }

            .system-queue-main {
                display: flex;
                justify-content: space-between;
                gap: 10px;
                color: #eee;
                font-size: 0.72rem;
                font-weight: 900;
            }

            .system-queue-meta,
            .system-queue-error {
                margin-top: 5px;
                color: #888;
                font-size: 0.66rem;
                line-height: 1.35;
            }

            .system-queue-error { color: #ffba00; }

            .system-sheet-actions {
                display: grid;
                grid-template-columns: repeat(2, minmax(0,1fr));
                gap: 9px;
                margin-top: 16px;
            }

            .system-action-btn {
                min-height: 44px;
                border: 1px solid #343434;
                border-radius: 10px;
                background: #080808;
                color: #ddd;
                font: inherit;
                font-size: 0.7rem;
                font-weight: 900;
                letter-spacing: 0.4px;
                cursor: pointer;
            }

            .system-action-btn.primary {
                border-color: rgba(204,255,0,0.4);
                background: rgba(204,255,0,0.07);
                color: #ccff00;
            }

            .system-action-btn:disabled {
                opacity: 0.5;
                cursor: wait;
            }

            .action-btn.rapid-tap-lock {
                pointer-events: none;
            }

            @media (max-width: 360px) {
                .system-health-grid,
                .system-sheet-actions { grid-template-columns: 1fr; }
            }
        `;
        document.head.appendChild(style);
    }

    function installDetailsUi() {
        const tryInstall = () => {
            const statusBar = document.getElementById('pwa-status-bar');
            if (!statusBar) return false;

            if (!document.getElementById('pwa-update-btn')) {
                const update = document.createElement('button');
                update.id = 'pwa-update-btn';
                update.className = 'pwa-update-btn';
                update.type = 'button';
                update.textContent = 'UPDATE READY';
                update.hidden = true;
                update.addEventListener('click', applyUpdate);

                const install = document.getElementById('pwa-install-btn');
                if (install) install.insertAdjacentElement('beforebegin', update);
                else statusBar.appendChild(update);
            }

            if (!document.getElementById('pwa-details-btn')) {
                const details = document.createElement('button');
                details.id = 'pwa-details-btn';
                details.className = 'pwa-details-btn';
                details.type = 'button';
                details.textContent = 'STATUS';
                details.addEventListener('click', openSystemSheet);
                statusBar.appendChild(details);
            }

            createSystemSheet();
            return true;
        };

        if (!tryInstall()) {
            let attempts = 0;
            const timer = window.setInterval(() => {
                attempts += 1;
                if (tryInstall() || attempts > 20) window.clearInterval(timer);
            }, 150);
        }
    }

    function createSystemSheet() {
        if (document.getElementById('system-sheet-backdrop')) return;

        const backdrop = document.createElement('div');
        backdrop.id = 'system-sheet-backdrop';
        backdrop.className = 'system-sheet-backdrop';
        backdrop.setAttribute('aria-hidden', 'true');
        backdrop.innerHTML = `
            <section class="system-sheet" role="dialog" aria-modal="true" aria-labelledby="system-sheet-title">
                <div class="system-sheet-head">
                    <div>
                        <div class="system-sheet-kicker">APP HEALTH</div>
                        <div id="system-sheet-title" class="system-sheet-title">SYSTEM STATUS</div>
                    </div>
                    <button id="system-sheet-close" class="system-sheet-close" type="button" aria-label="Close system status">×</button>
                </div>

                <div class="system-health-grid">
                    <div class="system-health-card">
                        <span class="system-health-label">Connection</span>
                        <strong id="system-connection" class="system-health-value">—</strong>
                    </div>
                    <div class="system-health-card">
                        <span class="system-health-label">Queued Writes</span>
                        <strong id="system-queue-count" class="system-health-value">—</strong>
                    </div>
                    <div class="system-health-card">
                        <span class="system-health-label">Last Sheet Sync</span>
                        <strong id="system-last-sync" class="system-health-value">—</strong>
                    </div>
                    <div class="system-health-card">
                        <span class="system-health-label">App Build</span>
                        <strong class="system-health-value">${BUILD_VERSION}</strong>
                    </div>
                </div>

                <div class="system-queue-title">PENDING WRITE QUEUE</div>
                <div id="system-queue-list"><div class="system-queue-empty">No queued writes.</div></div>

                <p id="system-install-note" class="system-install-note"></p>

                <div class="system-sheet-actions">
                    <button id="system-sync-now" class="system-action-btn primary" type="button">SYNC QUEUE NOW</button>
                    <button id="system-check-update" class="system-action-btn" type="button">CHECK FOR UPDATE</button>
                </div>
            </section>
        `;

        document.body.appendChild(backdrop);

        document.getElementById('system-sheet-close')?.addEventListener('click', closeSystemSheet);
        document.getElementById('system-sync-now')?.addEventListener('click', syncQueueNow);
        document.getElementById('system-check-update')?.addEventListener('click', () => checkForUpdate(true));

        backdrop.addEventListener('click', (event) => {
            if (event.target === backdrop) closeSystemSheet();
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && backdrop.classList.contains('open')) closeSystemSheet();
        });
    }

    function openSystemSheet() {
        renderSystemState();
        const backdrop = document.getElementById('system-sheet-backdrop');
        if (!backdrop) return;
        backdrop.classList.add('open');
        backdrop.setAttribute('aria-hidden', 'false');
        document.body.classList.add('modal-open');
    }

    function closeSystemSheet() {
        const backdrop = document.getElementById('system-sheet-backdrop');
        if (!backdrop) return;
        backdrop.classList.remove('open');
        backdrop.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('modal-open');
    }

    function installRapidTapGuard() {
        document.addEventListener('click', (event) => {
            const button = event.target.closest('.action-btn');
            if (!button || button.classList.contains('rapid-tap-lock')) return;

            button.classList.add('rapid-tap-lock');
            window.setTimeout(() => button.classList.remove('rapid-tap-lock'), 450);
        }, true);
    }

    function bindRuntimeEvents() {
        const rerender = () => scheduleRender();

        ['online', 'offline', 'focus'].forEach((name) => window.addEventListener(name, rerender));
        [
            'glen-growth-write-queued',
            'glen-growth-write-confirmed',
            'glen-growth-queue-empty',
            'glen-growth-network-sync'
        ].forEach((name) => window.addEventListener(name, rerender));

        window.addEventListener('online', () => {
            window.setTimeout(() => {
                if (window.glenGrowthOfflineQueue?.count?.() > 0) {
                    window.glenGrowthOfflineQueue.flush().catch(() => {});
                }
            }, 250);
        });

        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState !== 'visible') return;

            renderSystemState();

            if (navigator.onLine && window.glenGrowthOfflineQueue?.count?.() > 0) {
                window.glenGrowthOfflineQueue.flush().catch(() => {});
            }

            const lastCheck = Number(localStorage.getItem(UPDATE_CHECK_KEY) || 0);
            if (!lastCheck || Date.now() - lastCheck > UPDATE_CHECK_INTERVAL_MS) {
                checkForUpdate(false);
            }
        });
    }

    function scheduleRender() {
        window.clearTimeout(renderTimer);
        renderTimer = window.setTimeout(renderSystemState, 120);
    }

    function getQueue() {
        try {
            const queue = window.glenGrowthOfflineQueue?.list?.();
            return Array.isArray(queue) ? queue : [];
        } catch (_) {
            return [];
        }
    }

    function renderSystemState() {
        const queue = getQueue();
        const connection = document.getElementById('system-connection');
        const queueCount = document.getElementById('system-queue-count');
        const lastSync = document.getElementById('system-last-sync');
        const queueList = document.getElementById('system-queue-list');
        const syncButton = document.getElementById('system-sync-now');
        const installNote = document.getElementById('system-install-note');

        if (connection) {
            connection.textContent = navigator.onLine ? 'ONLINE' : 'OFFLINE';
            connection.className = `system-health-value ${navigator.onLine ? 'good' : 'warn'}`;
        }

        if (queueCount) {
            queueCount.textContent = String(queue.length);
            queueCount.className = `system-health-value ${queue.length ? 'warn' : 'good'}`;
        }

        if (lastSync) {
            const raw = localStorage.getItem('glenGrowth:pwa:lastSyncAt');
            lastSync.textContent = raw ? formatDateTime(raw) : 'NOT YET';
        }

        if (syncButton) {
            syncButton.disabled = !navigator.onLine || queue.length === 0;
            syncButton.textContent = !queue.length ? 'QUEUE IS CLEAR' : (navigator.onLine ? 'SYNC QUEUE NOW' : 'RECONNECT TO SYNC');
        }

        if (queueList) {
            queueList.replaceChildren();

            if (!queue.length) {
                const empty = document.createElement('div');
                empty.className = 'system-queue-empty';
                empty.textContent = 'No queued writes. Everything stored on this device has synced.';
                queueList.appendChild(empty);
            } else {
                queue.slice(0, 6).forEach((item) => {
                    const row = document.createElement('div');
                    row.className = 'system-queue-item';

                    const main = document.createElement('div');
                    main.className = 'system-queue-main';
                    main.innerHTML = `<span>${friendlyMutationName(item.type, item.payload)}</span><span>${ageLabel(item.createdAt)}</span>`;

                    const meta = document.createElement('div');
                    meta.className = 'system-queue-meta';
                    meta.textContent = `Attempts: ${Number(item.attemptCount || 0)} · ID ${String(item.mutationId || '').slice(0, 8)}`;

                    row.append(main, meta);

                    if (item.lastError) {
                        const error = document.createElement('div');
                        error.className = 'system-queue-error';
                        error.textContent = `Last sync issue: ${String(item.lastError)}`;
                        row.appendChild(error);
                    }

                    queueList.appendChild(row);
                });

                if (queue.length > 6) {
                    const extra = document.createElement('div');
                    extra.className = 'system-queue-empty';
                    extra.textContent = `+ ${queue.length - 6} more queued writes`;
                    queueList.appendChild(extra);
                }
            }
        }

        if (installNote) {
            const isiOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
            const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
            installNote.textContent = isiOS && !standalone
                ? 'iPhone/iPad install: open in Safari, tap Share, then Add to Home Screen.'
                : standalone
                    ? 'Running as an installed app.'
                    : 'You can install Glen Growth from your browser when the install option is available.';
        }
    }

    async function syncQueueNow() {
        const button = document.getElementById('system-sync-now');
        if (!navigator.onLine || !window.glenGrowthOfflineQueue?.flush) return;

        if (button) {
            button.disabled = true;
            button.textContent = 'SYNCING...';
        }

        try {
            await window.glenGrowthOfflineQueue.flush(true);
        } finally {
            renderSystemState();
        }
    }

    function friendlyMutationName(type, payload) {
        if (type === 'addAction') return String(payload?.actionType || 'Action');
        if (type === 'addDeal') return `Deal · ${String(payload?.client || payload?.category || 'Booked')}`;
        if (type === 'markDealPaid') return `Payment · ${String(payload?.client || 'Deal')}`;
        return String(type || 'Queued write');
    }

    function ageLabel(value) {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return 'queued';
        const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
        if (seconds < 60) return `${seconds}s ago`;
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        return `${Math.floor(hours / 24)}d ago`;
    }

    function formatDateTime(value) {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '—';
        return date.toLocaleString('en-CA', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
        });
    }

    async function registerFinalServiceWorker() {
        if (!('serviceWorker' in navigator)) return;

        try {
            registration = await navigator.serviceWorker.register(SW_URL, { scope: './' });
            bindRegistration(registration);
            await checkForUpdate(false);
        } catch (error) {
            console.error('Final service worker registration failed:', error);
        }
    }

    function bindRegistration(reg) {
        if (reg.waiting) showUpdateReady(reg.waiting);

        reg.addEventListener('updatefound', () => {
            const worker = reg.installing;
            if (!worker) return;

            worker.addEventListener('statechange', () => {
                if (worker.state === 'installed' && navigator.serviceWorker.controller) {
                    showUpdateReady(reg.waiting || worker);
                }
            });
        });

        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (!reloadingForUpdate) return;
            window.location.reload();
        });
    }

    async function checkForUpdate(showFeedback) {
        if (!navigator.onLine || !registration) return;

        const button = document.getElementById('system-check-update');
        if (showFeedback && button) {
            button.disabled = true;
            button.textContent = 'CHECKING...';
        }

        try {
            localStorage.setItem(UPDATE_CHECK_KEY, String(Date.now()));
            await registration.update();

            if (registration.waiting) {
                showUpdateReady(registration.waiting);
                if (showFeedback) showToast('A new app version is ready.');
            } else if (showFeedback) {
                showToast('Glen Growth is up to date.');
            }
        } catch (error) {
            console.warn('Update check failed:', error);
            if (showFeedback) showToast('Could not check for updates right now.');
        } finally {
            if (button) {
                button.disabled = false;
                button.textContent = 'CHECK FOR UPDATE';
            }
        }
    }

    function showUpdateReady(worker) {
        updateWorker = worker;
        const button = document.getElementById('pwa-update-btn');
        if (button) button.hidden = false;
    }

    function applyUpdate() {
        const worker = registration?.waiting || updateWorker;
        if (!worker) return;
        reloadingForUpdate = true;
        worker.postMessage({ type: 'SKIP_WAITING' });
    }

    function showToast(message) {
        if (typeof window.showGlenGrowthToast === 'function') {
            window.showGlenGrowthToast(message);
        } else {
            console.log(message);
        }
    }
})();
