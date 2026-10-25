import { MEMBERSHIP_FREE, PLAN_PRICES, rankById } from '../../config/plan.ts';
import type { RankId } from '../../config/plan.ts';
import { INCOME_KEYS } from '../../engine/types.ts';
import type { IncomeKey, MonthResult, Note } from '../../engine/types.ts';
import { money, noteText, t } from '../../i18n/index.ts';
import { calcMonth } from '../../engine/calc.ts';
import { simulate } from '../../engine/simulate.ts';
import { toMonthInput } from '../../engine/team.ts';
import { calcProfile, getState, simOptions } from '../../state/store.ts';
import { esc, icon } from '../dom.ts';

export const seriesColor = (k: IncomeKey | 'net') => `var(--s-${k})`;

export const rankName = (id: RankId, short = false): string =>
  id === 'none' ? t('rank.none') : short ? rankById(id).short : rankById(id).name;

export function currentMonth(): MonthResult {
  const s = getState();
  return calcMonth(toMonthInput(s.month, PLAN_PRICES), calcProfile(s), PLAN_PRICES);
}

export function currentSim() {
  const s = getState();
  return simulate(s.sim, { ...calcProfile(s), fastStartMonth: false }, PLAN_PRICES, simOptions(s));
}

export function noteHtml(n: Note): string {
  const tone = n.tone === 'warn' ? 'note-warn' : n.tone === 'good' ? 'note-good' : 'note-info';
  const ic = n.tone === 'warn' ? 'alert' : n.tone === 'good' ? 'check' : 'info';
  return `<div class="note ${tone}">${icon(ic, 16)}<span>${esc(noteText(n))}</span></div>`;
}

/** Expandable rows: each income source with the reason behind its amount. */
export function incomeLines(r: MonthResult, openFirst = false): string {
  return `<div>${r.lines.map((l, i) => `
    <details class="line-item" ${openFirst && i === 0 ? 'open' : ''}>
      <summary>
        <span class="swatch" style="background:${seriesColor(l.key)}" aria-hidden="true"></span>
        <span class="font-medium">${esc(t(`income.${l.key}`))}</span>
        <span class="amount ${l.amount === 0 ? 'zero' : ''}">${money(l.amount)}</span>
        ${icon('chevron', 16, 'chev')}
      </summary>
      <div class="explain">${l.notes.length ? l.notes.map((n) => `<p>${esc(noteText(n))}</p>`).join('') : '<p>—</p>'}</div>
    </details>`).join('')}
  </div>`;
}

/**
 * Membership Free, always shown: highlighted when this month's direct production qualifies,
 * greyed out with what's missing when it doesn't.
 */
export function membershipFreeBox(r: MonthResult): string {
  const p = getState().profile;
  const min = MEMBERSHIP_FREE.directProductionMin;
  const points = p.isMember && p.memberPlan === 'starter' ? MEMBERSHIP_FREE.starterRewardPoints : MEMBERSHIP_FREE.rewardPoints;
  const met = r.conditions.membershipFree;
  const detail = met
    ? p.isMember ? t('mf.metMember', { waiver: money(r.costs.membershipWaiver), points }) : t('mf.metPartner', { points })
    : t('mf.notMet', { min: money(min), have: money(r.production.directProduction), missing: money(min - r.production.directProduction) });
  return `<div class="mf-box ${met ? 'is-met' : ''}">
    <span class="mf-icon" aria-hidden="true">${icon(met ? 'check' : 'minus', 16)}</span>
    <div class="min-w-0"><p class="font-semibold">${esc(t('mf.title'))}</p><p class="text-sm">${esc(detail)}</p></div>
  </div>`;
}

export const isMembershipFreeNote = (n: Note) => n.key.startsWith('note.membershipFree');

export function costsAndNet(r: MonthResult): string {
  const row = (label: string, v: string, cls = '') => `<div class="flex justify-between gap-4 py-1.5 ${cls}"><span>${esc(label)}</span><span class="num">${v}</span></div>`;
  return `<div class="text-sm text-ink-2 border-t border-line pt-2">
    ${row(t('common.gross'), money(r.gross), 'font-semibold text-ink')}
    ${r.costs.renewal ? row(t('costs.renewal'), `− ${money(r.costs.renewal, { cents: true })}`) : ''}
    ${r.costs.membership ? row(t('costs.membership'), `− ${money(r.costs.membership)}`) : ''}
    ${r.costs.membershipWaiver ? row(t('costs.waiver'), `+ ${money(r.costs.membershipWaiver)}`, 'text-good') : ''}
  </div>
  <div class="flex justify-between items-baseline gap-4 border-t border-line pt-3 mt-1">
    <span class="font-display font-bold text-ink">${esc(t('common.net'))}</span>
    <span class="font-display font-bold text-2xl num ${r.net < 0 ? 'text-bad' : 'text-ink'}">${money(r.net, { cents: true })}</span>
  </div>`;
}

export function productionTable(r: MonthResult): string {
  const p = r.production;
  const rows: [string, number][] = [
    [t('prod.personalActivation'), p.personalActivation],
    [t('prod.personalRecurring'), p.personalRecurring],
    [t('prod.tav'), p.tav],
    [t('prod.qp'), p.qp],
    [t('prod.rqp'), p.rqp],
    [t('prod.bbv'), p.bbv],
  ];
  return `<table class="data-table"><tbody>${rows.map(([l, v]) => `<tr><td>${esc(l)}</td><td>${money(v)}</td></tr>`).join('')}</tbody></table>`;
}

export function incomeSeries(months: MonthResult[]) {
  return INCOME_KEYS.map((k) => ({ key: k, label: t(`income.${k}`), color: seriesColor(k), values: months.map((m) => m.income[k]) }))
    .filter((s) => s.values.some((v) => v > 0));
}
