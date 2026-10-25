import './style.css';
import { t } from './i18n/index.ts';
import { getState, setPath, subscribe, update } from './state/store.ts';
import { readInput } from './ui/fields.ts';
import { markActive, shell, topBadges, welcomeShell } from './ui/layout.ts';
import type { Route } from './ui/layout.ts';
import { openDisclaimer } from './ui/components/disclaimer.ts';
import { calculatorView } from './ui/views/calculator.ts';
import { dashboardView } from './ui/views/dashboard.ts';
import { goalsView } from './ui/views/goals.ts';
import { profileView } from './ui/views/profile.ts';
import { simulationView } from './ui/views/simulation.ts';
import { welcomeView } from './ui/views/welcome.ts';
import type { View } from './ui/views/view.ts';

const views: Record<Route, View> = {
  welcome: welcomeView,
  dashboard: dashboardView,
  calculator: calculatorView,
  simulation: simulationView,
  goals: goalsView,
  profile: profileView,
};

const app = document.getElementById('app')!;
let route: Route = 'dashboard';
let container: HTMLElement | null = null;

// ---------- rendering ----------
function parseRoute(): Route {
  const r = location.hash.replace(/^#\/?/, '').split('/')[0] as Route;
  return r in views ? r : 'dashboard';
}

function renderView(): void {
  const main = document.getElementById('main')!;
  // A fresh container per render, so listeners attached in mount() never pile up.
  container = document.createElement('div');
  container.innerHTML = views[route].render();
  main.replaceChildren(container);
  views[route].mount?.(container);
  markActive(route);
  document.title = `${t(`nav.${route}`)} · ${t('app.name')}`;
}

function renderAll(): void {
  document.documentElement.lang = getState().lang;
  app.innerHTML = route === 'welcome' ? welcomeShell() : shell();
  renderView();
}

subscribe((_, changed) => {
  if (changed === '*' || changed === 'lang') { renderAll(); return; }
  if (changed === 'disclaimerAccepted' || changed === 'onboarded') return;
  // Rank, Membership Free and points can change with any edit.
  document.getElementById('top-badges')?.replaceWith(document.createRange().createContextualFragment(topBadges()));
  if (container) views[route].update?.(container, changed);
});

window.addEventListener('hashchange', () => {
  const next = parseRoute();
  if (next === route && container) return;
  const shellChanges = (next === 'welcome') !== (route === 'welcome');
  route = next;
  if (shellChanges) renderAll();
  else renderView();
  window.scrollTo({ top: 0 });
  document.getElementById('main')?.focus({ preventScroll: true });
});

// ---------- bound inputs ----------
function onBound(e: Event): void {
  const el = e.target as HTMLInputElement | HTMLSelectElement;
  const path = el?.dataset?.path;
  if (!path) return;
  const isChangeOnly = el.dataset.kind === 'bool' || el.dataset.kind === 'select' || el.dataset.kind === 'selnum' || (el as HTMLInputElement).type === 'date';
  if (e.type === 'input' && isChangeOnly) return;
  if (e.type === 'change' && !isChangeOnly) return;
  setPath(path, readInput(el));
}
document.addEventListener('input', onBound);
document.addEventListener('change', onBound);

// ---------- global actions ----------
document.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  if (target.closest('[data-action="disclaimer"]')) { void openDisclaimer(); return; }
  const lang = target.closest<HTMLElement>('[data-set-lang]');
  if (lang) update((s) => { s.lang = lang.dataset.setLang as 'en' | 'es'; }, 'lang');
});

// ---------- start ----------
// First visit: set up the profile before anything else.
if (!getState().onboarded) history.replaceState(null, '', '#/welcome');
route = parseRoute();
renderAll();
if (!getState().disclaimerAccepted) void openDisclaimer(true);
