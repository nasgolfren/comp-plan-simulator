import { PLAN_PRICES } from '../../config/plan.ts';
import { CADENCE_MONTHS } from '../../engine/simulate.ts';
import { structureStart } from '../../engine/team.ts';
import { INCOME_KEYS } from '../../engine/types.ts';
import { DURATIONS, durationLabel, money, monthLabel, num, t } from '../../i18n/index.ts';
import { getState } from '../../state/store.ts';
import { esc, icon } from '../dom.ts';
import { numField, pct, planTrio, selectField, toggle } from '../fields.ts';
import { legend, mountChart } from '../components/charts.ts';
import { footnote } from '../components/disclaimer.ts';
import { currentSim, incomeSeries, rankName, seriesColor } from '../components/results.ts';
import type { View } from './view.ts';

/** What "start from my Structure" brings in, so the switch says what it does. */
function structureHint(): string {
  const s = getState();
  if (!s.sim.fromStructure) return t('sim.fromStructureOff');
  const from = structureStart(s.month, PLAN_PRICES);
  const members = Object.values(from.members).reduce((a, b) => a + b, 0) + from.legs.reduce((a, l) => a + Object.values(l.members).reduce((x, y) => x + y, 0), 0);
  return t('sim.fromStructureHint', { members: num(members), teams: from.legs.length });
}

/** Whole people at a pace, for people leaving: "[1] Members every [3 mo ▾]". */
function cadence(label: string, base: string): string {
  const everyOpts = CADENCE_MONTHS.map((n) => ({ value: String(n), label: t('sim.everyMonths', { n }) }));
  return `<div class="grid grid-cols-[1fr_1fr] gap-3 items-end">
    ${numField(label, `${base}.count`, { min: 0, step: 1 })}
    ${selectField(t('sim.every'), `${base}.every`, everyOpts, undefined, true)}
  </div>`;
}

/** Optional losses in whole people over time; off by default. */
function lossesSection(): string {
  const on = getState().sim.losses.on;
  return `<div class="panel-quiet grid gap-3">
    ${toggle(t('sim.lossesOn'), 'sim.losses.on')}
    ${on ? `
      ${cadence(t('sim.lossMembers'), 'sim.losses.members')}
      <p class="hint -mt-1">${esc(t('sim.lossMembersHint'))}</p>
      ${cadence(t('sim.lossPartners'), 'sim.losses.partners')}
      <p class="hint -mt-1">${esc(t('sim.lossPartnersHint'))}</p>
      ${toggle(t('sim.lossRandom'), 'sim.losses.random')}
      <p class="hint -mt-1">${esc(t('sim.lossRandomHint'))}</p>` : `<p class="hint">${esc(t('sim.lossesOff'))}</p>`}
  </div>`;
}

function formHtml(): string {
  const monthsOpts = DURATIONS.filter((n) => n >= 6).map((n) => ({ value: String(n), label: durationLabel(n) }));
  return `
    <h2>${esc(t('sim.typical'))}</h2>
    <p class="hint mt-0.5 mb-4">${esc(t('sim.typicalHint'))}</p>
    <div class="grid gap-5">
      ${selectField(t('sim.months'), 'sim.months', monthsOpts, undefined, true)}
      <div><p class="field-label mb-1.5">${esc(t('sim.personal'))}</p>${planTrio('sim.personalActivations')}</div>
      ${numField(t('sim.partners'), 'sim.newPartners.count', { min: 0, step: 1 })}
      <div><p class="field-label mb-1.5">${esc(t('sim.partnerActivations'))}</p>${planTrio('sim.partnerActivations')}</div>
      ${numField(t('sim.teamPartners'), 'sim.teamNewPartners.count', { min: 0, step: 1 })}
      <div class="panel-quiet grid gap-1.5">
        ${toggle(t('sim.fromStructure'), 'sim.fromStructure')}
        <p class="hint" id="sim-from-hint">${esc(structureHint())}</p>
      </div>
      ${lossesSection()}
      <details class="fold">
        <summary><span class="font-semibold text-ink-2">${esc(t('sim.advanced'))}</span>${icon('chevron', 16, 'chev')}</summary>
        <div class="grid grid-cols-2 gap-3 items-end mt-3">
          ${numField(t('sim.newShare'), 'sim.newMemberShare', pct)}
          ${numField(t('sim.maxLegs'), 'sim.maxLegs', { min: 0, max: 50 })}
        </div>
      </details>
    </div>`;
}

