import { MEMBER_PLANS, PLAN_PRICES, RANKS, rankById } from '../../config/plan.ts';
import { activationVolume, legActivationVolume, rankGap } from '../../engine/calc.ts';
import { planGoal } from '../../engine/simulate.ts';
import type { Cadence, Goal, GoalStyle } from '../../engine/simulate.ts';
import { teamToLegs } from '../../engine/team.ts';
import type { PlanCounts } from '../../engine/types.ts';
import { DURATIONS, durationLabel, money, monthLabel, num, t } from '../../i18n/index.ts';
import { calcProfile, getState, simOptions, update } from '../../state/store.ts';
import { esc, icon } from '../dom.ts';
import { numField, selectField, toggle } from '../fields.ts';
import { footnote } from '../components/disclaimer.ts';
import { currentMonth, rankName } from '../components/results.ts';
import { helpButton, helpPanel } from '../components/tableHelp.ts';
import { structureHint } from './simulation.ts';
import type { View } from './view.ts';

const STYLES: GoalStyle[] = ['personal', 'balanced', 'team'];
/** Month-by-month columns, each explained in the header and in a legend under the table. */
const COLS = ['qp', 'tav', 'direct', 'partners', 'yours', 'team'] as const;

function form(): string {
  const g = getState().goal;
  const rankOpts = RANKS.filter((r) => r.id !== 'none').map((r) => ({ value: r.id, label: r.name }));
  const deadlineOpts = DURATIONS.map((n) => ({ value: String(n), label: durationLabel(n) }));
  return `
    <div class="grid gap-5">
      <div class="grid gap-2">
        <p class="field-label">${esc(t('goals.kind'))}</p>
        <div class="seg w-full [&>button]:flex-1" role="group" aria-label="${esc(t('goals.kind'))}">
          <button type="button" data-action="goal-rank" aria-pressed="${g.kind === 'rank'}">${esc(t('goals.kindRank'))}</button>
          <button type="button" data-action="goal-income" aria-pressed="${g.kind === 'income'}">${esc(t('goals.kindIncome'))}</button>
        </div>
      </div>
      ${g.kind === 'rank' ? selectField(t('goals.rank'), 'goal.rank', rankOpts) : numField(t('goals.net'), 'goal.net', { prefix: '$', step: 100 })}
      ${selectField(t('goals.deadline'), 'goal.deadline', deadlineOpts, undefined, true)}
      <div class="grid gap-2" role="radiogroup" aria-label="${esc(t('goals.style'))}">
        <p class="field-label">${esc(t('goals.style'))}</p>
        ${STYLES.map((st) => `<button type="button" class="style-opt" role="radio" aria-checked="${g.style === st}" data-style="${st}">
          <span class="style-dot" aria-hidden="true"></span>
          <span><span class="block font-semibold text-ink">${esc(t(`goals.style.${st}`))}</span><span class="block hint">${esc(t(`goals.style.${st}Hint`))}</span></span>
        </button>`).join('')}
      </div>
      <div class="panel-quiet grid gap-1.5">
        ${toggle(t('sim.fromStructure'), 'goal.fromStructure')}
        <p class="hint" id="goal-from-hint">${esc(structureHint(g.fromStructure))}</p>
      </div>
    </div>`;
}

function requirements(): string {
  const s = getState();
  if (s.goal.kind !== 'rank') return '';
  const r = rankById(s.goal.rank);
  const month = currentMonth();
  const legs = teamToLegs(s.month.team, PLAN_PRICES).map((l) => ({ id: l.id, value: legActivationVolume(l, PLAN_PRICES) + l.recurringVolume }));
  const gap = rankGap(r.id, month.production.directProduction, legs, month.production.tav);
  const row = (label: string, need: string, have: string, missing: string) =>
    `<tr><th scope="row">${esc(label)}</th><td class="num font-semibold">${need}</td><td class="num">${have}</td><td class="num ${missing === '—' ? 'text-good' : 'text-accent font-semibold'}">${missing}</td></tr>`;
  const miss = (need: number, have: number) => (have >= need ? '—' : money(need - have));
  return `
    <section class="panel" aria-labelledby="req-h">
      <h2 id="req-h" class="mb-3">${esc(t('goals.requirements', { rank: r.name }))}</h2>
      <div class="overflow-x-auto"><table class="biz-table">
        <thead><tr><th></th><th class="num">${esc(r.short)}</th><th class="num">${esc(t('goals.yourMonth'))}</th><th class="num">${esc(t('goals.gap'))}</th></tr></thead>
        <tbody>
          ${row(t('goals.reqQp'), money(r.qp), money(gap.qpCounted), miss(r.qp, gap.qpCounted))}
          ${row(t('goals.reqTav'), money(r.tav), money(gap.tav), miss(r.tav, gap.tav))}
          <tr><th scope="row">${esc(t('goals.reqCap'))}</th><td class="num font-semibold">${money(gap.legCapAmount)}</td><td colspan="2" class="text-muted">${Math.round(r.legCap * 100)}%</td></tr>
          <tr><th scope="row">${esc(t('goals.reqTeams'))}</th><td class="num font-semibold">${Math.ceil(1 / r.legCap)}</td><td colspan="2"></td></tr>
          <tr><th scope="row">${esc(t('goals.reqTlb'))}</th><td class="num font-semibold">${money(r.tlb)}</td><td colspan="2"></td></tr>
        </tbody>
      </table></div>
    </section>`;
}

