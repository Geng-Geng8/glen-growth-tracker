(function () {
    const style = document.createElement('style');
    style.textContent = `
        .view-tabs { grid-template-columns: repeat(4, minmax(0, 1fr)); }
        .view-tab { font-size: 0.76rem; letter-spacing: 0.35px; padding: 0 5px; }

        .wins-hero,
        .wins-panel {
            margin-bottom: 18px;
            padding: 20px;
            border: 1px solid #2a2a2a;
            border-radius: 16px;
            background: #121212;
        }

        .wins-hero-top,
        .wins-card-head,
        .wins-feed-head {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 12px;
        }

        .wins-kicker,
        .wins-panel-title {
            color: #999;
            font-size: 0.72rem;
            font-weight: 900;
            letter-spacing: 1.3px;
        }

        #wins-title {
            margin-top: 5px;
            font-size: 1.25rem;
            font-weight: 900;
        }

        #wins-sync-status {
            color: #999;
            font-size: 0.72rem;
            font-weight: 800;
            text-align: right;
        }

        .wins-summary-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 10px;
            margin-top: 18px;
        }

        .wins-stat {
            min-width: 0;
            padding: 14px;
            border: 1px solid #2a2a2a;
            border-radius: 12px;
            background: #080808;
        }

        .wins-stat.primary {
            border-color: rgba(57, 255, 20, 0.28);
            background: rgba(57, 255, 20, 0.05);
        }

        .wins-stat-label {
            display: block;
            margin-bottom: 6px;
            color: #999;
            font-size: 0.65rem;
            font-weight: 800;
            letter-spacing: 0.55px;
            text-transform: uppercase;
        }

        .wins-stat-value {
            display: block;
            font-size: 1.05rem;
            font-weight: 900;
            line-height: 1.15;
            overflow-wrap: anywhere;
        }

        .wins-stat.primary .wins-stat-value { color: #39ff14; }

        .wins-panel-title { margin-bottom: 18px; }

        .win-card {
            margin-bottom: 12px;
            padding: 16px;
            border: 1px solid #2a2a2a;
            border-radius: 14px;
            background: #080808;
        }

        .win-card:last-child { margin-bottom: 0; }

        .win-card.paid {
            border-color: rgba(57, 255, 20, 0.24);
        }

        .win-card-client {
            min-width: 0;
            font-size: 0.95rem;
            font-weight: 900;
            line-height: 1.2;
            overflow-wrap: anywhere;
        }

        .win-card-amount {
            flex-shrink: 0;
            color: #ccff00;
            font-size: 1rem;
            font-weight: 900;
            text-align: right;
        }

        .win-card-meta {
            margin-top: 7px;
            color: #999;
            font-size: 0.75rem;
            font-weight: 700;
            line-height: 1.45;
        }

        .win-card-bottom {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 10px;
            margin-top: 12px;
        }

        .win-profit {
            color: #999;
            font-size: 0.75rem;
            font-weight: 800;
        }

        .win-status {
            flex-shrink: 0;
            padding: 5px 8px;
            border: 1px solid #333;
            border-radius: 999px;
            color: #aaa;
            font-size: 0.66rem;
            font-weight: 900;
            text-transform: uppercase;
        }

        .win-status.paid {
            border-color: rgba(57, 255, 20, 0.32);
            color: #39ff14;
            background: rgba(57, 255, 20, 0.06);
        }

        .wins-empty {
            color: #999;
            font-size: 0.85rem;
            line-height: 1.5;
        }

        @media (max-width: 340px) {
            .view-tab { font-size: 0.67rem; letter-spacing: 0; padding: 0 2px; }
            .wins-summary-grid { grid-template-columns: 1fr; }
            .wins-hero-top { flex-direction: column; }
            #wins-sync-status { text-align: left; }
            .wins-card-head { align-items: flex-start; }
        }
    `;
    document.head.appendChild(style);

    const nav = document.querySelector('.view-tabs');
    if (nav && !nav.querySelector('[data-view="wins"]')) {
        const button = document.createElement('button');
        button.className = 'view-tab';
        button.setAttribute('data-view', 'wins');
        button.setAttribute('type', 'button');
        button.textContent = 'WINS';
        nav.appendChild(button);
    }

    const main = document.querySelector('.app-container');
    if (main && !document.getElementById('wins-view')) {
        const section = document.createElement('section');
        section.id = 'wins-view';
        section.className = 'app-view';
        section.setAttribute('aria-label', 'Booked deal wins');
        section.innerHTML = `
            <section class="wins-hero">
                <div class="wins-hero-top">
                    <div>
                        <div class="wins-kicker">CLOSED BUSINESS</div>
                        <div id="wins-title">YOUR WINS</div>
                    </div>
                    <div id="wins-sync-status">OPEN WINS TO SYNC</div>
                </div>

                <div class="wins-summary-grid">
                    <div class="wins-stat primary">
                        <span class="wins-stat-label">Total Wins</span>
                        <strong class="wins-stat-value" id="wins-total">0</strong>
                    </div>
                    <div class="wins-stat">
                        <span class="wins-stat-label">Booked Value</span>
                        <strong class="wins-stat-value" id="wins-value">$0.00</strong>
                    </div>
                    <div class="wins-stat">
                        <span class="wins-stat-label">Largest Deal</span>
                        <strong class="wins-stat-value" id="wins-largest">$0.00</strong>
                    </div>
                    <div class="wins-stat">
                        <span class="wins-stat-label">Most Recent Win</span>
                        <strong class="wins-stat-value" id="wins-recent">—</strong>
                    </div>
                </div>
            </section>

            <section class="wins-panel">
                <div class="wins-panel-title">WIN HISTORY</div>
                <div id="wins-feed">
                    <p class="wins-empty">Open Wins to load your booked deals.</p>
                </div>
            </section>
        `;
        main.appendChild(section);
    }
})();

