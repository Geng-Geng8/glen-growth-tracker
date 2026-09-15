(function GlenGrowthXpActivity() {
    const CACHE_KEY = 'glenGrowth:pwa:data:actionState';
    const normal = new Map(Object.values(actionValues).filter((value) => value.persist)
        .map((value) => [value.actionType, value]));
    const metrics = {
        'Qualified Contact': 'Qualified Contacts', 'Follow-up': 'Follow-ups',
        'Referral / Introduction Asked': 'Referral / Introduction Asked',
        'Software Interview': 'Software Interviews',
        'Decision-Maker Conversation': 'Decision-Maker Conversations',
        'Next Step Scheduled': 'Next Steps Scheduled', 'Proposal / Quote Sent': 'Proposals / Quotes Sent',
        'Deal Booked': 'Deals Booked'
    };
    let snapshot = readSnapshot();
    let inFlight = null;
    let requestNumber = 0;
    let lastRefresh = 0;
    let lastWeek = null;
    let toastId = '';
    let toastTimer;
    const undoing = new Set();

    window.glenGrowthXpActivity = { logged, refresh, projectToday, projectWeek, projectStreak };
    document.addEventListener('DOMContentLoaded', init, { once: true });

    function readSnapshot() {
        try {
            const saved = JSON.parse(localStorage.getItem(CACHE_KEY));
            return saved?.ok === true && Array.isArray(saved.actions) ? saved : null;
        } catch (_) { return null; }
    }

    async function refresh(force = false) {
        if (!navigator.onLine) {
            if (force) throw new Error('Reconnect to confirm the action snapshot.');
            repaint();
            return snapshot;
        }
        if (!force && inFlight) return inFlight;
        if (!force && Date.now() - lastRefresh < 1500) return snapshot;
        const number = ++requestNumber;
        const task = (async () => {
            const data = await window.jsonpRequest({ action: 'getActionState' });
            if (!data?.ok || !Array.isArray(data.actions) || !data.timeZone) {
                throw new Error('Deploy the updated Code.gs to enable synced action Undo.');
            }
            if (number !== requestNumber) {
                // A newer read supersedes this one; wait for it before removing any queue overlay.
                return inFlight;
            }
            // Another tab may already have saved a newer snapshot while this request was in flight.
            const save = () => {
                const saved = readSnapshot();
                snapshot = saved && saved.version > data.version ? saved : data;
                localStorage.setItem(CACHE_KEY, JSON.stringify(snapshot));
            };
            if (navigator.locks) await navigator.locks.request('glenGrowth:offlineQueue:v2:lock', save);
            else save();
            lastRefresh = Date.now();
            document.getElementById('recent-activity-note').textContent = 'Only sales actions can be undone.';
            repaint();
            return snapshot;
        })();
        inFlight = task;
        try { return await task; }
        finally { if (inFlight === task) inFlight = null; }
    }

    function dateKey(value = new Date()) {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        const parts = new Intl.DateTimeFormat('en-CA', {
            timeZone: snapshot?.timeZone, year: 'numeric', month: '2-digit', day: '2-digit'
        }).formatToParts(date);
        const part = (type) => parts.find((entry) => entry.type === type).value;
        return `${part('year')}-${part('month')}-${part('day')}`;
    }

    function records() {
        const entries = new Map((snapshot?.actions || []).map((entry) => [entry.id, entry]));
        const queue = window.glenGrowthOfflineQueue?.list() || [];
        for (const item of queue) {
            const payload = item.payload;
            let id = item.mutationId;
            let actionType = payload.actionType;
            let xp = safeNumber(payload.xp);
            if (item.type === 'addDeal') { id = `dealxp:${id}`; actionType = 'Deal Booked'; xp = 20; }
            else if (item.type === 'markDealPaid') { id = `payxp:${id}`; actionType = 'Payment Collected'; xp = 10; }
            else if (item.type !== 'addAction') continue;
            if (!entries.has(id)) {
                const createdAt = payload.clientCreatedAt || item.createdAt;
                entries.set(id, { id, actionType, xp, count: safeNumber(payload.count || 1), createdAt, date: dateKey(createdAt), queued: true });
            }
        }
        queue.filter((item) => item.type === 'undoAction').forEach((item) => entries.delete(item.payload.actionId));
        return [...entries.values()];
    }

    function projectToday() {
        if (!snapshot) return;
        const today = dateKey();
        state.xp = state.contacts = state.followups = state.rev = 0;
        records().filter((entry) => entry.date === today).forEach((entry) => {
            state.xp += entry.xp;
            const type = normal.get(entry.actionType)?.type || (entry.actionType === 'Deal Booked' ? 'rev' : null);
            if (type) state[type] += entry.count;
        });
    }

    function projectWeek(data) {
        lastWeek = data;
        if (!snapshot) return data;
        const week = records().filter((entry) => entry.date >= data.weekStart && entry.date <= data.weekEnd);
        return {
            ...data,
            xp: week.reduce((sum, entry) => sum + entry.xp, 0),
            metrics: (data.metrics || []).map((metric) => ({
                ...metric,
                current: week.filter((entry) => metrics[entry.actionType] === metric.name).reduce((sum, entry) => sum + entry.count, 0)
            }))
        };
    }

    // Same workday/Travel Mode rules as the supplied Code.gs getStreak, applied to the pending view.
    function projectStreak(fallback) {
        if (!snapshot) return fallback;
        const days = {};
        records().forEach((entry) => {
            if (!entry.date) return;
            const day = days[entry.date] ||= { contacts: 0, followups: 0, rev: 0 };
            const type = normal.get(entry.actionType)?.type || (entry.actionType === 'Deal Booked' ? 'rev' : null);
            if (type) day[type] += entry.count;
        });
        const today = dateKey();
        const earliest = Object.keys(days).sort()[0];
        const isWorkday = (key) => ![0, 6].includes(new Date(`${key}T12:00:00Z`).getUTCDay());
        const shift = (key, n) => new Date(new Date(`${key}T12:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);
        const previous = (key) => { do { key = shift(key, -1); } while (!isWorkday(key)); return key; };
        const complete = (key) => {
            const day = days[key] || { contacts: 0, followups: 0, rev: 0 };
            const travel = snapshot.travelStart && snapshot.fullSalesStart && key >= snapshot.travelStart && key < snapshot.fullSalesStart;
            return travel ? day.contacts >= 1 && day.followups >= 1 : day.contacts >= 3 && day.followups >= 3 && day.rev >= 1;
        };
        let bestStreak = 0, running = 0, currentStreak = 0;
        for (let cursor = earliest; cursor && cursor <= today; cursor = shift(cursor, 1)) {
            if (isWorkday(cursor)) {
                running = complete(cursor) ? running + 1 : 0;
                bestStreak = Math.max(bestStreak, running);
            }
        }
        let anchor = isWorkday(today) && complete(today) ? today : previous(today);
        while (earliest && anchor >= earliest && complete(anchor)) {
            currentStreak += 1;
            anchor = previous(anchor);
        }
        return { ...fallback, currentStreak, bestStreak, todayComplete: isWorkday(today) && complete(today) };
    }

    function repaint() {
        if (!document.getElementById('recent-activity-list')) return;
        projectToday();
        renderUI();
        if (lastWeek) renderWeek(lastWeek);
        if (snapshot) renderStreak({});
        renderRecent();
    }

    function logged(item) {
        if (!snapshot) {
            const value = normal.get(item.payload.actionType);
            if (dateKey(item.payload.clientCreatedAt) === dateKey()) {
                state.xp += value.xp;
                state[value.type] += 1;
            }
        }
        repaint();
        const toast = document.getElementById('xp-action-toast');
        toastId = item.mutationId;
        document.getElementById('xp-action-message').textContent = `${item.payload.actionType} logged · +${item.payload.xp} XP`;
        toast.hidden = false;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => { if (!toast.contains(document.activeElement)) toast.hidden = true; }, 8000);
    }

    async function undo(id, button) {
        const record = records().find((entry) => entry.id === id);
        if (!record || !normal.has(record.actionType) || undoing.has(id)) return;
        undoing.add(id);
        button.disabled = true;
        try {
            const queue = window.glenGrowthOfflineQueue;
            const pending = queue.list().find((item) => item.type === 'addAction' && item.mutationId === id);
            if (!snapshot && (!pending || pending.attemptCount || pending.lastAttemptAt)) {
                throw new Error('Connect after deploying the updated Code.gs to enable Undo.');
            }
            const result = await queue.undoAction(record);
            if (!snapshot && result.cancelled && record.date === dateKey()) {
                state.xp -= record.xp;
                state[normal.get(record.actionType).type] -= record.count;
            }
            document.getElementById('xp-action-toast').hidden = true;
            window.showGlenGrowthToast?.(result.cancelled ? 'Action cancelled. It will not sync.' : 'Action undone locally. Sheet update queued.');
            repaint();
            document.getElementById('recent-activity-title').focus();
        } catch (error) {
            window.showGlenGrowthToast?.(error.message);
        } finally {
            undoing.delete(id);
            button.disabled = false;
        }
    }

    function renderRecent() {
        const list = document.getElementById('recent-activity-list');
        if (!list) return;
        list.replaceChildren();
        const recent = records().filter((entry) => normal.has(entry.actionType))
            .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 5);
        for (const entry of recent) {
            const row = document.createElement('li');
            const copy = document.createElement('div');
            const title = document.createElement('strong');
            title.textContent = `${entry.actionType} · +${entry.xp} XP`;
            const time = document.createElement('small');
            time.textContent = (/^\d{4}-\d{2}-\d{2}$/.test(entry.createdAt) ? entry.date : new Date(entry.createdAt).toLocaleString('en-CA', {
                month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: snapshot?.timeZone
            })) + (entry.queued ? ' · queued' : '');
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = 'Undo';
            button.setAttribute('aria-label', `Undo ${entry.actionType}, ${time.textContent}`);
            button.disabled = undoing.has(entry.id) || !navigator.locks;
            button.addEventListener('click', () => undo(entry.id, button));
            copy.append(title, time);
            row.append(copy, button);
            list.appendChild(row);
        }
        if (!recent.length) {
            const empty = document.createElement('li');
            empty.textContent = snapshot ? 'No recent sales actions.' : 'Connect to load recent activity.';
            list.appendChild(empty);
        }
        if (toastId && !records().some((entry) => entry.id === toastId)) document.getElementById('xp-action-toast').hidden = true;
    }

    function init() {
        const guide = document.getElementById('xp-guide');
        const opener = document.getElementById('xp-guide-open');
        opener.addEventListener('click', () => guide.showModal());
        document.getElementById('xp-guide-close').addEventListener('click', () => guide.close());
        guide.addEventListener('click', (event) => { if (event.target === guide) guide.close(); });
        guide.addEventListener('close', () => opener.focus());
        document.getElementById('xp-action-undo').addEventListener('click', (event) => undo(toastId, event.currentTarget));
        const refreshQuietly = () => refresh().catch((error) => {
            document.getElementById('recent-activity-note').textContent = snapshot ? 'Saved activity · reconnect to refresh.' : error.message;
        });
        ['glen-growth-write-queued', 'glen-growth-write-confirmed', 'glen-growth-action-undone'].forEach((event) => window.addEventListener(event, repaint));
        window.addEventListener('glen-growth-network-sync', refreshQuietly);
        window.addEventListener('online', refreshQuietly);
        window.addEventListener('storage', (event) => {
            if (event.key === CACHE_KEY || event.key === 'glenGrowth:offlineQueue:v2') {
                snapshot = readSnapshot();
                repaint();
            }
        });
        repaint();
        refreshQuietly();
    }
})();
