import { MEMBER_PLANS, PLAN_PRICES, RANKS, rankById } from '../../config/plan.ts';
import { legActivationVolume, rankGap } from '../../engine/calc.ts';
import { planGoal } from '../../engine/simulate.ts';
import type { Goal } from '../../engine/simulate.ts';
import { money, monthLabel, num, t } from '../../i18n/index.ts';
import { calcProfile, getState, simOptions, update } from '../../state/store.ts';
import { esc, icon, toast } from '../dom.ts';
import { numField, selectField } from '../fields.ts';
import { footnote } from '../components/disclaimer.ts';
import { currentMonth } from '../components/results.ts';
import type { View } from './view.ts';

function form(): string {
  const g = getState().goal;
  const rankOpts = RANKS.filter((r) => r.id !== 'none').map((r) => ({ value: r.id, label: r.name }));
  const deadlineOpts = [3, 6, 12, 18, 24, 36].map((n) => ({ value: String(n), label: t('common.months', { n }) }));
  return `
    <div class="grid gap-4">
      <div class="grid gap-2">
        <p class="field-label">${esc(t('goals.kind'))}</p>
        <div class="seg w-full [&>button]:flex-1" role="group" aria-label="${esc(t('goals.kind'))}">
          <button type="button" data-action="goal-rank" aria-pressed="${g.kind === 'rank'}">${esc(t('goals.kindRank'))}</button>
          <button type="button" data-action="goal-income" aria-pressed="${g.kind === 'income'}">${esc(t('goals.kindIncome'))}</button>
        </div>
      </div>
      <div class="grid gap-4">
        ${g.kind === 'rank'
          ? selectField(t('goals.rank'), 'goal.rank', rankOpts)
          : numField(t('goals.net'), 'goal.net', { prefix: '$', step: 100 })}
        ${selectField(t('goals.deadline'), 'goal.deadline', deadlineOpts, undefined, true)}
      </div>
    </div>`;
}

function requirements(): string {
  const s = getState();
  if (s.goal.kind !== 'rank') return '';
  const r = rankById(s.goal.rank);
  const prices = PLAN_PRICES;
  const month = currentMonth();
  const legs = s.month.legs.map((l) => ({ id: l.id, value: legActivationVolume(l, prices) + l.recurringVolume }));
  const gap = rankGap(r.id, month.production.directProduction, legs, month.production.tav);
  const row = (label: string, need: string, have: string, missing: string) =>
    `<tr><td>${esc(label)}</td><td class="font-semibold">${need}</td><td>${have}</td><td class="${missing === '—' ? 'text-good' : 'text-accent-ink font-semibold'}">${missing}</td></tr>`;
  const miss = (need: number, have: number) => (have >= need ? '—' : money(need - have));
  return `
    <section class="panel" aria-labelledby="req-h">
      <h2 id="req-h" class="mb-3">${esc(t('goals.requirements', { rank: r.name }))}</h2>
      <div class="overflow-x-auto"><table class="data-table">
        <thead><tr><th></th><th>${esc(rankById(r.id).short)}</th><th>${esc(t('goals.yourMonth'))}</th><th>${esc(t('goals.gap'))}</th></tr></thead>
        <tbody>
          ${row(t('goals.reqQp'), money(r.qp), money(gap.qpCounted), miss(r.qp, gap.qpCounted))}
          ${row(t('goals.reqTav'), money(r.tav), money(gap.tav), miss(r.tav, gap.tav))}
          <tr><td>${esc(t('goals.reqCap'))}</td><td class="font-semibold">${money(gap.legCapAmount)}</td><td colspan="2" class="text-muted">${Math.round(r.legCap * 100)}%</td></tr>
          <tr><td>${esc(t('goals.reqTeams'))}</td><td class="font-semibold">${Math.ceil(1 / r.legCap)}</td><td colspan="2"></td></tr>
          <tr><td>${esc(t('goals.reqTlb'))}</td><td class="font-semibold">${money(r.tlb)}</td><td colspan="2"></td></tr>
        </tbody>
      </table></div>
    </section>`;
}

