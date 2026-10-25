import { rankById } from '../../config/plan.ts';
import { INCOME_KEYS } from '../../engine/types.ts';
import { money, monthLabel, t } from '../../i18n/index.ts';
import { getState, renewalDaysLeft } from '../../state/store.ts';
import { esc, icon } from '../dom.ts';
import { legend, mountChart } from '../components/charts.ts';
import { footnote } from '../components/disclaimer.ts';
import { currentMonth, currentSim, incomeSeries, noteHtml, rankName, seriesColor } from '../components/results.ts';
import { rankRoute } from '../components/route.ts';
import type { View } from './view.ts';

function progressRow(label: string, have: number, need: number, accent = false): string {
  const pct = need > 0 ? Math.min(100, (have / need) * 100) : 100;
  return `<div class="grid gap-1.5">
    <div class="flex justify-between gap-3 text-sm"><span class="font-medium text-ink-2">${esc(label)}</span>
      <span class="num text-ink-2">${esc(t('progress.of', { have: money(have), need: money(need) }))}</span></div>
    <div class="bar ${accent ? 'accent' : ''}" role="progressbar" aria-label="${esc(label)}" aria-valuenow="${Math.round(pct)}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></div>
  </div>`;
}

function cond(label: string, state: 'met' | 'notMet' | 'notRequired' | 'notThisMonth' | 'unknown'): string {
  const map = {
    met: ['pill-good', 'check', t('cond.met')],
    notMet: ['pill-bad', 'x', t('cond.notMet')],
    notRequired: ['pill-muted', 'minus', t('cond.notRequired')],
    notThisMonth: ['pill-muted', 'minus', t('cond.notThisMonth')],
    unknown: ['pill-muted', 'minus', t('renewal.unknown')],
  } as const;
  const [cls, ic, text] = map[state];
  return `<li class="flex items-center justify-between gap-3 py-2.5 border-t border-line first:border-t-0">
    <span class="text-sm text-ink-2">${esc(label)}</span><span class="pill ${cls}">${icon(ic, 13)}${esc(text)}</span></li>`;
}