function results(): string {
  const sim = currentSim();
  const n = sim.length;
  const gross = sim.reduce((s, m) => s + m.result.gross, 0);
  const net = sim.reduce((s, m) => s + m.result.net, 0);
  const last = sim[n - 1].result;
  const firstRank = sim.findIndex((m) => m.result.qpRank !== 'none');
  const zero = sim.every((m) => m.result.gross === 0);
  // Only the income sources that pay something get a column.
  const keys = INCOME_KEYS.filter((k) => sim.some((m) => m.result.income[k] > 0));
  const sum = (f: (m: typeof sim[number]) => number) => sim.reduce((s, m) => s + f(m), 0);

  return `
    ${zero ? `<div class="note note-info mb-4">${icon('info', 16)}<span>${esc(t('sim.zeroState'))}</span></div>` : ''}
    <div class="grid gap-3 sm:gap-4 grid-cols-2 xl:grid-cols-4 mb-4">
      <div class="panel"><p class="eyebrow">${esc(t('sim.kpiGross', { n }))}</p><p class="font-display text-2xl sm:text-3xl font-bold num mt-1">${money(gross)}</p></div>
      <div class="panel"><p class="eyebrow">${esc(t('sim.kpiNet', { n }))}</p><p class="font-display text-2xl sm:text-3xl font-bold num mt-1 ${net < 0 ? 'text-bad' : ''}">${money(net)}</p></div>
      <div class="panel"><p class="eyebrow">${esc(t('sim.kpiLast'))}</p><p class="font-display text-2xl sm:text-3xl font-bold num mt-1 ${last.net < 0 ? 'text-bad' : ''}">${money(last.net)}</p></div>
      <div class="panel"><p class="eyebrow">${esc(t('sim.kpiRank'))}</p>
        <p class="font-display text-2xl sm:text-3xl font-bold mt-1">${firstRank >= 0 ? esc(rankName(sim[firstRank].result.qpRank, true)) : esc(t('sim.never'))}</p>
        ${firstRank >= 0 ? `<p class="hint">${esc(t('sim.kpiRankIn', { m: firstRank + 1 }))}</p>` : ''}</div>
    </div>

    <section class="panel mb-4" aria-labelledby="sim-chart-h">
      <h2 id="sim-chart-h" class="mb-3">${esc(t('sim.chart'))}</h2>
      <div class="mb-2">${legend([
        ...incomeSeries(sim.map((m) => m.result)).map((x) => ({ label: x.label, color: x.color })),
        { label: t('common.net'), color: seriesColor('net'), line: true },
      ])}</div>
      <div class="chart" id="sim-income"></div>
    </section>

    <section class="panel mb-4" aria-labelledby="sim-table-h">
      <h2 id="sim-table-h" class="mb-3">${esc(t('sim.table'))}</h2>
      <div class="overflow-x-auto -mx-1 px-1">
        <table class="biz-table sim-table">
          <thead><tr>
            <th>${esc(t('col.month'))}</th><th>${esc(t('col.rank'))}</th>
            ${keys.map((k) => `<th class="num"><span class="inline-flex items-center gap-1.5"><i class="inline-block w-2 h-2 rounded-[2px]" style="background:${seriesColor(k)}"></i>${esc(t(`cal.short.${k}`))}</span></th>`).join('')}
            <th class="num">${esc(t('col.costs'))}</th><th class="num">${esc(t('col.net'))}</th>
          </tr></thead>
          <tbody>${sim.map((m) => `<tr>
            <th scope="row" class="whitespace-nowrap">${esc(monthLabel(m.date))}</th>
            <td>${esc(rankName(m.result.qpRank === 'none' ? 'none' : m.result.paidRank, true))}</td>
            ${keys.map((k) => `<td class="num ${m.result.income[k] ? '' : 'text-muted'}">${money(m.result.income[k])}</td>`).join('')}
            <td class="num text-ink-2">−${money(m.result.costs.total)}</td>
            <td class="num font-semibold ${m.result.net < 0 ? 'text-bad' : ''}">${money(m.result.net)}</td>
          </tr>`).join('')}</tbody>
          <tfoot><tr>
            <th scope="row">${esc(t('sim.total'))}</th><td></td>
            ${keys.map((k) => `<td class="num">${money(sum((m) => m.result.income[k]))}</td>`).join('')}
            <td class="num">−${money(sum((m) => m.result.costs.total))}</td>
            <td class="num ${net < 0 ? 'text-bad' : ''}">${money(net)}</td>
          </tr></tfoot>
        </table>
      </div>
    </section>
    <p class="hint mb-3">${esc(t('sim.approx'))}</p>
    ${footnote()}`;
}

function draw(root: HTMLElement): void {
  const sim = currentSim();
  mountChart(root.querySelector<HTMLElement>('#sim-income'), {
    type: 'stacked',
    labels: sim.map((m) => monthLabel(m.date)),
    series: incomeSeries(sim.map((m) => m.result)),
    line: { key: 'net', label: t('common.net'), color: seriesColor('net'), values: sim.map((m) => m.result.net) },
    format: (n) => money(n),
  });
}

function body(): string {
  return `
  <header class="mb-6">
    <h1>${esc(t('sim.title'))}</h1>
    <p class="text-ink-2 mt-1">${esc(t('sim.intro'))}</p>
  </header>
  <div class="grid grid-cols-1 gap-4 lg:grid-cols-[360px_minmax(0,1fr)] items-start">
    <aside class="panel lg:sticky lg:top-20" id="sim-form">${formHtml()}</aside>
    <div id="sim-results" class="min-w-0" aria-live="polite">${results()}</div>
  </div>`;
}

export const simulationView: View = {
  render: body,
  mount: draw,
  update(root, changed) {
    if (changed === 'sim.losses.on') {
      // The loss fields appear or disappear; keep focus on the switch.
      const form = root.querySelector('#sim-form');
      if (form) form.innerHTML = formHtml();
      root.querySelector<HTMLElement>('[data-path="sim.losses.on"]')?.focus();
    }
    const hint = root.querySelector('#sim-from-hint');
    if (hint) hint.textContent = structureHint();
    root.querySelector('#sim-results')!.innerHTML = results();
    draw(root);
  },
};