const countsText = (c: PlanCounts) => {
  const parts = MEMBER_PLANS.filter((p) => c[p] > 0).map((p) => `${num(c[p])} ${t(`plans.${p}`)}`);
  return parts.length ? parts.join(' + ') : t('goals.none');
};
/** The plan's activations as one number: their activation volume per month. */
const volumeLine = (c: PlanCounts) => `<p class="plan-volume"><span class="num">${money(activationVolume(c, PLAN_PRICES))}</span> ${esc(t('goals.volume'))}</p>`;

// Whole Partners: n per month, or n every few months.
const partnersText = (c: Cadence) => (c.count <= 0 ? t('goals.none')
  : c.every <= 1 ? t('goals.perMonth', { n: num(c.count) }) : t('goals.everyN', { count: num(c.count), n: num(c.every) }));

function plan(): string {
  const s = getState();
  const goal: Goal = s.goal.kind === 'rank' ? { kind: 'rank', rank: s.goal.rank } : { kind: 'income', net: s.goal.net };
  const opts = simOptions(s, s.goal.fromStructure);
  const res = planGoal(goal, s.goal.style, s.goal.deadline, { ...calcProfile(s), fastStartMonth: false }, PLAN_PRICES, opts);
  const dateOf = (i: number) => monthLabel(new Date(opts.start.getFullYear(), opts.start.getMonth() + i, 1), 'long');

  if (!res.plan) {
    return `<section class="panel"><div class="note note-warn">${icon('alert', 16)}<span>${esc(t('goals.impossible', { n: s.goal.deadline }))}</span></div></section>`;
  }
  const p = res.plan;
  const nothingNeeded = p.newPartners.count === 0 && p.teamNewPartners.count === 0 && MEMBER_PLANS.every((k) => p.personalActivations[k] === 0 && p.partnerActivations[k] === 0);
  const hitMonth = res.reachedIn;

  const steps = res.milestones.map((m) => ({ index: m.index, label: rankName(m.rank), qp: res.months[m.index].result.production.qp, goal: s.goal.kind === 'rank' && m.rank === s.goal.rank }));
  if (s.goal.kind === 'income' && hitMonth !== null) {
    steps.push({ index: hitMonth, label: t('goals.goalHit', { net: money(res.months[hitMonth].result.net) }), qp: res.months[hitMonth].result.production.qp, goal: true });
    steps.sort((a, b) => a.index - b.index);
  }

  return `
    <section class="panel" aria-labelledby="plan-h">
      <h2 id="plan-h" class="mb-3">${esc(t('goals.plan'))}</h2>
      ${nothingNeeded
        ? `<div class="note note-good">${icon('check', 16)}<span>${esc(t('goals.already'))}</span></div>`
        : `<div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div class="plan-step"><p class="eyebrow">${esc(t('goals.planYou'))}</p><p class="font-display text-xl font-bold">${esc(countsText(p.personalActivations))}</p>${volumeLine(p.personalActivations)}</div>
            <div class="plan-step"><p class="eyebrow">${esc(t('goals.planPartners'))}</p><p class="font-display text-xl font-bold">${esc(partnersText(p.newPartners))}</p></div>
            <div class="plan-step"><p class="eyebrow">${esc(t('goals.planPartnerAct'))}</p><p class="font-display text-xl font-bold">${esc(countsText(p.partnerActivations))}</p>${volumeLine(p.partnerActivations)}</div>
            <div class="plan-step"><p class="eyebrow">${esc(t('goals.planTeam'))}</p><p class="font-display text-xl font-bold">${esc(partnersText(p.teamNewPartners))}</p></div>
          </div>`}
      ${hitMonth !== null ? `<div class="note note-good mt-4">${icon('target', 16)}<span>${esc(t('goals.reachedIn', { m: hitMonth + 1, date: dateOf(hitMonth) }))}</span></div>` : ''}
    </section>

    ${steps.length ? `<section class="panel" aria-labelledby="tl-h">
      <h2 id="tl-h" class="mb-4">${esc(t('goals.timeline'))}</h2>
      <ol class="timeline">${steps.map((st) => `
        <li class="${st.goal ? 'is-goal' : ''}">
          <span class="tl-dot" aria-hidden="true">${st.goal ? icon('check', 13) : ''}</span>
          <p class="eyebrow">${esc(t('goals.milestone', { m: st.index + 1, date: dateOf(st.index) }))}</p>
          <p class="font-display text-xl font-bold ${st.goal ? 'text-accent' : 'text-ink'}">${esc(st.label)}</p>
          <p class="hint">${esc(t('goals.milestoneQp', { qp: money(st.qp) }))}</p>
        </li>`).join('')}
      </ol>
    </section>` : ''}

    <section class="panel" aria-labelledby="gt-h">
      <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 id="gt-h">${esc(t('goals.table'))}</h2>
        ${helpButton('goal-help')}
      </div>
      ${helpPanel('goal-help', COLS.map((c) => ({ term: t(`goals.col.${c}`), text: t(`goals.col.${c}Hint`) })))}
      <div class="overflow-x-auto -mx-1 px-1"><table class="biz-table">
        <thead><tr>
          <th>${esc(t('col.month'))}</th><th>${esc(t('col.rank'))}</th>
          ${COLS.map((c) => (c === 'qp' || c === 'tav'
            // Short abbreviations; their meaning is in "Table help", so the columns stay narrow.
            ? `<th class="num" title="${esc(t(`goals.col.${c}Sub`))}">${esc(t(`goals.col.${c}`))}</th>`
            : `<th class="num" title="${esc(t(`goals.col.${c}Hint`))}">${esc(t(`goals.col.${c}`))}<span class="th-sub">${esc(t(`goals.col.${c}Sub`))}</span></th>`)).join('')}
          <th class="num">${esc(t('col.net'))}</th>
        </tr></thead>
        <tbody>${res.months.map((m, i) => `<tr class="${i === hitMonth ? 'is-hit' : ''}">
          <th scope="row" class="whitespace-nowrap">${esc(monthLabel(m.date))}</th>
          <td>${m.result.qpRank === 'none' ? '<span class="text-muted">—</span>' : esc(rankName(m.result.paidRank, true))}</td>
          <td class="num">${money(m.result.production.qp)}</td><td class="num">${money(m.result.production.tav)}</td>
          <td class="num">${num(m.legs)}</td><td class="num">${num(m.teamPartners)}</td>
          <td class="num">${num(m.personalMembers)}</td><td class="num">${num(m.teamMembers)}</td>
          <td class="num font-semibold ${m.result.net < 0 ? 'text-bad' : ''}">${money(m.result.net)}</td>
        </tr>`).join('')}</tbody>
      </table></div>
      <p class="hint mt-3">${esc(t('goals.estimate'))}</p>
    </section>`;
}

