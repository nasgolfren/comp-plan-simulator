import { money, monthLabel, num, t } from '../../i18n/index.ts';
import { esc, icon } from '../dom.ts';
import { numField, pct, planTrio, selectField } from '../fields.ts';
import { legend, mountChart } from '../components/charts.ts';
import { footnote } from '../components/disclaimer.ts';
import { currentSim, incomeSeries, rankName, seriesColor } from '../components/results.ts';
import type { View } from './view.ts';

let showTable = false;

function assumptions(): string {
  const monthsOpts = [6, 12, 18, 24, 36].map((n) => ({ value: String(n), label: t('common.months', { n }) }));
  return `
    <h2 class="mb-4">${esc(t('sim.assumptions'))}</h2>
    <div class="grid gap-5">
      ${selectField(t('sim.months'), 'sim.months', monthsOpts, undefined, true)}
      <fieldset class="grid gap-3">
        <legend class="font-display font-semibold mb-2">${esc(t('sim.you'))}</legend>
        <div><p class="field-label mb-1.5">${esc(t('sim.personal'))}</p>${planTrio('sim.personalActivations', { step: 0.5 })}</div>
        <div><p class="field-label mb-1.5">${esc(t('sim.startingMembers'))}</p>${planTrio('sim.startingMembers')}</div>
        ${numField(t('sim.personalGrowth'), 'sim.personalGrowth', { ...pct, min: -50 })}
      </fieldset>
      <fieldset class="grid gap-3">
        <legend class="font-display font-semibold mb-2">${esc(t('sim.team'))}</legend>
        ${numField(t('sim.partners'), 'sim.newPartnersPerMonth', { step: 0.25, hint: t('sim.partnersHint') })}
        <div><p class="field-label mb-1.5">${esc(t('sim.partnerActivations'))}</p>${planTrio('sim.partnerActivations', { step: 0.25 })}</div>
        <div class="grid grid-cols-2 gap-3 items-end">
          ${numField(t('sim.teamGrowth'), 'sim.teamGrowth', { ...pct, min: -50 })}
          ${numField(t('sim.maxLegs'), 'sim.maxLegs', { min: 1, max: 50 })}
        </div>
      </fieldset>
      <fieldset class="grid gap-3">
        <legend class="font-display font-semibold mb-2">${esc(t('sim.retention'))}</legend>
        <div class="grid grid-cols-2 gap-3 items-end">
          ${numField(t('sim.churn'), 'sim.churn', pct)}
          ${numField(t('sim.dropout'), 'sim.partnerDropout', pct)}
        </div>
        ${numField(t('sim.newShare'), 'sim.newMemberShare', pct)}
      </fieldset>
    </div>`;
}

