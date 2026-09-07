const API_URL = 'https://script.google.com/macros/s/AKfycbzI02niw2iGEJKqOw6hfCjY0tRUhPpDZ5xQ64jd5lqGIhuybSnmm-oPWorHfuy7BkYV/exec';

const state = {
    xp: 0,
    contacts: 0,
    followups: 0,
    rev: 0,
    bookedAmount: 0,
    estimatedProfit: 0,
    dealsBooked: 0
};

let currentMode = 'sales';
let targets = {
    contacts: 3,
    followups: 3,
    rev: 1
};

const actionValues = {
    'contact': {
        xp: 1,
        type: 'contacts',
        actionType: 'Qualified Contact',
        persist: true
    },
    'followup': {
        xp: 1,
        type: 'followups',
        actionType: 'Follow-up',
        persist: true
    },
    'referral': {
        xp: 3,
        type: 'rev',
        actionType: 'Referral / Introduction Asked',
        persist: true
    },
    'software': {
        xp: 3,
        type: 'rev',
        actionType: 'Software Interview',
        persist: true
    },
    'dm-convo': {
        xp: 5,
        type: 'rev',
        actionType: 'Decision-Maker Conversation',
        persist: true
    },
    'next-step': {
        xp: 5,
        type: 'rev',
        actionType: 'Next Step Scheduled',
        persist: true
    },
    'proposal': {
        xp: 8,
        type: 'rev',
        actionType: 'Proposal / Quote Sent',
        persist: true
    },
    'deal': {
        xp: 20,
        type: 'rev',
        actionType: 'Deal Booked',
        persist: false
    }
};

function init() {
    setupDateAndMode();
    setupEventListeners();
    setupDealForm();
    renderUI();
    loadTodayState();
}

function setupDateAndMode() {
    const today = new Date();

    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('date-display').textContent = today.toLocaleDateString('en-CA', options);

    const year = today.getFullYear();
    const month = today.getMonth() + 1;
    const day = today.getDate();
    const dateNum = year * 10000 + month * 100 + day;

    const modeEl = document.getElementById('active-mode');
    const scheduleTravel = document.getElementById('schedule-travel');
    const scheduleSales = document.getElementById('schedule-sales');
    const revContainer = document.getElementById('progress-rev-container');

    scheduleTravel?.classList.remove('active-schedule');
    scheduleSales?.classList.remove('active-schedule');

    if (dateNum >= 20260909 && dateNum <= 20261003) {
        currentMode = 'travel';
        targets.contacts = 1;
        targets.followups = 1;
        targets.rev = 0;

        modeEl.textContent = 'TRAVEL MODE';
        modeEl.style.color = 'var(--electric-lime)';

        scheduleTravel?.classList.add('active-schedule');
        if (revContainer) revContainer.style.display = 'none';
    } else {
        currentMode = 'sales';
        targets.contacts = 3;
        targets.followups = 3;
        targets.rev = 1;

        modeEl.textContent = 'FULL SALES MODE';
        modeEl.style.color = 'var(--neon-green)';

        scheduleSales?.classList.add('active-schedule');
        if (revContainer) revContainer.style.display = '';
    }

    document.getElementById('target-contacts').textContent = targets.contacts;
    document.getElementById('target-followups').textContent = targets.followups;

    const targetRev = document.getElementById('target-rev');
    if (targetRev) targetRev.textContent = targets.rev;
}

function setupEventListeners() {
    document.querySelectorAll('.action-btn').forEach((btn) => {
        btn.addEventListener('click', handleActionClick);
    });
}

function handleActionClick(event) {
    const btn = event.currentTarget;
    const actionKey = btn.getAttribute('data-action');
    const actionData = actionValues[actionKey];

    if (!actionData) return;

    if (actionKey === 'deal') {
        openDealModal();
        return;
    }

    state.xp += actionData.xp;
    state[actionData.type] += 1;

    renderUI();
    animateAction(btn);
    animateXP();

    if (actionData.persist) {
        sendAction(actionData);
    }
}

function animateAction(btn) {
    btn.style.transform = 'scale(0.94)';
    setTimeout(() => {
        btn.style.transform = 'scale(1)';
    }, 120);
}

function animateXP() {
    const xpEl = document.getElementById('xp-display');
    xpEl.classList.remove('bump');
    void xpEl.offsetWidth;
    xpEl.classList.add('bump');
}