function results(): string {
  return `<div class="grid gap-4">${requirements()}${plan()}<div>${footnote()}</div></div>`;
}

function body(): string {
  return `
  <header class="mb-6">
    <h1>${esc(t('goals.title'))}</h1>
    <p class="text-ink-2 mt-1">${esc(t('goals.intro'))}</p>
  </header>
  <div class="grid grid-cols-1 gap-4 lg:grid-cols-[360px_minmax(0,1fr)] items-start">
    <aside class="panel lg:sticky lg:top-20" id="goal-form">${form()}</aside>
    <div id="goal-results" class="min-w-0" aria-live="polite">${results()}</div>
  </div>`;
}

export const goalsView: View = {
  render: body,
  mount(root) {
    root.addEventListener('click', (e) => {
      const el = e.target as HTMLElement;
      const style = el.closest<HTMLElement>('[data-style]');
      if (style) {
        update((s) => { s.goal.style = style.dataset.style as GoalStyle; }, 'goal.style');
        root.querySelector('#goal-form')!.innerHTML = form();
        root.querySelector<HTMLElement>(`[data-style="${style.dataset.style}"]`)?.focus();
        return;
      }
      const btn = el.closest<HTMLElement>('[data-action]');
      if (btn?.dataset.action === 'goal-rank' || btn?.dataset.action === 'goal-income') {
        const kind = btn.dataset.action === 'goal-rank' ? 'rank' : 'income';
        update((s) => { s.goal.kind = kind; }, 'goal.kind');
        root.querySelector('#goal-form')!.innerHTML = form();
        root.querySelector<HTMLElement>(`[data-action="goal-${kind}"]`)?.focus();
      }
    });
  },
  update(root) {
    const hint = root.querySelector('#goal-from-hint');
    if (hint) hint.textContent = structureHint(getState().goal.fromStructure);
    root.querySelector('#goal-results')!.innerHTML = results();
  },
};
