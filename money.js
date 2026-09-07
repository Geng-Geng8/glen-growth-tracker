(function () {
    const style = document.createElement('style');
    style.textContent = `
        .view-tabs { grid-template-columns: repeat(3, minmax(0, 1fr)); }

        .money-hero,
        .money-panel {
            margin-bottom: 18px;
            padding: 20px;
            border: 1px solid #2a2a2a;
            border-radius: 16px;
            background: #121212;
        }

        .money-hero-top,
        .money-panel-head,
        .money-goal-head,
        .money-category-head {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 12px;
        }

        .money-kicker,
        .money-panel-title {
            color: #999;
            font-size: 0.72rem;
            font-weight: 900;
            letter-spacing: 1.3px;
        }

        #money-year {
            margin-top: 5px;
            font-size: 1.2rem;
            font-weight: 900;
        }

        #money-sync-status {
            color: #999;
            font-size: 0.72rem;
            font-weight: 800;
            text-align: right;
        }

        .money-summary-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 10px;
            margin-top: 18px;
        }

        .money-stat {
            padding: 14px;
            border: 1px solid #2a2a2a;
            border-radius: 12px;
            background: #080808;
        }

        .money-stat.primary {
            border-color: rgba(204, 255, 0, 0.3);
            background: rgba(204, 255, 0, 0.05);
        }

        .money-stat-label {
            display: block;
            margin-bottom: 6px;
            color: #999;
            font-size: 0.67rem;
            font-weight: 800;
            letter-spacing: 0.6px;
            text-transform: uppercase;
        }

        .money-stat-value {
            display: block;
            font-size: 1.15rem;
            font-weight: 900;
            line-height: 1.1;
            overflow-wrap: anywhere;
        }

        .money-stat.primary .money-stat-value {
            color: #ccff00;
        }

        .money-panel-title {
            margin-bottom: 18px;
        }

        .money-goal,
        .money-category {
            margin-bottom: 18px;
        }

        .money-goal:last-child,
        .money-category:last-child {
            margin-bottom: 0;
        }

        .money-goal-head,
        .money-category-head {
            margin-bottom: 8px;
            align-items: center;
        }

        .money-goal-name,
        .money-category-name {
            min-width: 0;
            font-size: 0.84rem;
            font-weight: 800;
        }

        .money-goal-value,
        .money-category-value {
            flex-shrink: 0;
            color: #999;
            font-size: 0.78rem;
            font-weight: 800;
            text-align: right;
        }

        .money-goal-bar-bg {
            height: 11px;
            overflow: hidden;
            border-radius: 999px;
            background: #000;
        }

        .money-goal-bar-fill {
            width: 0;
            height: 100%;
            border-radius: 999px;
            background: #ccff00;
            transition: width 0.3s ease;
        }

        .money-goal-bar-fill.complete {
            background: #39ff14;
        }

        .money-category-meta {
            margin-top: 4px;
            color: #777;
            font-size: 0.72rem;
            line-height: 1.4;
        }

        .money-empty {
            color: #999;
            font-size: 0.85rem;
            line-height: 1.5;
        }

        @media (max-width: 340px) {
            .money-summary-grid { grid-template-columns: 1fr; }
            .money-hero-top { flex-direction: column; }
            #money-sync-status { text-align: left; }
        }
    `;
    document.head.appendChild(style);

    const nav = document.querySelector('.view-tabs');
    if (nav && !nav.querySelector('[data-view="money"]')) {
        const button = document.createElement('button');
        button.className = 'view-tab';
        button.setAttribute('data-view', 'money');
        button.setAttribute('type', 'button');
        button.textContent = 'MONEY';
        nav.appendChild(button);
    }

    const main = document.querySelector('.app-container');
    if (main && !document.getElementById('money-view')) {
        const section = document.createElement('section');
        section.id = 'money-view';
        section.className = 'app-view';
        section.setAttribute('aria-label', 'Year-to-date money progress');
        section.innerHTML = `
            <section class="money-hero">
                <div class="money-hero-top">
                    <div>
                        <div class="money-kicker">YEAR TO DATE</div>
                        <div id="money-year">2026 MONEY</div>
                    </div>
                    <div id="money-sync-status">OPEN MONEY TO SYNC</div>
                </div>

                <div class="money-summary-grid">
                    <div class="money-stat">
                        <span class="money-stat-label">Booked Revenue</span>
                        <strong class="money-stat-value" id="money-booked">$0.00</strong>
                    </div>
                    <div class="money-stat">
                        <span class="money-stat-label">Collected</span>
                        <strong class="money-stat-value" id="money-collected">$0.00</strong>
                    </div>
                    <div class="money-stat primary">
                        <span class="money-stat-label">Estimated Profit</span>
                        <strong class="money-stat-value" id="money-profit">$0.00</strong>
                    </div>
                    <div class="money-stat">
                        <span class="money-stat-label">Still Unpaid</span>
                        <strong class="money-stat-value" id="money-unpaid">$0.00</strong>
                    </div>
                    <div class="money-stat">
                        <span class="money-stat-label">Deals Booked</span>
                        <strong class="money-stat-value" id="money-deals">0</strong>
                    </div>
                </div>
            </section>

            <section class="money-panel">
                <div class="money-panel-title">PROFIT GOALS</div>
                <div id="money-goals">
                    <p class="money-empty">Open Money to load your profit goals.</p>
                </div>
            </section>

            <section class="money-panel">
                <div class="money-panel-title">BY CATEGORY</div>
                <div id="money-categories">
                    <p class="money-empty">No deal data loaded yet.</p>
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
        money: document.getElementById('money-view')
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

    if (selected === 'week') {
        loadWeekState();
    }

    if (selected === 'money') {
        loadMoneyState();
    }
}

async function loadMoneyState() {
    setMoneySyncStatus('SYNCING...');

    try {
        const data = await jsonpRequest({ action: 'getMoney' });

        if (!data || data.ok !== true) {
            throw new Error(data?.error || 'Could not load money data');
        }

        renderMoney(data);
        setMoneySyncStatus('SHEET SYNCED');
    } catch (error) {
        console.error('Could not restore money data from Google Sheets:', error);
        setMoneySyncStatus('MONEY SYNC FAILED');
    }
}

function setMoneySyncStatus(text) {
    const element = document.getElementById('money-sync-status');
    if (element) element.textContent = text;
}

function renderMoney(data) {
    const year = safeNumber(data.year) || new Date().getFullYear();
    setText('money-year', `${year} MONEY`);
    setText('money-booked', formatCurrency(safeNumber(data.bookedRevenue)));
    setText('money-collected', formatCurrency(safeNumber(data.collectedRevenue)));
    setText('money-profit', formatCurrency(safeNumber(data.estimatedProfit)));
    setText('money-unpaid', formatCurrency(safeNumber(data.unpaidRevenue)));
    setText('money-deals', safeNumber(data.dealsBooked));

    renderMoneyGoals(Array.isArray(data.goals) ? data.goals : []);
    renderMoneyCategories(Array.isArray(data.categories) ? data.categories : []);
}

function renderMoneyGoals(goals) {
    const container = document.getElementById('money-goals');
    if (!container) return;

    container.replaceChildren();

    if (!goals.length) {
        const empty = document.createElement('p');
        empty.className = 'money-empty';
        empty.textContent = 'No profit goals were returned from Settings.';
        container.appendChild(empty);
        return;
    }

    goals.forEach((goal) => {
        const current = safeNumber(goal.current);
        const target = safeNumber(goal.target);
        const percentage = target > 0 ? Math.min((current / target) * 100, 100) : 0;
        const complete = target > 0 && current >= target;

        const row = document.createElement('div');
        row.className = 'money-goal';

        const head = document.createElement('div');
        head.className = 'money-goal-head';

        const name = document.createElement('span');
        name.className = 'money-goal-name';
        name.textContent = String(goal.label || 'Profit Goal');

        const value = document.createElement('span');
        value.className = 'money-goal-value';
        value.textContent = `${formatCurrency(current)} / ${formatCurrency(target)}${complete ? ' ✓' : ''}`;

        const barBg = document.createElement('div');
        barBg.className = 'money-goal-bar-bg';

        const bar = document.createElement('div');
        bar.className = `money-goal-bar-fill${complete ? ' complete' : ''}`;
        bar.style.width = `${percentage}%`;

        head.append(name, value);
        barBg.appendChild(bar);
        row.append(head, barBg);
        container.appendChild(row);
    });
}

function renderMoneyCategories(categories) {
    const container = document.getElementById('money-categories');
    if (!container) return;

    container.replaceChildren();

    if (!categories.length) {
        const empty = document.createElement('p');
        empty.className = 'money-empty';
        empty.textContent = 'No deals booked this year yet.';
        container.appendChild(empty);
        return;
    }

    categories.forEach((category) => {
        const row = document.createElement('div');
        row.className = 'money-category';

        const head = document.createElement('div');
        head.className = 'money-category-head';

        const name = document.createElement('span');
        name.className = 'money-category-name';
        name.textContent = String(category.name || 'Other');

        const value = document.createElement('span');
        value.className = 'money-category-value';
        value.textContent = formatCurrency(safeNumber(category.bookedRevenue));

        const meta = document.createElement('div');
        meta.className = 'money-category-meta';
        meta.textContent = `${safeNumber(category.deals)} deal${safeNumber(category.deals) === 1 ? '' : 's'} · Est. profit ${formatCurrency(safeNumber(category.estimatedProfit))}`;

        head.append(name, value);
        row.append(head, meta);
        container.appendChild(row);
    });
}

function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
}
