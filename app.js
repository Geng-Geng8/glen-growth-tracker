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
    'contact':   { xp: 1, type: 'contacts' },
    'followup':  { xp: 1, type: 'followups' },
    'referral':  { xp: 3, type: 'rev' },
    'software':  { xp: 3, type: 'rev' },
    'dm-convo':  { xp: 5, type: 'rev' },
    'next-step': { xp: 5, type: 'rev' },
    'proposal':  { xp: 8, type: 'rev' },
    'deal':      { xp: 20, type: 'rev' }
};

function init() {
    setupDateAndMode();
    setupEventListeners();
    renderUI();
}

function setupDateAndMode() {
    const today = new Date();
    
    // Format Display
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('date-display').textContent = today.toLocaleDateString('en-US', options);

    // Calculate YYYYMMDD integer for safe, timezone-agnostic comparisons
    const year = today.getFullYear();
    const month = today.getMonth() + 1;
    const day = today.getDate();
    const dateNum = year * 10000 + month * 100 + day;

    const modeEl = document.getElementById('active-mode');
    const scheduleTravel = document.getElementById('schedule-travel');
    const scheduleSales = document.getElementById('schedule-sales');
    const revContainer = document.getElementById('progress-rev-container');

    // Sept 9, 2026 through Oct 3, 2026
    if (dateNum >= 20260909 && dateNum <= 20261003) {
        currentMode = 'travel';
        targets.contacts = 1;
        targets.followups = 1;
        targets.rev = 0;

        modeEl.textContent = 'TRAVEL MODE';
        modeEl.style.color = 'var(--electric-lime)';
        
        if (scheduleTravel) scheduleTravel.classList.add('active-schedule');
        if (revContainer) revContainer.style.display = 'none';
        
    } else {
        // Oct 4, 2026 onward (and gracefully handles dates before Sept 9 as well)
        currentMode = 'sales';
        targets.contacts = 3;
        targets.followups = 3;
        targets.rev = 1;

        modeEl.textContent = 'FULL SALES MODE';
        modeEl.style.color = 'var(--neon-green)';
        
        if (scheduleSales) scheduleSales.classList.add('active-schedule');
    }

    // Initialize HTML targets
    document.getElementById('target-contacts').textContent = targets.contacts;
    document.getElementById('target-followups').textContent = targets.followups;
    
    const targetRev = document.getElementById('target-rev');
    if (targetRev) targetRev.textContent = targets.rev;
}

function setupEventListeners() {
    document.querySelectorAll('.action-btn').forEach(btn => {
        btn.addEventListener('click', handleActionClick);
    });
}

function handleActionClick(e) {
    const btn = e.currentTarget;
    const actionKey = btn.getAttribute('data-action');
    const actionData = actionValues[actionKey];

    if (!actionData) return;

    // Update in-memory state
    state.xp += actionData.xp;
    state[actionData.type]++;

    renderUI();

    // Subtle button depression
    btn.style.transform = 'scale(0.94)';
    setTimeout(() => { btn.style.transform = 'scale(1)'; }, 120);

    // Subtle XP bump
    const xpEl = document.getElementById('xp-display');
    xpEl.classList.remove('bump');
    void xpEl.offsetWidth; // Trigger DOM reflow to restart CSS animation
    xpEl.classList.add('bump');
}

function renderUI() {
    document.getElementById('xp-display').textContent = state.xp;

    updateProgressRow('contacts', state.contacts, targets.contacts);
    updateProgressRow('followups', state.followups, targets.followups);
    
    if (currentMode === 'sales') {
        updateProgressRow('rev', state.rev, targets.rev);
    }
}

function updateProgressRow(id, currentVal, targetVal) {
    const valEl = document.getElementById(`val-${id}`);
    const bar = document.getElementById(`bar-${id}`);
    const checkEl = document.getElementById(`check-${id}`);
    
    if (!valEl || !bar || !checkEl) return;

    valEl.textContent = currentVal;
    
    // Scale progress percentage visually, capping at 100%
    let percentage = targetVal > 0 ? (currentVal / targetVal) * 100 : 100;
    if (percentage > 100) percentage = 100;
    
    bar.style.width = `${percentage}%`;

    // Completion feedback
    if (currentVal >= targetVal && targetVal > 0) {
        bar.classList.add('complete');
        checkEl.textContent = '✓';
    } else {
        bar.classList.remove('complete');
        checkEl.textContent = '';
    }
}

// Bootstrap application on load
document.addEventListener('DOMContentLoaded', init);
