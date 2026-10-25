import { MEMBERSHIP_POINTS, PLAN_PRICES } from '../../config/plan.ts';
import type { MemberPlan } from '../../config/plan.ts';
import { money, num, t } from '../../i18n/index.ts';
import { estimatedRewardPoints, getState, update } from '../../state/store.ts';
import { esc, icon } from '../dom.ts';
import { dateField } from '../fields.ts';
import type { View } from './view.ts';

/**
 * The stored memberPlan always has a value, so on the first setup no card shows as
 * selected until one is clicked. Re-running the setup later shows the saved choice.
 */
let planPicked = false;

/** Shown most-featured first, as people usually compare them. */
export const PLAN_ORDER: MemberPlan[] = ['premium', 'classic', 'starter'];

type Role = 'member' | 'partner';
const SINCE_PATH: Record<Role, string> = { member: 'profile.memberSince', partner: 'profile.partnerSince' };

/** Badge icons, drawn in white on the badge color (64×64). */
const roleIcon = {
  // Suitcase with a globe in front of it
  member: `<rect x="7" y="19" width="28" height="33" rx="5"/><path d="M15 19v-6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v6"/>
    <path d="M15 27v17M27 27v17"/><circle cx="13" cy="55.5" r="2.5"/><circle cx="29" cy="55.5" r="2.5"/>
    <circle cx="44" cy="38" r="14" fill="var(--badge)"/><ellipse cx="44" cy="38" rx="6" ry="14"/><path d="M30 38h28M32 31h24M32 45h24"/>`,
  // Rising bars with an arrow and a stack of coins
  partner: `<path d="M8 54h48"/><rect x="10" y="40" width="7" height="14" rx="1.5"/><rect x="21" y="33" width="7" height="21" rx="1.5"/><rect x="32" y="25" width="7" height="29" rx="1.5"/>
    <path d="M9 32 23 21l7 5 16-14"/><path d="M39 11h8v8"/>
    <ellipse cx="51" cy="50" rx="7" ry="2.6"/><path d="M44 50v-4.5M58 50v-4.5"/><ellipse cx="51" cy="45.5" rx="7" ry="2.6"/><path d="M44 45.5V41M58 45.5V41"/><ellipse cx="51" cy="41" rx="7" ry="2.6" fill="var(--badge)"/>`,
};

/**
 * Member / Partner tile. When selected, a "since" date field opens below it.
 * `compact` is the smaller version used in Profile & settings.
 */
export function roleBlock(role: Role, on: boolean, compact = false): string {
  return `<div class="role-block${compact ? ' compact' : ''}" data-block="${role}" data-on="${on}">
    <button type="button" class="role-tile${compact ? ' compact' : ''}" data-role="${role}" aria-pressed="${on}">
      <span class="role-check" aria-hidden="true">${icon('check', 18)}</span>
      <span class="role-badge" aria-hidden="true"><svg viewBox="0 0 64 64" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">${roleIcon[role]}</svg></span>
      <span class="role-text">
        <span class="role-title font-display font-extrabold uppercase leading-none">${esc(t(`welcome.${role}`))}</span>
        <span class="text-ink-2 leading-snug max-w-[34ch]">${esc(t(`welcome.${role}Text`))}</span>
        <span class="pill pill-muted !text-[0.85rem] !px-3 !py-1">${esc(t(`welcome.${role}Cost`))}</span>
      </span>
    </button>
    ${on ? `<div class="role-extra">${dateField(t(`prof.${role}Since`), SINCE_PATH[role], t(`prof.${role}SinceHint`))}</div>` : ''}
  </div>`;
}

/** Membership card. `compact` is a one-row version for the Profile's narrower column. */
export function planCard(plan: MemberPlan, selected: boolean, compact = false): string {
  const first = PLAN_PRICES.activation[plan];
  const perMonth = PLAN_PRICES.monthly[plan];
  const pts = MEMBERSHIP_POINTS[plan];
  const value = (n: number, points: number) => `<span class="text-right whitespace-nowrap">
    <span class="font-display text-xl font-bold num">${money(n)}</span><span class="text-muted"> / </span><span class="font-display text-xl font-bold num plan-name">${num(points)} RP</span></span>`;
  const art = `<span class="plan-art" aria-hidden="true">
      <svg viewBox="0 0 32 20" width="34" height="21"><path d="M3 13c3 0 3-4 6.5-4s3.5 4 7 4 3-3 6.5-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      <span class="plan-chip"></span>
    </span>`;
  const rows = `<span class="plan-rows">
      <span class="plan-row"><span class="plan-row-ic">${icon('arrow', 14)}</span><span>${esc(t('welcome.firstPayment'))}</span>${value(first, pts.firstPayment)}</span>
      <span class="plan-row"><span class="plan-row-ic">${icon('layers', 14)}</span><span>${esc(t('welcome.monthly'))}</span>${value(perMonth, perMonth * pts.perMonthlyDollar)}</span>
    </span>`;
  const name = `<span class="plan-title font-display font-extrabold uppercase leading-none plan-name">${esc(t(`plans.${plan}`))}</span>`;
  const price = `<span class="plan-price"><span class="num">${money(perMonth)}</span><span class="text-base font-semibold text-ink-2"> ${esc(t('welcome.perMonth'))}</span></span>`;

  if (compact) {
    return `<button type="button" class="plan-card compact" data-plan="${plan}" role="radio" aria-checked="${selected}">
      <span class="role-check" aria-hidden="true">${icon('check', 16)}</span>
      <span class="plan-head">${art}<span class="grid gap-1.5">${name}${price}</span></span>
      ${rows}
    </button>`;
  }
  return `<button type="button" class="plan-card" data-plan="${plan}" role="radio" aria-checked="${selected}">
    ${name}${art}${price}${rows}
    <span class="plan-band">${selected ? `${icon('check', 16)} ${esc(t('welcome.selected'))}` : esc(t('welcome.choose'))}</span>
  </button>`;
}

