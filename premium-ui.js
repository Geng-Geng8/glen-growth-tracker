(function GlenGrowthPremiumUI() {
    const root = document.documentElement;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const SURFACE_SELECTOR = [
        '.status-panel',
        '.daily-score-panel',
        '.progress-panel',
        '.week-hero',
        '.week-score-panel',
        '.week-metrics-panel',
        '.money-hero',
        '.money-panel',
        '.money-stat',
        '.wins-hero',
        '.wins-panel',
        '.wins-stat',
        '.win-card',
        '.action-btn',
        '.pwa-status-bar'
    ].join(',');

    root.classList.add('premium-ui');
    setThemeChrome();
    ensureFavicon();

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }

    function init() {
        installBrandStyles();
        bindPointerGlow();
        bindActionFeedback();
        bindViewMotion();
        observeXp();
        stampBuildLabel();
    }

    function setThemeChrome() {
        let meta = document.querySelector('meta[name="theme-color"]');
        if (!meta) {
            meta = document.createElement('meta');
            meta.name = 'theme-color';
            document.head.appendChild(meta);
        }
        meta.content = '#080908';
    }

    function ensureFavicon() {
        let icon = document.querySelector('link[rel="icon"]');
        if (!icon) {
            icon = document.createElement('link');
            icon.rel = 'icon';
            document.head.appendChild(icon);
        }
        icon.type = 'image/jpeg';
        icon.href = './GGIcon.jpeg?v=20260907-premium2';
    }

    function installBrandStyles() {
        if (document.getElementById('glen-growth-brand-styles')) return;

        const style = document.createElement('style');
        style.id = 'glen-growth-brand-styles';
        style.textContent = `
            .app-brand {
                min-width: 0;
                display: inline-flex;
                align-items: center;
                gap: 10px;
            }

            .app-brand-icon {
                width: 30px;
                height: 30px;
                flex: 0 0 30px;
                display: block;
                object-fit: cover;
                border-radius: 9px;
                border: 1px solid rgba(255,255,255,0.11);
                box-shadow:
                    0 0 0 1px rgba(202,255,0,0.035),
                    0 6px 18px rgba(0,0,0,0.34),
                    0 0 18px rgba(202,255,0,0.055);
                transition:
                    transform 220ms cubic-bezier(0.22, 1, 0.36, 1),
                    box-shadow 220ms ease;
            }

            @media (hover: hover) and (pointer: fine) {
                .app-brand:hover .app-brand-icon {
                    transform: translateY(-1px) scale(1.035);
                    box-shadow:
                        0 0 0 1px rgba(202,255,0,0.11),
                        0 8px 22px rgba(0,0,0,0.38),
                        0 0 22px rgba(202,255,0,0.09);
                }
            }

            @media (max-width: 340px) {
                .app-brand { gap: 8px; }
                .app-brand-icon {
                    width: 27px;
                    height: 27px;
                    flex-basis: 27px;
                    border-radius: 8px;
                }
            }
        `;
        document.head.appendChild(style);
    }

    function bindPointerGlow() {
        if (reduceMotion || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

        document.addEventListener('pointermove', (event) => {
            const surface = event.target.closest(SURFACE_SELECTOR);
            if (!surface) return;

            const rect = surface.getBoundingClientRect();
            surface.style.setProperty('--pointer-x', `${event.clientX - rect.left}px`);
            surface.style.setProperty('--pointer-y', `${event.clientY - rect.top}px`);
            surface.classList.add('premium-pointer');
        });

        document.addEventListener('pointerout', (event) => {
            const surface = event.target.closest(SURFACE_SELECTOR);
            if (!surface || surface.contains(event.relatedTarget)) return;
            surface.classList.remove('premium-pointer');
        });
    }

    function bindActionFeedback() {
        document.addEventListener('click', (event) => {
            const button = event.target.closest('.action-btn, .win-mark-paid, .deal-save-btn, .view-tab');
            if (!button) return;

            if (!reduceMotion) {
                button.classList.remove('premium-pressed');
                void button.offsetWidth;
                button.classList.add('premium-pressed');
                window.setTimeout(() => button.classList.remove('premium-pressed'), 260);
            }

            if (button.classList.contains('action-btn') && button.dataset.action !== 'deal') {
                const xp = button.querySelector('.btn-xp')?.textContent?.trim();
                if (xp) showXpFloat(button, xp);
            }
        });
    }

    function showXpFloat(button, text) {
        if (reduceMotion) return;

        const rect = button.getBoundingClientRect();
        const float = document.createElement('span');
        float.className = 'premium-xp-float';
        float.textContent = text;
        float.style.left = `${rect.left + rect.width / 2}px`;
        float.style.top = `${Math.max(12, rect.top + 6)}px`;
        document.body.appendChild(float);
        window.setTimeout(() => float.remove(), 900);
    }

    function bindViewMotion() {
        document.addEventListener('click', (event) => {
            const tab = event.target.closest('.view-tab');
            if (!tab || reduceMotion) return;

            const view = document.getElementById(`${tab.dataset.view}-view`);
            if (!view) return;

            window.requestAnimationFrame(() => {
                view.classList.remove('premium-view-enter');
                void view.offsetWidth;
                view.classList.add('premium-view-enter');
                window.setTimeout(() => view.classList.remove('premium-view-enter'), 360);
            });
        });
    }

    function observeXp() {
        const value = document.getElementById('xp-display');
        if (!value || reduceMotion) return;

        const observer = new MutationObserver(() => {
            value.classList.remove('premium-number-pop');
            void value.offsetWidth;
            value.classList.add('premium-number-pop');
            window.setTimeout(() => value.classList.remove('premium-number-pop'), 420);
        });

        observer.observe(value, { childList: true, characterData: true, subtree: true });
    }

    function stampBuildLabel() {
        const updateBuild = () => {
            const buildCard = Array.from(document.querySelectorAll('.system-health-card')).find((card) =>
                card.querySelector('.system-health-label')?.textContent?.trim() === 'App Build'
            );
            const value = buildCard?.querySelector('.system-health-value');
            if (value) value.textContent = '2026.09.07-premium2';
        };

        updateBuild();
        window.setTimeout(updateBuild, 600);
        window.setTimeout(updateBuild, 1600);
    }
})();