function results(): string {
  const sim = currentSim();
  const n = sim.length;
  const totalNet = sim.reduce((s, m) => s + m.result.net, 0);
  const last = sim[n - 1];
  const firstRank = sim.findIndex((m) => m.result.qpRank !== 'none');
  const zeroActivity = sim.every((m) => m.result.gross === 0);
  let cum = 0;
  const rows = sim.map((m) => { cum += m.result.net; return { m, cum }; });

  return `
    ${zeroActivity ? `<div class="note note-info mb-4">${icon('info', 16)}<span>${esc(t('sim.zeroState'))}</span></div>` : ''}
    <div class="grid gap-4 sm:grid-cols-3 mb-4">
      <div class="panel"><p class="eyebrow">${esc(t('sim.summaryTotalNet', { n }))}</p>
        <p class="font-display text-2xl font-bold num mt-1 ${totalNet < 0 ? 'text-bad' : ''}">${money(totalNet)}</p></div>
      <div class="panel"><p class="eyebrow">${esc(t('sim.summaryLastNet'))}</p>
        <p class="font-display text-2xl font-bold num mt-1 ${last.result.net < 0 ? 'text-bad' : ''}">${money(last.result.net)}</p></div>
      <div class="panel"><p class="eyebrow">${esc(t('sim.summaryRank'))}</p>
        <p class="font-display text-2xl font-bold mt-1">${firstRank >= 0 ? esc(rankName(sim[firstRank].result.qpRank, true)) : esc(t('sim.never'))}</p>
        ${firstRank >= 0 ? `<p class="hint">${esc(t('sim.summaryRankIn', { m: firstRank + 1 }))}</p>` : ''}</div>
    </div>

    <section class="panel mb-4" aria-labelledby="sim-inc-h">
      <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 id="sim-inc-h">${esc(t('sim.chartIncome'))}</h2>
        <button type="button" class="btn btn-sm" data-action="toggle-table">${esc(showTable ? t('common.showChart') : t('common.showTable'))}</button>
      </div>
      ${showTable ? `<div class="overflow-x-auto"><table class="data-table">
        <thead><tr><th>${esc(t('col.month'))}</th><th>${esc(t('col.rank'))}</th><th>${esc(t('col.gross'))}</th><th>${esc(t('col.costs'))}</th><th>${esc(t('col.net'))}</th><th>${esc(t('col.cumulative'))}</th><th>${esc(t('col.members'))}</th><th>${esc(t('col.partners'))}</th></tr></thead>
        <tbody>${rows.map(({ m, cum: c }) => `<tr>
          <td>${esc(monthLabel(m.date))}</td><td>${esc(rankName(m.result.qpRank === 'none' ? 'none' : m.result.paidRank, true))}</td>
          <td>${money(m.result.gross)}</td><td>${money(m.result.costs.total)}</td>
          <td class="${m.result.net < 0 ? 'text-bad' : 'font-semibold'}">${money(m.result.net)}</td><td>${money(c)}</td>
          <td>${num(m.payingMembers)}</td><td>${num(m.teamPartners, 1)}</td></tr>`).join('')}</tbody></table></div>`
      : `<div class="mb-2">${legend([
        ...incomeSeries(sim.map((m) => m.result)).map((x) => ({ label: x.label, color: x.color })),
        { label: t('common.net'), color: seriesColor('net'), line: true },
      ])}</div><div class="chart" id="sim-income"></div>`}
    </section>

    ${showTable ? '' : `<section class="panel mb-4" aria-labelledby="sim-team-h">
      <h2 id="sim-team-h" class="mb-3">${esc(t('sim.chartTeam'))}</h2>
      <div class="mb-2">${legend([{ label: t('sim.members'), color: 'var(--s-dab)', line: true }, { label: t('sim.partnersSeries'), color: 'var(--s-mab)', line: true }])}</div>
      <div class="chart" id="sim-team"></div>
    </section>`}
    <p class="hint mb-3">${esc(t('sim.approx'))}</p>
    ${footnote()}`;
}

function draw(root: HTMLElement): void {
  if (showTable) return;
  const sim = currentSim();
  const labels = sim.map((m) => monthLabel(m.date));
  mountChart(root.querySelector<HTMLElement>('#sim-income'), {
    type: 'stacked', labels,
    series: incomeSeries(sim.map((m) => m.result)),
    line: { key: 'net', label: t('common.net'), color: seriesColor('net'), values: sim.map((m) => m.result.net) },
    format: (n) => money(n),
  });
  mountChart(root.querySelector<HTMLElement>('#sim-team'), {
    type: 'lines', labels,
    series: [
      { key: 'members', label: t('sim.members'), color: 'var(--s-dab)', values: sim.map((m) => Math.round(m.payingMembers * 10) / 10) },
      { key: 'partners', label: t('sim.partnersSeries'), color: 'var(--s-mab)', values: sim.map((m) => Math.round(m.teamPartners * 10) / 10) },
    ],
    format: (n) => num(n, 1),
  });
}

function body(): string {
  return `
  <header class="mb-6">
    <h1>${esc(t('sim.title'))}</h1>
    <p class="text-ink-2 mt-1">${esc(t('sim.intro'))}</p>
  </header>
  <div class="grid grid-cols-1 gap-4 lg:grid-cols-[360px_minmax(0,1fr)] items-start">
    <aside class="panel">${assumptions()}</aside>
    <div id="sim-results" class="min-w-0" aria-live="polite">${results()}</div>
  </div>`;
}

export const simulationView: View = {
  render: body,
  mount(root) {
    draw(root);
    root.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('[data-action="toggle-table"]')) {
        showTable = !showTable;
        root.querySelector('#sim-results')!.innerHTML = results();
        draw(root);
      }
    });
  },
  update(root) {
    root.querySelector('#sim-results')!.innerHTML = results();
    draw(root);
  },
};
