(function GlenGrowthPWAFoundation() {
    const READ_CACHE_PREFIX = 'glenGrowth:pwa:data:';
    const LAST_SYNC_KEY = 'glenGrowth:pwa:lastSyncAt';
    const READ_ACTIONS = new Set(['getToday', 'getWeek', 'getMoney', 'getWins', 'getStreak']);

    let deferredInstallPrompt = null;
    let refreshTimer = null;

    addPwaHeadMetadata();
    installApiCacheLayer();
    installSafeWriteLayer();
    installCachedViewLoaders();
    registerServiceWorker();

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupPwaUi, { once: true });
    } else {
        setupPwaUi();
    }

    function addPwaHeadMetadata() {
        if (!document.querySelector('link[rel="manifest"]')) {
            const manifest = document.createElement('link');
            manifest.rel = 'manifest';
            manifest.href = './manifest.webmanifest?v=20260907-1';
            document.head.appendChild(manifest);
        }

        ensureMeta('theme-color', '#ccff00');
        ensureMeta('apple-mobile-web-app-capable', 'yes');
        ensureMeta('apple-mobile-web-app-status-bar-style', 'black-translucent');
        ensureMeta('apple-mobile-web-app-title', 'Glen Growth');
        ensureMeta('description', 'Business development, revenue and growth tracker.');

        if (!document.querySelector('link[rel="apple-touch-icon"]')) {
            const icon = document.createElement('link');
            icon.rel = 'apple-touch-icon';
            icon.href = './icon.svg?v=20260907-1';
            document.head.appendChild(icon);
        }
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

    function installApiCacheLayer() {
        const nativeJsonpRequest = window.jsonpRequest;

        if (typeof nativeJsonpRequest !== 'function') return;

        window.jsonpRequest = async function cachedJsonpRequest(params, timeoutMs = 10000) {
            const action = String(params?.action || '').trim();
            const canCache = READ_ACTIONS.has(action);

            if (canCache && !navigator.onLine) {
                const cached = readApiCache(action);
                if (cached) return cachedResponse(cached);
                throw new Error('Offline and no saved data is available yet.');
            }

            try {
                const data = await nativeJsonpRequest(params, timeoutMs);

                if (canCache && data && data.ok === true) {
                    saveApiCache(action, data);
                }

                return data;
            } catch (error) {
                if (canCache) {
                    const cached = readApiCache(action);
                    if (cached) return cachedResponse(cached);
                }

                throw error;
            }
        };
    }

    function saveApiCache(action, data) {
        const savedAt = new Date().toISOString();
        const cleanData = { ...data };
        delete cleanData._fromCache;
        delete cleanData._cachedAt;

        try {
            localStorage.setItem(
                `${READ_CACHE_PREFIX}${action}`,
                JSON.stringify({ savedAt, data: cleanData })
            );
            localStorage.setItem(LAST_SYNC_KEY, savedAt);
        } catch (error) {
            console.warn('Could not save offline dashboard data:', error);
        }

        window.dispatchEvent(new CustomEvent('glen-growth-network-sync', {
            detail: { action, savedAt }
        }));
    }

    function readApiCache(action) {
        try {
            const raw = localStorage.getItem(`${READ_CACHE_PREFIX}${action}`);
            if (!raw) return null;

            const parsed = JSON.parse(raw);
            if (!parsed || !parsed.data || parsed.data.ok !== true) return null;
            return parsed;
        } catch (error) {
            console.warn('Could not read offline dashboard data:', error);
            return null;
        }
    }

    function cachedResponse(cached) {
        return {
            ...cached.data,
            _fromCache: true,
            _cachedAt: cached.savedAt
        };
    }

    function installSafeWriteLayer() {
        const nativePostToApi = window.postToApi;

        if (typeof nativePostToApi === 'function') {
            window.postToApi = async function safeOnlinePost(payload) {
                if (!navigator.onLine) {
                    throw new Error('Offline writes are disabled until safe sync is added.');
                }

                const result = await nativePostToApi(payload);

                window.dispatchEvent(new CustomEvent('glen-growth-write-sent', {
                    detail: { action: String(payload?.action || '') }
                }));

                return result;
            };
        }

        window.sendAction = async function safeSendAction(actionData) {
            const payload = {
                action: 'addAction',
                actionType: actionData.actionType,
                count: 1,
                xp: actionData.xp,
                mode: getModeLabel(),
                notes: 'Glen Growth web app'
            };

            try {
                await window.postToApi(payload);
                setWeekSyncStatus('OPEN WEEK TO REFRESH');
                console.log(`${actionData.actionType} sent to Google Sheets.`);
            } catch (error) {
                state.xp = Math.max(0, state.xp - safeNumber(actionData.xp));
                state[actionData.type] = Math.max(0, safeNumber(state[actionData.type]) - 1);
                renderUI();
                setSyncStatus('NOT SAVED — TRY AGAIN ONLINE');
                showPwaToast('Action was not saved. Reconnect and tap it again.');
                console.error(`Could not send ${actionData.actionType} to Google Sheets:`, error);
            }
        };
    }

    function installCachedViewLoaders() {
        window.loadTodayState = async function cachedTodayLoader() {
            setSyncStatus(navigator.onLine ? 'SYNCING...' : 'LOADING SAVED...');
            setActionButtonsDisabled(true);

            try {
                const data = await window.jsonpRequest({ action: 'getToday' });

                if (!data || data.ok !== true) {
                    throw new Error(data?.error || 'Could not load today data');
                }

                state.xp = safeNumber(data.xp);
                state.contacts = safeNumber(data.contacts);
                state.followups = safeNumber(data.followups);
                state.rev = safeNumber(data.rev);
                state.bookedAmount = safeNumber(data.bookedAmount);
                state.estimatedProfit = safeNumber(data.estimatedProfit);
                state.dealsBooked = safeNumber(data.dealsBooked);

                renderUI();
                setSyncStatus(data._fromCache ? cachedViewLabel(data) : 'SHEET SYNCED');
            } catch (error) {
                console.error('Could not restore today:', error);
                setSyncStatus(navigator.onLine ? 'SYNC FAILED' : 'OFFLINE — NO SAVED DATA');
            } finally {
                setActionButtonsDisabled(false);
            }
        };

        window.loadWeekState = async function cachedWeekLoader() {
            setWeekSyncStatus(navigator.onLine ? 'SYNCING...' : 'LOADING SAVED...');

            try {
                const data = await window.jsonpRequest({ action: 'getWeek' });

                if (!data || data.ok !== true) {
                    throw new Error(data?.error || 'Could not load week data');
                }

                renderWeek(data);
                setWeekSyncStatus(data._fromCache ? cachedViewLabel(data) : 'SHEET SYNCED');
            } catch (error) {
                console.error('Could not restore week:', error);
                setWeekSyncStatus(navigator.onLine ? 'WEEK SYNC FAILED' : 'OFFLINE — NO SAVED DATA');
            }
        };

        if (typeof window.renderMoney === 'function') {
            window.loadMoneyState = async function cachedMoneyLoader() {
                setMoneySyncStatus(navigator.onLine ? 'SYNCING...' : 'LOADING SAVED...');

                try {
                    const data = await window.jsonpRequest({ action: 'getMoney' });

                    if (!data || data.ok !== true) {
                        throw new Error(data?.error || 'Could not load money data');
                    }

                    renderMoney(data);
                    setMoneySyncStatus(data._fromCache ? cachedViewLabel(data) : 'SHEET SYNCED');
                } catch (error) {
                    console.error('Could not restore money:', error);
                    setMoneySyncStatus(navigator.onLine ? 'MONEY SYNC FAILED' : 'OFFLINE — NO SAVED DATA');
                }
            };
        }

        if (typeof window.renderWins === 'function') {
            window.loadWinsState = async function cachedWinsLoader() {
                setWinsSyncStatus(navigator.onLine ? 'SYNCING...' : 'LOADING SAVED...');

                try {
                    const data = await window.jsonpRequest({ action: 'getWins' });

                    if (!data || data.ok !== true) {
                        throw new Error(data?.error || 'Could not load wins data');
                    }

                    renderWins(data);
                    setWinsSyncStatus(data._fromCache ? cachedViewLabel(data) : 'SHEET SYNCED');
                } catch (error) {
                    console.error('Could not restore wins:', error);
                    setWinsSyncStatus(navigator.onLine ? 'WINS SYNC FAILED' : 'OFFLINE — NO SAVED DATA');
                }
            };
        }
    }

    function cachedViewLabel(data) {
        const time = formatSyncTime(data?._cachedAt);
        return time ? `CACHED · ${time}` : 'CACHED — OFFLINE';
    }

    function setupPwaUi() {
        injectPwaStyles();
        injectConnectionBar();
        bindConnectivityEvents();
        bindInstallEvents();
        bindOfflineWriteGuard();
        updateConnectionBar();

        window.addEventListener('glen-growth-network-sync', updateConnectionBar);
        window.addEventListener('glen-growth-write-sent', schedulePostWriteRefresh);

        window.setTimeout(() => refreshDashboards('all'), 250);
    }

    function injectPwaStyles() {
        if (document.getElementById('glen-growth-pwa-styles')) return;

        const style = document.createElement('style');
        style.id = 'glen-growth-pwa-styles';
        style.textContent = `
            :root { color-scheme: dark; }

            body {
                padding-bottom: max(0px, env(safe-area-inset-bottom));
            }

            .pwa-status-bar {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 10px;
                min-height: 44px;
                margin: -8px 0 18px;
                padding: 9px 12px;
                border: 1px solid #292929;
                border-radius: 12px;
                background: #0c0c0c;
                color: #999;
                font-size: 0.68rem;
                font-weight: 800;
                letter-spacing: 0.35px;
            }

            .pwa-status-copy {
                display: flex;
                min-width: 0;
                align-items: center;
                gap: 7px;
                flex-wrap: wrap;
            }

            .pwa-status-dot {
                width: 8px;
                height: 8px;
                flex: 0 0 auto;
                border-radius: 50%;
                background: #39ff14;
                box-shadow: 0 0 10px rgba(57, 255, 20, 0.45);
            }

            .pwa-status-bar.offline {
                border-color: rgba(255, 186, 0, 0.3);
                background: rgba(255, 186, 0, 0.05);
            }

            .pwa-status-bar.offline .pwa-status-dot {
                background: #ffba00;
                box-shadow: 0 0 10px rgba(255, 186, 0, 0.35);
            }

            .pwa-network-label {
                color: #e9e9e9;
                font-weight: 900;
            }

            .pwa-install-btn {
                min-height: 34px;
                padding: 0 12px;
                flex: 0 0 auto;
                border: 1px solid rgba(204, 255, 0, 0.38);
                border-radius: 9px;
                background: rgba(204, 255, 0, 0.08);
                color: #ccff00;
                font: inherit;
                font-size: 0.67rem;
                font-weight: 900;
                letter-spacing: 0.6px;
                cursor: pointer;
            }

            .pwa-install-btn[hidden] { display: none; }

            .pwa-toast {
                position: fixed;
                left: 50%;
                bottom: max(18px, calc(env(safe-area-inset-bottom) + 12px));
                z-index: 2000;
                width: min(360px, calc(100vw - 32px));
                transform: translateX(-50%) translateY(16px);
                padding: 12px 14px;
                border: 1px solid rgba(255, 186, 0, 0.35);
                border-radius: 12px;
                background: #141414;
                color: #fff;
                font-size: 0.78rem;
                font-weight: 800;
                line-height: 1.35;
                opacity: 0;
                pointer-events: none;
                transition: opacity 0.18s ease, transform 0.18s ease;
                box-shadow: 0 12px 36px rgba(0, 0, 0, 0.55);
            }

            .pwa-toast.show {
                opacity: 1;
                transform: translateX(-50%) translateY(0);
            }

            body.pwa-offline .action-btn,
            body.pwa-offline #deal-save,
            body.pwa-offline .win-mark-paid {
                opacity: 0.48;
                cursor: not-allowed;
            }

            @media (display-mode: standalone) {
                .app-header {
                    padding-top: max(0px, env(safe-area-inset-top));
                }
            }

            @media (max-width: 340px) {
                .pwa-status-bar {
                    align-items: flex-start;
                    flex-direction: column;
                }
            }
        `;

        document.head.appendChild(style);
    }

    function injectConnectionBar() {
        if (document.getElementById('pwa-status-bar')) return;

        const nav = document.querySelector('.view-tabs');
        if (!nav) return;

        const bar = document.createElement('div');
        bar.id = 'pwa-status-bar';
        bar.className = 'pwa-status-bar';
        bar.setAttribute('role', 'status');
        bar.setAttribute('aria-live', 'polite');
        bar.innerHTML = `
            <div class="pwa-status-copy">
                <span class="pwa-status-dot" aria-hidden="true"></span>
                <span class="pwa-network-label" id="pwa-network-label">ONLINE</span>
                <span id="pwa-last-sync">Preparing offline access...</span>
            </div>
            <button id="pwa-install-btn" class="pwa-install-btn" type="button" hidden>INSTALL</button>
        `;

        nav.insertAdjacentElement('afterend', bar);
    }

    function bindConnectivityEvents() {
        window.addEventListener('online', () => {
            updateConnectionBar();
            showPwaToast('Back online. Refreshing saved dashboards.');
            refreshDashboards('all');
        });

        window.addEventListener('offline', () => {
            updateConnectionBar();
            showPwaToast('Offline mode: saved dashboards are available. Logging is paused.');
        });
    }

    function bindInstallEvents() {
        const button = document.getElementById('pwa-install-btn');
        if (!button) return;

        window.addEventListener('beforeinstallprompt', (event) => {
            event.preventDefault();
            deferredInstallPrompt = event;

            if (!isStandalone()) {
                button.hidden = false;
            }
        });

        button.addEventListener('click', async () => {
            if (!deferredInstallPrompt) return;

            deferredInstallPrompt.prompt();

            try {
                await deferredInstallPrompt.userChoice;
            } finally {
                deferredInstallPrompt = null;
                button.hidden = true;
            }
        });

        window.addEventListener('appinstalled', () => {
            deferredInstallPrompt = null;
            button.hidden = true;
            showPwaToast('Glen Growth installed.');
        });

        if (isStandalone()) {
            button.hidden = true;
        }
    }

    function bindOfflineWriteGuard() {
        const selector = '.action-btn, #deal-save, .win-mark-paid';

        document.addEventListener('click', (event) => {
            if (navigator.onLine) return;

            const writeControl = event.target.closest(selector);
            if (!writeControl) return;

            event.preventDefault();
            event.stopImmediatePropagation();
            showPwaToast('Logging is paused offline. Reconnect before saving changes.');
        }, true);

        document.addEventListener('submit', (event) => {
            if (navigator.onLine) return;
            if (event.target?.id !== 'deal-form') return;

            event.preventDefault();
            event.stopImmediatePropagation();
            showPwaToast('Deals cannot be saved offline yet. Reconnect and submit again.');
        }, true);
    }

    function updateConnectionBar() {
        const bar = document.getElementById('pwa-status-bar');
        const label = document.getElementById('pwa-network-label');
        const sync = document.getElementById('pwa-last-sync');

        document.body.classList.toggle('pwa-offline', !navigator.onLine);

        if (bar) bar.classList.toggle('offline', !navigator.onLine);
        if (label) label.textContent = navigator.onLine ? 'ONLINE' : 'OFFLINE';

        const lastSync = localStorage.getItem(LAST_SYNC_KEY);
        const lastSyncText = formatSyncTime(lastSync);

        if (sync) {
            if (navigator.onLine) {
                sync.textContent = lastSyncText ? `Last synced ${lastSyncText}` : 'Connecting to Sheets...';
            } else {
                sync.textContent = lastSyncText ? `Saved data · ${lastSyncText}` : 'No saved data yet';
            }
        }
    }

    function formatSyncTime(value) {
        if (!value) return '';

        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '';

        const today = new Date();
        const sameDay = date.toDateString() === today.toDateString();

        return date.toLocaleString('en-CA', sameDay
            ? { hour: 'numeric', minute: '2-digit' }
            : { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }
        );
    }

    function schedulePostWriteRefresh(event) {
        window.clearTimeout(refreshTimer);

        const writeAction = String(event?.detail?.action || '');

        refreshTimer = window.setTimeout(() => {
            if (writeAction === 'addAction') {
                refreshDashboards('activity');
            } else {
                refreshDashboards('all');
            }
        }, 1800);
    }

    function refreshDashboards(scope) {
        const tasks = [];

        if (typeof window.loadTodayState === 'function') tasks.push(window.loadTodayState());
        if (typeof window.loadWeekState === 'function') tasks.push(window.loadWeekState());
        if (typeof window.loadStreakState === 'function') tasks.push(window.loadStreakState());

        if (scope === 'all') {
            if (typeof window.loadMoneyState === 'function') tasks.push(window.loadMoneyState());
            if (typeof window.loadWinsState === 'function') tasks.push(window.loadWinsState());
        }

        return Promise.allSettled(tasks);
    }

    function isStandalone() {
        return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    }

    function showPwaToast(message) {
        let toast = document.getElementById('pwa-toast');

        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'pwa-toast';
            toast.className = 'pwa-toast';
            toast.setAttribute('role', 'status');
            toast.setAttribute('aria-live', 'polite');
            document.body.appendChild(toast);
        }

        toast.textContent = message;
        toast.classList.remove('show');
        void toast.offsetWidth;
        toast.classList.add('show');

        window.clearTimeout(showPwaToast.timer);
        showPwaToast.timer = window.setTimeout(() => {
            toast.classList.remove('show');
        }, 3200);
    }

    async function registerServiceWorker() {
        if (!('serviceWorker' in navigator)) return;

        try {
            const registration = await navigator.serviceWorker.register('./sw.js?v=20260907-1', {
                scope: './'
            });

            registration.update().catch(() => {});
        } catch (error) {
            console.error('Could not register Glen Growth service worker:', error);
        }
    }
})();