function outlook(): string {
  const s = getState();
  const goal: Goal = s.goal.kind === 'rank' ? { kind: 'rank', rank: s.goal.rank } : { kind: 'income', net: s.goal.net };
  const opts = simOptions(s);
  const res = planGoal(goal, s.sim, s.goal.deadline, { ...calcProfile(s), fastStartMonth: false }, PLAN_PRICES, opts);
  const hasActivity = MEMBER_PLANS.some((p) => s.sim.personalActivations[p] > 0 || s.sim.partnerActivations[p] > 0) || s.sim.newPartnersPerMonth > 0;
  const n = s.goal.deadline;

  let status: string;
  if (res.reachedIn !== null && res.reachedIn < n) {
    const d = new Date(opts.start.getFullYear(), opts.start.getMonth() + res.reachedIn, 1);
    status = `<div class="note note-good">${icon('check', 16)}<span>${esc(t('goals.reachedIn', { m: res.reachedIn + 1, date: monthLabel(d, 'long') }))}</span></div>`;
  } else {
    status = `<div class="note note-info">${icon('info', 16)}<span>${esc(t('goals.notReached', { n }))}</span></div>`;
  }

  let plan = '';
  if (!hasActivity) plan = `<p class="text-sm text-ink-2 mt-4">${esc(t('goals.noActivity'))} <a class="underline font-semibold text-brand-ink" href="#/simulation">${esc(t('nav.simulation'))}</a></p>`;
  else if (res.factor === null) plan = `<p class="text-sm text-ink-2 mt-4">${esc(t('goals.impossible', { n }))}</p>`;
  else if (res.factor > 1.0001 || res.reachedIn === null || res.reachedIn >= n) {
    const sc = res.scaled!;
    const rows: [string, number, number][] = [
      ...MEMBER_PLANS.filter((p) => s.sim.personalActivations[p] > 0).map((p) => [t('goals.rowPersonal', { plan: t(`plans.${p}`) }), s.sim.personalActivations[p], sc.personalActivations[p]] as [string, number, number]),
      ...(s.sim.newPartnersPerMonth > 0 ? [[t('goals.rowPartners'), s.sim.newPartnersPerMonth, sc.newPartnersPerMonth] as [string, number, number]] : []),
      ...MEMBER_PLANS.filter((p) => s.sim.partnerActivations[p] > 0).map((p) => [t('goals.rowPartnerAct', { plan: t(`plans.${p}`) }), s.sim.partnerActivations[p], sc.partnerActivations[p]] as [string, number, number]),
    ];
    plan = `
      <p class="text-sm text-ink mt-4">${esc(t('goals.factor', { n, x: num(res.factor, 1) }))}</p>
      <h3 class="mt-4 mb-2">${esc(t('goals.monthlyPlan'))}</h3>
      <div class="overflow-x-auto"><table class="data-table">
        <thead><tr><th></th><th>${esc(t('goals.current'))}</th><th>${esc(t('goals.needed'))}</th></tr></thead>
        <tbody>${rows.map(([l, a, b]) => `<tr><td>${esc(l)}</td><td>${num(a, 2)}</td><td class="font-semibold">${num(b, 2)}</td></tr>`).join('')}</tbody>
      </table></div>
      <button type="button" class="btn btn-sm mt-4" data-action="apply-scaled" data-factor="${res.factor}">${icon('arrow', 15)}${esc(t('goals.apply'))}</button>`;
  }

  return `
    <section class="panel" aria-labelledby="out-h">
      <h2 id="out-h" class="mb-3">${esc(t('goals.withCurrent'))}</h2>
      ${status}
      ${plan}
    </section>`;
}

function results(): string {
  return `<div class="grid gap-4">${requirements()}${outlook()}<div>${footnote()}</div></div>`;
}

function body(): string {
  return `
  <header class="mb-6">
    <h1>${esc(t('goals.title'))}</h1>
    <p class="text-ink-2 mt-1 max-w-2xl">${esc(t('goals.intro'))}</p>
  </header>
  <div class="grid grid-cols-1 gap-4 lg:grid-cols-[360px_minmax(0,1fr)] items-start">
    <aside class="panel" id="goal-form">${form()}</aside>
    <div id="goal-results" class="min-w-0" aria-live="polite">${results()}</div>
  </div>`;
}

export const goalsView: View = {
  render: body,
  mount(root) {
    root.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
      if (!btn) return;
      const a = btn.dataset.action;
      if (a === 'goal-rank' || a === 'goal-income') {
        update((s) => { s.goal.kind = a === 'goal-rank' ? 'rank' : 'income'; }, 'goal.kind');
        root.querySelector('#goal-form')!.innerHTML = form();
      } else if (a === 'apply-scaled') {
        const k = Number(btn.dataset.factor);
        const r2 = (x: number) => Math.ceil(x * k * 100) / 100;
        update((s) => {
          for (const p of MEMBER_PLANS) {
            s.sim.personalActivations[p] = r2(s.sim.personalActivations[p]);
            s.sim.partnerActivations[p] = r2(s.sim.partnerActivations[p]);
          }
          s.sim.newPartnersPerMonth = r2(s.sim.newPartnersPerMonth);
          s.sim.months = Math.max(s.sim.months, s.goal.deadline);
        }, 'sim');
        toast(t('goals.applied'));
      }
    });
  },
  update(root) {
    root.querySelector('#goal-results')!.innerHTML = results();
  },
};