/** Rough Reward Points collected so far, from the membership plan and the Member-since date. */
export function pointsBox(): string {
  const s = getState();
  if (!s.profile.isMember) return '<div id="rp-box"></div>';
  const est = estimatedRewardPoints(s);
  return `<div id="rp-box" class="rp-box" aria-live="polite">
    ${icon('globe', 22)}
    ${est
      ? `<div><p class="eyebrow">${esc(t('rp.title'))}</p>
          <p class="font-display text-3xl font-extrabold num text-accent leading-tight">≈ ${num(est.points)} RP</p>
          <p class="hint mt-1">${esc(t('rp.detail', { months: est.months, plan: t(`plans.${s.profile.memberPlan}`), first: num(est.first), perMonth: num(est.perMonth) }))}</p></div>`
      : `<p class="hint">${esc(t('rp.noDate'))}</p>`}
  </div>`;
}

function body(): string {
  const p = getState().profile;
  const needPlan = p.isMember && !planPicked;
  const ready = (p.isMember || p.isPartner) && !needPlan;
  const message = !p.isMember && !p.isPartner ? t('welcome.needRole') : needPlan ? t('welcome.needPlan') : t('welcome.later');
  return `
  <div class="max-w-[1120px] mx-auto">
    <header class="mb-10 sm:mb-14 text-center">
      <p class="kicker mb-4">${esc(t('welcome.kicker'))}</p>
      <h1 class="welcome-title">${esc(t('welcome.titleA'))} <span class="hl">${esc(t('welcome.titleB'))}</span></h1>
      <p class="text-ink-2 mt-5 max-w-[640px] mx-auto text-[1.08rem]">${esc(t('welcome.intro'))}</p>
    </header>

    <section aria-labelledby="role-h">
      <div class="text-center">
        <p class="kicker mb-1.5">${esc(t('welcome.step', { n: 1 }))}</p>
        <h2 id="role-h" class="!text-[1.8rem] uppercase">${esc(t('welcome.roleQ'))}</h2>
        <p class="hint mt-1">${esc(t('welcome.roleHint'))}</p>
      </div>
      <div class="grid gap-5 sm:gap-6 md:grid-cols-2 mt-6 items-start">
        ${roleBlock('member', p.isMember)}
        ${roleBlock('partner', p.isPartner)}
      </div>
    </section>

    ${p.isMember ? `
    <section class="mt-14" aria-labelledby="plan-h">
      <div class="text-center">
        <p class="kicker mb-1.5">${esc(t('welcome.step', { n: 2 }))}</p>
        <h2 id="plan-h" class="!text-[1.8rem] uppercase">${esc(t('welcome.planQ'))}</h2>
        <p class="hint mt-1">${esc(t('welcome.planHint'))}</p>
      </div>
      <div class="grid gap-5 md:grid-cols-3 mt-6 items-stretch" role="radiogroup" aria-labelledby="plan-h">
        ${PLAN_ORDER.map((plan) => planCard(plan, planPicked && p.memberPlan === plan)).join('')}
      </div>
      ${planPicked ? `<div class="mt-5 max-w-[560px] mx-auto">${pointsBox()}</div>` : ''}
    </section>` : ''}

    <div class="mt-12 flex flex-col items-center gap-3 text-center">
      <button type="button" class="btn btn-primary !min-h-12 !px-6 !text-base" data-action="finish" ${ready ? '' : 'disabled'}>
        ${esc(t('welcome.continue'))} ${icon('arrow', 18)}</button>
      <p class="hint">${esc(message)}</p>
    </div>
  </div>`;
}

/** Click handling shared by the welcome page and Profile & settings. */
export function handleProfileClick(el: HTMLElement): boolean {
  const role = el.closest<HTMLElement>('[data-role]');
  if (role) {
    const key = role.dataset.role === 'member' ? 'isMember' : 'isPartner';
    update((s) => { s.profile[key] = !s.profile[key]; }, `profile.${key}`);
    return true;
  }
  const plan = el.closest<HTMLElement>('[data-plan]');
  if (plan) {
    planPicked = true;
    update((s) => { s.profile.memberPlan = plan.dataset.plan as MemberPlan; }, 'profile.memberPlan');
    return true;
  }
  return false;
}

/**
 * After a profile change: dates only refresh the points estimate (so the date input keeps focus);
 * other changes re-render `target` and put focus back on the tile or card that was clicked.
 */
export function refreshProfile(root: HTMLElement, target: HTMLElement, changed: string, render: () => string): void {
  if (!changed.startsWith('profile.')) return;
  if (changed.endsWith('Since')) {
    root.querySelector('#rp-box')?.replaceWith(document.createRange().createContextualFragment(pointsBox()));
    return;
  }
  const active = document.activeElement as HTMLElement | null;
  const key = active?.dataset.role ? `[data-role="${active.dataset.role}"]` : active?.dataset.plan ? `[data-plan="${active.dataset.plan}"]` : null;
  target.innerHTML = render();
  if (key) root.querySelector<HTMLElement>(key)?.focus();
}

export const welcomeView: View = {
  render() {
    planPicked = getState().onboarded;
    return body();
  },
  mount(root) {
    root.addEventListener('click', (e) => {
      const el = e.target as HTMLElement;
      if (handleProfileClick(el)) return;
      if (el.closest('[data-action="finish"]')) {
        update((s) => { s.onboarded = true; }, 'onboarded');
        location.hash = '#/dashboard';
      }
    });
  },
  update(root, changed) {
    refreshProfile(root, root, changed, body);
  },
};
