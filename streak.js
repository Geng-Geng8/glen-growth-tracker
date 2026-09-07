(function () {
    const countEl = document.getElementById('streak-count');
    if (countEl) countEl.textContent = '—';

    const weekMeta = document.querySelector('.week-meta');
    if (weekMeta && !document.getElementById('best-streak')) {
        const best = document.createElement('span');
        best.id = 'best-streak';
        best.textContent = 'BEST STREAK: —';

        const sync = document.getElementById('week-sync-status');
        if (sync) {
            weekMeta.insertBefore(best, sync);
        } else {
            weekMeta.appendChild(best);
        }
    }

    document.addEventListener('DOMContentLoaded', loadStreakState);

    document.addEventListener('click', (event) => {
        const button = event.target.closest('.action-btn');
        if (!button) return;

        const action = button.getAttribute('data-action');
        if (action === 'deal') return;

        window.setTimeout(loadStreakState, 2200);
    });

    const dealForm = document.getElementById('deal-form');
    dealForm?.addEventListener('submit', () => {
        window.setTimeout(loadStreakState, 2600);
    });
})();

async function loadStreakState() {
    try {
        const data = await jsonpRequest({ action: 'getStreak' });

        if (!data || data.ok !== true) {
            throw new Error(data?.error || 'Could not load streak data');
        }

        renderStreak(data);
    } catch (error) {
        console.error('Could not restore streak from Google Sheets:', error);
    }
}

function renderStreak(data) {
    const current = safeNumber(data.currentStreak);
    const best = safeNumber(data.bestStreak);

    const count = document.getElementById('streak-count');
    if (count) count.textContent = current;

    const bestEl = document.getElementById('best-streak');
    if (bestEl) {
        bestEl.textContent = `BEST STREAK: ${best} ${best === 1 ? 'DAY' : 'DAYS'}`;
    }

    const badge = document.querySelector('.streak-badge');
    if (badge) {
        badge.setAttribute(
            'title',
            `Current streak: ${current} ${current === 1 ? 'workday' : 'workdays'}. Best streak: ${best}. Weekends do not break the streak.`
        );
    }
}
