import { t } from '../i18n/index.ts';
import { getState } from '../state/store.ts';
import { esc, icon } from './dom.ts';
import { disclaimerButton } from './components/disclaimer.ts';

export type Route = 'dashboard' | 'calculator' | 'simulation' | 'goals' | 'scenarios' | 'profile';

export const NAV: { route: Route; icon: string }[] = [
  { route: 'dashboard', icon: 'dashboard' },
  { route: 'calculator', icon: 'calculator' },
  { route: 'simulation', icon: 'chart' },
  { route: 'goals', icon: 'target' },
  { route: 'scenarios', icon: 'layers' },
];

/** App mark: a wave inside a rounded square — no company logo. */
const mark = `<svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true">
  <rect width="32" height="32" rx="9" fill="var(--brand)"/>
  <path d="M6 19c3 0 3-4 6.5-4s3.5 4 7 4 3-3 6.5-3" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>
  <circle cx="22.5" cy="10.5" r="2.6" fill="var(--accent)"/>
</svg>`;

const themeIcon = { system: 'monitor', light: 'sun', dark: 'moon' } as const;

export function shell(): string {
  const s = getState();
  return `
  <a href="#main" class="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 btn btn-primary">Skip to content</a>
  <div class="min-h-dvh lg:grid lg:grid-cols-[252px_minmax(0,1fr)]">
    <div class="hidden lg:block border-r border-line bg-surface"><aside class="flex flex-col gap-6 sticky top-0 h-dvh px-4 py-5">
      <a href="#/dashboard" class="flex items-center gap-3 px-2">${mark}
        <span class="font-display font-bold leading-tight text-ink">${esc(t('app.name'))}</span></a>
      <nav aria-label="${esc(t('nav.main'))}" class="grid gap-1">
        ${[...NAV, { route: 'profile' as Route, icon: 'user' }].map((n) => `<a class="nav-link" data-route="${n.route}" href="#/${n.route}">${icon(n.icon, 19)}${esc(t(`nav.${n.route}`))}</a>`).join('')}
      </nav>
      <div class="mt-auto px-2 grid gap-3">
        <p class="hint">${esc(t('app.tagline'))}</p>
        <p class="text-[0.72rem] leading-snug text-muted">${esc(t('footer.unofficial'))}</p>
      </div>
    </aside></div>

    <div class="min-w-0 flex flex-col">
      <header class="sticky top-0 z-30 border-b border-line bg-[color-mix(in_srgb,var(--bg)_88%,transparent)] backdrop-blur">
        <div class="flex items-center gap-2 px-4 sm:px-6 lg:px-8 h-14">
          <a href="#/dashboard" class="lg:hidden flex items-center gap-2 min-w-0">${mark}<span class="hidden sm:inline font-display font-bold text-sm truncate">${esc(t('app.name'))}</span></a>
          <div class="ml-auto flex items-center gap-1.5 sm:gap-2">
            ${disclaimerButton()}
            <div class="seg !p-0.5" role="group" aria-label="${esc(t('top.language'))}">
              ${(['en', 'es'] as const).map((l) => `<button type="button" class="!min-h-7 !px-2 !text-xs" data-set-lang="${l}" aria-pressed="${s.lang === l}" lang="${l}">${l.toUpperCase()}</button>`).join('')}
            </div>
            <button type="button" class="btn btn-ghost icon-btn !min-h-9 !w-9" data-cycle-theme aria-label="${esc(t('top.theme'))}: ${esc(t(`theme.${s.theme}`))}" title="${esc(t('top.theme'))}: ${esc(t(`theme.${s.theme}`))}">${icon(themeIcon[s.theme], 18)}</button>
            <a href="#/profile" class="btn btn-ghost icon-btn !min-h-9 !w-9 lg:hidden" data-route="profile" aria-label="${esc(t('nav.profile'))}">${icon('user', 18)}</a>
          </div>
        </div>
      </header>
      <main id="main" tabindex="-1" class="flex-1 w-full max-w-[1320px] px-4 sm:px-6 lg:px-8 pt-6 pb-28 lg:pb-12 outline-none"></main>
      <footer class="lg:hidden px-4 pb-24 -mt-20 text-[0.72rem] text-muted">${esc(t('footer.unofficial'))}</footer>
    </div>

    <nav aria-label="${esc(t('nav.main'))}" class="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-surface border-t border-line flex" style="padding-bottom:env(safe-area-inset-bottom)">
      ${NAV.map((n) => `<a class="tab-link" data-route="${n.route}" href="#/${n.route}">${icon(n.icon, 21)}<span>${esc(t(`nav.${n.route}`))}</span></a>`).join('')}
    </nav>
  </div>`;
}

export function markActive(route: Route): void {
  document.querySelectorAll<HTMLElement>('[data-route]').forEach((a) => {
    if (a.dataset.route === route) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}