function showView(view) {
    const views = {
        today: document.getElementById('today-view'),
        week: document.getElementById('week-view'),
        money: document.getElementById('money-view'),
        wins: document.getElementById('wins-view')
    };

    const selected = Object.prototype.hasOwnProperty.call(views, view) ? view : 'today';

    Object.entries(views).forEach(([name, element]) => {
        element?.classList.toggle('active', name === selected);
    });

    document.querySelectorAll('.view-tab').forEach((button) => {
        const active = button.getAttribute('data-view') === selected;
        button.classList.toggle('active', active);
        button.setAttribute('aria-selected', active ? 'true' : 'false');
    });

    if (selected === 'week') loadWeekState();
    if (selected === 'money') loadMoneyState();
    if (selected === 'wins') loadWinsState();
}

async function loadWinsState() {
    setWinsSyncStatus('SYNCING...');

    try {
        const data = await jsonpRequest({ action: 'getWins' });

        if (!data || data.ok !== true) {
            throw new Error(data?.error || 'Could not load wins data');
        }

        renderWins(data);
        setWinsSyncStatus('SHEET SYNCED');
    } catch (error) {
        console.error('Could not restore wins from Google Sheets:', error);
        setWinsSyncStatus('WINS SYNC FAILED');
    }
}

function setWinsSyncStatus(text) {
    const element = document.getElementById('wins-sync-status');
    if (element) element.textContent = text;
}

function renderWins(data) {
    const wins = Array.isArray(data.wins) ? data.wins : [];

    setWinsText('wins-total', safeNumber(data.totalWins));
    setWinsText('wins-value', formatCurrency(safeNumber(data.bookedValue)));
    setWinsText('wins-largest', formatCurrency(safeNumber(data.largestDeal)));
    setWinsText('wins-recent', data.mostRecentDate ? formatWinDate(data.mostRecentDate) : '—');

    renderWinsFeed(wins);
}

function renderWinsFeed(wins) {
    const container = document.getElementById('wins-feed');
    if (!container) return;

    container.replaceChildren();

    if (!wins.length) {
        const empty = document.createElement('p');
        empty.className = 'wins-empty';
        empty.textContent = 'No booked deals yet. Your first closed deal will appear here.';
        container.appendChild(empty);
        return;
    }

    wins.forEach((win) => {
        const paid = isPaidWin(win.paymentStatus);
        const card = document.createElement('article');
        card.className = `win-card${paid ? ' paid' : ''}`;

        const head = document.createElement('div');
        head.className = 'wins-card-head';

        const client = document.createElement('div');
        client.className = 'win-card-client';
        client.textContent = String(win.client || 'Unnamed Client');

        const amount = document.createElement('div');
        amount.className = 'win-card-amount';
        amount.textContent = formatCurrency(safeNumber(win.bookedAmount));

        head.append(client, amount);

        const meta = document.createElement('div');
        meta.className = 'win-card-meta';
        meta.textContent = `${formatWinDate(win.dateBooked)} · ${String(win.category || 'Other')}`;

        const bottom = document.createElement('div');
        bottom.className = 'win-card-bottom';

        const profit = document.createElement('div');
        profit.className = 'win-profit';
        profit.textContent = `Est. profit ${formatCurrency(safeNumber(win.estimatedProfit))}`;

        const status = document.createElement('div');
        status.className = `win-status${paid ? ' paid' : ''}`;
        status.textContent = String(win.paymentStatus || 'Not Paid');

        bottom.append(profit, status);
        card.append(head, meta, bottom);
        container.appendChild(card);
    });
}

function formatWinDate(value) {
    const date = parseDateKey(value);
    if (!date) return String(value || '—');

    return date.toLocaleDateString('en-CA', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
}

function isPaidWin(value) {
    const status = String(value || '').trim().toLowerCase();
    return ['paid', 'paid in full', 'collected', 'received', 'payment collected'].includes(status);
}

function setWinsText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
}

(function loadStreakModule() {
    const script = document.createElement('script');
    script.src = 'streak.js?v=20260907-2';
    document.body.appendChild(script);
})();
