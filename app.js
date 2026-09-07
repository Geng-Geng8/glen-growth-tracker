const API_URL = 'https://script.google.com/macros/s/AKfycbzI02niw2iGEJKqOw6hfCjY0tRUhPpDZ5xQ64jd5lqGIhuybSnmm-oPWorHfuy7BkYV/exec';

const state = {
    xp: 0,
    contacts: 0,
    followups: 0,
    rev: 0
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
    renderUI();
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

    state.xp += actionData.xp;
    state[actionData.type] += 1;

    renderUI();

    btn.style.transform = 'scale(0.94)';
    setTimeout(() => {
        btn.style.transform = 'scale(1)';
    }, 120);

    const xpEl = document.getElementById('xp-display');
    xpEl.classList.remove('bump');
    void xpEl.offsetWidth;
    xpEl.classList.add('bump');

    if (actionData.persist) {
        sendAction(actionData);
    }
}

async function sendAction(actionData) {
    const payload = {
        action: 'addAction',
        actionType: actionData.actionType,
        count: 1,
        xp: actionData.xp,
        mode: currentMode === 'travel' ? 'TRAVEL MODE' : 'FULL SALES MODE',
        notes: 'Glen Growth web app'
    };

    try {
        // Google Apps Script web apps do not expose a browser-readable CORS response.
        // no-cors allows the POST to reach Apps Script while keeping the UI responsive.
        await fetch(API_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: {
                'Content-Type': 'text/plain;charset=utf-8'
            },
            body: JSON.stringify(payload),
            keepalive: true
        });

        console.log(`${actionData.actionType} sent to Google Sheets.`);
    } catch (error) {
        console.error(`Could not send ${actionData.actionType} to Google Sheets:`, error);
    }
}

function renderUI() {
    document.getElementById('xp-display').textContent = state.xp;

    updateProgressRow('contacts', state.contacts, targets.contacts);
    updateProgressRow('followups', state.followups, targets.followups);

    if (currentMode === 'sales') {
        updateProgressRow('rev', state.rev, targets.rev);
    }

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