async function sendAction(actionData) {
    const payload = {
        action: 'addAction',
        actionType: actionData.actionType,
        count: 1,
        xp: actionData.xp,
        mode: getModeLabel(),
        notes: 'Glen Growth web app'
    };

    try {
        await postToApi(payload);
        console.log(`${actionData.actionType} sent to Google Sheets.`);
    } catch (error) {
        console.error(`Could not send ${actionData.actionType} to Google Sheets:`, error);
    }
}

async function loadTodayState() {
    setSyncStatus('SYNCING...');
    setActionButtonsDisabled(true);

    try {
        const data = await jsonpRequest({ action: 'getToday' });

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
        setSyncStatus('SHEET SYNCED');
    } catch (error) {
        console.error('Could not restore today from Google Sheets:', error);
        setSyncStatus('SYNC FAILED — TAPS STILL SAVE');
    } finally {
        setActionButtonsDisabled(false);
    }
}

function jsonpRequest(params, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
        const callbackName = `__glenGrowth_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
        const script = document.createElement('script');
        const url = new URL(API_URL);
        let settled = false;

        Object.entries(params || {}).forEach(([key, value]) => {
            url.searchParams.set(key, String(value));
        });

        url.searchParams.set('callback', callbackName);
        url.searchParams.set('_', String(Date.now()));

        const cleanup = () => {
            if (script.parentNode) script.parentNode.removeChild(script);
            try {
                delete window[callbackName];
            } catch (_) {
                window[callbackName] = undefined;
            }
        };

        const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            cleanup();
            reject(new Error('Google Sheets sync timed out'));
        }, timeoutMs);

        window[callbackName] = (data) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            cleanup();
            resolve(data);
        };

        script.onerror = () => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            cleanup();
            reject(new Error('Google Sheets sync request failed'));
        };

        script.src = url.toString();
        document.head.appendChild(script);
    });
}

function setSyncStatus(text) {
    const el = document.getElementById('sync-status');
    if (el) el.textContent = text;
}

function setActionButtonsDisabled(disabled) {
    document.querySelectorAll('.action-btn').forEach((btn) => {
        btn.disabled = disabled;
    });
}

function setupDealForm() {
    const modal = document.getElementById('deal-modal');
    const form = document.getElementById('deal-form');
    const closeBtn = document.getElementById('deal-close');
    const cancelBtn = document.getElementById('deal-cancel');
    const amountInput = document.getElementById('deal-amount');
    const costInput = document.getElementById('deal-cost');

    closeBtn?.addEventListener('click', closeDealModal);
    cancelBtn?.addEventListener('click', closeDealModal);
    form?.addEventListener('submit', handleDealSubmit);
    amountInput?.addEventListener('input', updateProfitPreview);
    costInput?.addEventListener('input', updateProfitPreview);

    modal?.addEventListener('click', (event) => {
        if (event.target === modal) closeDealModal();
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && modal?.classList.contains('open')) {
            closeDealModal();
        }
    });
}

function openDealModal() {
    const modal = document.getElementById('deal-modal');
    const errorEl = document.getElementById('deal-error');

    if (!modal) return;

    if (errorEl) errorEl.textContent = '';
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');

    setTimeout(() => document.getElementById('deal-category')?.focus(), 50);
}

function closeDealModal() {
    const modal = document.getElementById('deal-modal');
    if (!modal) return;

    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
}

function updateProfitPreview() {
    const amount = readMoneyInput('deal-amount');
    const cost = readMoneyInput('deal-cost');
    const profit = Math.max(amount - cost, 0);
    const profitEl = document.getElementById('deal-profit');

    if (profitEl) {
        profitEl.textContent = formatCurrency(profit);
    }
}

async function handleDealSubmit(event) {
    event.preventDefault();

    const category = document.getElementById('deal-category')?.value.trim() || '';
    const client = document.getElementById('deal-client')?.value.trim() || '';
    const amount = readMoneyInput('deal-amount');
    const cost = readMoneyInput('deal-cost');
    const notes = document.getElementById('deal-notes')?.value.trim() || '';
    const errorEl = document.getElementById('deal-error');
    const saveBtn = document.getElementById('deal-save');

    if (!category) {
        if (errorEl) errorEl.textContent = 'Choose a category.';
        document.getElementById('deal-category')?.focus();
        return;
    }

    if (!(amount > 0)) {
        if (errorEl) errorEl.textContent = 'Enter a booked amount greater than $0.';
        document.getElementById('deal-amount')?.focus();
        return;
    }

    if (cost < 0 || cost > amount) {
        if (errorEl) errorEl.textContent = 'Estimated cost must be between $0 and the booked amount.';
        document.getElementById('deal-cost')?.focus();
        return;
    }

    const profit = amount - cost;

    const payload = {
        action: 'addDeal',
        category,
        client,
        bookedAmount: amount,
        estimatedCost: cost,
        estimatedProfit: profit,
        paymentStatus: 'Not Paid',
        notes,
        mode: getModeLabel()
    };

    if (errorEl) errorEl.textContent = '';
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'SAVING...';
    }

    try {
        await postToApi(payload);

        state.xp += actionValues.deal.xp;
        state.rev += 1;
        state.bookedAmount += amount;
        state.estimatedProfit += profit;
        state.dealsBooked += 1;

        renderUI();
        animateXP();

        document.getElementById('deal-form')?.reset();
        updateProfitPreview();
        closeDealModal();

        console.log('Deal sent to Google Sheets.');
    } catch (error) {
        console.error('Could not send deal to Google Sheets:', error);
        if (errorEl) errorEl.textContent = 'Could not send the deal. Check your connection and try again.';
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = 'SAVE DEAL +20 XP';
        }
    }
}

async function postToApi(payload) {
    await fetch(API_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
            'Content-Type': 'text/plain;charset=utf-8'
        },
        body: JSON.stringify(payload),
        keepalive: true
    });
}

function getModeLabel() {
    return currentMode === 'travel' ? 'TRAVEL MODE' : 'FULL SALES MODE';
}

function readMoneyInput(id) {
    const raw = document.getElementById(id)?.value;
    if (raw === '' || raw === undefined || raw === null) return 0;

    const value = Number(raw);
    return Number.isFinite(value) ? value : 0;
}

function safeNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
}

function formatCurrency(value) {
    return new Intl.NumberFormat('en-CA', {
        style: 'currency',
        currency: 'CAD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(value);
}

function renderUI() {
    document.getElementById('xp-display').textContent = state.xp;

    updateProgressRow('contacts', state.contacts, targets.contacts);
    updateProgressRow('followups', state.followups, targets.followups);

    if (currentMode === 'sales') {
        updateProgressRow('rev', state.rev, targets.rev);
    }

    const bookedEl = document.getElementById('today-booked');
    const profitEl = document.getElementById('today-profit');
    const dealsEl = document.getElementById('today-deals');

    if (bookedEl) bookedEl.textContent = formatCurrency(state.bookedAmount);
    if (profitEl) profitEl.textContent = formatCurrency(state.estimatedProfit);
    if (dealsEl) dealsEl.textContent = state.dealsBooked;

    updateDailyScore();
}

function updateProgressRow(id, currentVal, targetVal) {
    const valEl = document.getElementById(`val-${id}`);
    const bar = document.getElementById(`bar-${id}`);
    const checkEl = document.getElementById(`check-${id}`);

    if (!valEl || !bar || !checkEl) return;

    valEl.textContent = currentVal;

    const percentage = targetVal > 0
        ? Math.min((currentVal / targetVal) * 100, 100)
        : 100;

    bar.style.width = `${percentage}%`;

    if (currentVal >= targetVal && targetVal > 0) {
        bar.classList.add('complete');
        checkEl.textContent = '✓';
    } else {
        bar.classList.remove('complete');
        checkEl.textContent = '';
    }
}

function updateDailyScore() {
    const missions = [
        { current: state.contacts, target: targets.contacts },
        { current: state.followups, target: targets.followups }
    ];

    if (targets.rev > 0) {
        missions.push({ current: state.rev, target: targets.rev });
    }

    const completed = missions.filter((mission) => mission.current >= mission.target).length;
    const total = missions.length;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

    const scoreText = document.getElementById('daily-score-text');
    const scoreBar = document.getElementById('daily-score-bar');
    const scoreBarBg = document.querySelector('.daily-score-bar-bg');

    if (scoreText) {
        scoreText.textContent = `${completed} / ${total} MISSIONS COMPLETE`;
    }

    if (scoreBar) {
        scoreBar.style.width = `${percentage}%`;
        scoreBar.classList.toggle('complete', completed === total && total > 0);
    }

    if (scoreBarBg) {
        scoreBarBg.setAttribute('aria-valuenow', String(percentage));
    }
}

document.addEventListener('DOMContentLoaded', init);