function body(): string {
  const s = getState();
  const r = currentMonth();
  const sim = currentSim().slice(0, 12);
  // The getting-started note stays until real numbers are entered (an empty team row doesn't count).
  const hasInput = r.production.directProduction > 0 || r.production.tav > 0 || r.production.rqp > 0;
  const cur = r.qpRank === 'none' ? 'none' : r.paidRank;
  const nextRankId = r.nextRank?.rankId ?? null;
  const days = renewalDaysLeft(s);

  const renewalText = days === null ? t('renewal.unknown') : days >= 0 ? t('renewal.daysLeft', { days }) : t('renewal.expired', { days: -days });
  const renewalTone = days === null ? 'text-muted' : days < 0 ? 'text-bad' : days < 21 ? 'text-warn' : 'text-ink';

  const gap = r.nextRank;
  const capped = gap?.cappedLegIds.length ?? 0;

  return `
  <header class="flex flex-wrap items-end justify-between gap-4 mb-6">
    <div>
      <h1>${esc(t('dash.title'))}</h1>
      <p class="text-ink-2 mt-1">${esc(t('dash.subtitle'))}</p>
    </div>
    <a href="#/calculator" class="btn btn-primary">${icon('tree', 16)}${esc(t('dash.openCalc'))}</a>
  </header>

  ${!hasInput ? `<div class="note note-info mb-4">${icon('info', 16)}<span>${esc(t('dash.empty'))}</span></div>` : ''}

  <section class="panel mb-4 pb-3" aria-labelledby="route-h">
    <div class="flex flex-wrap items-baseline justify-between gap-2">
      <h2 id="route-h">${esc(t('dash.route'))}</h2>
      ${nextRankId ? `<span class="text-sm text-ink-2">${esc(t('dash.next', { rank: rankById(nextRankId).name }))}</span>` : ''}
    </div>
    <p class="font-display text-[1.65rem] font-bold text-brand-ink mt-1 leading-tight">${esc(rankName(cur))}</p>
    ${r.qpRank !== 'none' && r.qpRank !== r.paidRank ? `<p class="hint">${esc(t('calc.qpRankNote', { rank: rankById(r.qpRank).name }))}</p>` : ''}
    <div class="-mx-2 mt-1">${rankRoute(cur, nextRankId)}</div>
  </section>

  <div class="grid gap-3 sm:gap-4 grid-cols-2 xl:grid-cols-4 mb-4">
    <div class="panel">
      <p class="eyebrow">${esc(t('dash.kpiNet'))}</p>
      <p class="font-display text-2xl sm:text-3xl font-bold num mt-1 ${r.net < 0 ? 'text-bad' : ''}">${money(r.net, { cents: true })}</p>
      <p class="hint mt-1">${esc(t('dash.kpiGross', { amount: money(r.gross), costs: money(r.costs.total, { cents: true }) }))}</p>
    </div>
    <div class="panel">
      <p class="eyebrow">${esc(t('dash.kpiQp'))}</p>
      <p class="font-display text-2xl sm:text-3xl font-bold num mt-1">${money(r.production.qp)}</p>
      <p class="hint mt-1">${esc(rankName(r.qpRank))}</p>
    </div>
    <div class="panel">
      <p class="eyebrow">${esc(t('dash.kpiTav'))}</p>
      <p class="font-display text-2xl sm:text-3xl font-bold num mt-1">${money(r.production.tav)}</p>
      <p class="hint mt-1">${esc(t(`tlb.${r.tlbStatus}`))}</p>
    </div>
    <div class="panel">
      <p class="eyebrow">${esc(t('dash.kpiRenewal'))}</p>
      <p class="font-display text-xl sm:text-2xl font-bold mt-1 ${renewalTone}">${esc(renewalText)}</p>
      <a class="hint underline mt-1 inline-block" href="#/profile">${esc(t('nav.profile'))}</a>
    </div>
  </div>

  <div class="grid grid-cols-1 gap-4 lg:grid-cols-5 mb-4">
    <section class="panel lg:col-span-3" aria-labelledby="prog-h">
      <h2 id="prog-h" class="mb-4">${gap ? esc(t('dash.progress', { rank: rankById(gap.rankId).name })) : esc(t('dash.progressTop'))}</h2>
      ${gap ? `<div class="grid gap-5">
        ${progressRow(t('progress.qp'), gap.qpCounted, gap.qpRequired)}
        ${progressRow(t('progress.tav'), gap.tav, gap.tavRequired, true)}
        ${capped ? `<div class="note note-info">${icon('info', 16)}<span>${esc(t('progress.capped', { n: capped, cap: money(gap.legCapAmount) }))}</span></div>` : ''}
      </div>` : ''}
      ${r.notes.length ? `<div class="grid gap-2 mt-5">${r.notes.map((n) => noteHtml(n)).join('')}</div>` : ''}
    </section>
    <section class="panel lg:col-span-2" aria-labelledby="cond-h">
      <h2 id="cond-h" class="mb-2">${esc(t('dash.conditions'))}</h2>
      <ul>
        ${cond(t('cond.renewal'), !s.profile.isPartner ? 'notMet' : days === null ? 'unknown' : r.conditions.renewalCurrent ? 'met' : 'notMet')}
        ${cond(t('cond.minActivations'), !r.conditions.minActivations.required ? 'notRequired' : r.conditions.minActivations.met ? 'met' : 'notMet')}
        ${cond(t('cond.membershipFree'), r.conditions.membershipFree ? 'met' : 'notMet')}
        ${cond(t('cond.fastStart'), r.conditions.fastStart ? 'met' : 'notThisMonth')}      </ul>
    </section>
  </div>

  <div class="grid grid-cols-1 gap-4 lg:grid-cols-5 mb-4">
    <section class="panel lg:col-span-2" aria-labelledby="bd-h">
      <h2 id="bd-h" class="mb-3">${esc(t('dash.breakdown'))}</h2>
      <div class="chart" id="dash-donut"></div>
      <ul class="mt-3 grid gap-1.5 text-sm">
        ${INCOME_KEYS.map((k) => `<li class="flex items-center justify-between gap-3">
          <span class="inline-flex items-center gap-2"><i class="inline-block w-2.5 h-2.5 rounded-[3px]" style="background:${seriesColor(k)}"></i>${esc(t(`income.${k}`))}</span>
          <span class="num ${r.income[k] ? 'font-semibold' : 'text-muted'}">${money(r.income[k])}</span></li>`).join('')}
      </ul>
      ${r.gross === 0 ? `<p class="hint mt-3">${esc(t('dash.noIncome'))}</p>` : ''}
    </section>
    <section class="panel lg:col-span-3" aria-labelledby="sim-h">
      <div class="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <h2 id="sim-h">${esc(t('dash.sim', { n: sim.length }))}</h2>
        <a class="text-sm font-semibold text-brand-ink underline" href="#/simulation">${esc(t('dash.openSim'))}</a>
      </div>
      <div class="mb-2">${legend([
        ...incomeSeries(sim.map((m) => m.result)).map((x) => ({ label: x.label, color: x.color })),
        { label: t('common.net'), color: seriesColor('net'), line: true },
      ])}</div>
      <div class="chart" id="dash-sim"></div>
    </section>
  </div>

  <div class="mt-2">${footnote()}</div>`;
}

function drawCharts(root: HTMLElement): void {
  const r = currentMonth();
  const sim = currentSim().slice(0, 12);
  mountChart(root.querySelector<HTMLElement>('#dash-donut'), {
    type: 'donut',
    segments: INCOME_KEYS.map((k) => ({ key: k, label: t(`income.${k}`), color: seriesColor(k), value: r.income[k] })),
    format: (n) => money(n),
    center: money(r.gross),
    centerSub: t('common.gross'),
  });
  mountChart(root.querySelector<HTMLElement>('#dash-sim'), {
    type: 'stacked',
    labels: sim.map((m) => monthLabel(m.date)),
    series: incomeSeries(sim.map((m) => m.result)),
    line: { key: 'net', label: t('common.net'), color: seriesColor('net'), values: sim.map((m) => m.result.net) },
    format: (n) => money(n),
    height: 230,
  });
}

export const dashboardView: View = {
  render: body,
  mount: drawCharts,
  update(root) { root.innerHTML = body(); drawCharts(root); },
};

