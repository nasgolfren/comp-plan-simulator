import { PLAN_PRICES } from '../../config/plan.ts';
import { inMonth, toIso } from '../../engine/activity.ts';
import { eventsForMonth } from '../../engine/calendar.ts';
import type { CalEvent, CalendarInput } from '../../engine/calendar.ts';
import { monthActivity } from '../../engine/team.ts';
import { locale, money, t } from '../../i18n/index.ts';
import { getState } from '../../state/store.ts';
import { esc, icon } from '../dom.ts';
import { currentMonth, seriesColor } from './results.ts';

// The month shown and the selected day (memory only).
const view = { year: new Date().getFullYear(), month: new Date().getMonth(), selected: toIso(new Date()) };

const parse = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T00:00:00`) : null);

function input(): CalendarInput {
  const s = getState();
  const today = new Date();
  return {
    today,
    isMember: s.profile.isMember,
    isPartner: s.profile.isPartner,
    memberPlan: s.profile.memberPlan,
    memberSince: parse(s.profile.memberSince),
    partnerSince: parse(s.profile.partnerSince),
    activations: s.month.activationLog.filter((e) => inMonth(e, today)),
    weeks: monthActivity(s.month, PLAN_PRICES, today).activity.weeks,
    income: currentMonth().income,
  };
}

const PLAN_COLOR = { starter: '#aab6ca', classic: 'var(--brand)', premium: 'var(--accent)' } as const;
const color = (e: CalEvent) => (e.kind === 'activation' ? PLAN_COLOR[e.params.plan as keyof typeof PLAN_COLOR]
  : e.kind === 'payout' ? seriesColor(e.key as never) : e.kind === 'payment' ? 'var(--bad)' : 'var(--muted)');
const title = (e: CalEvent) => (e.kind === 'activation' ? `${t(`plans.${e.params.plan}`)} · ${t(`calc.kind.${e.params.type}`)}`
  : e.kind === 'payout' ? t(`income.${e.key}`) : t(`cal.ev.${e.key}`));
const short = (e: CalEvent) => (e.kind === 'activation' ? t(`plans.${e.params.plan}`) : t(`cal.short.${e.key}`));
// Activation production isn't money in or out, so it has no sign.
const signed = (e: CalEvent) => (e.kind === 'payout' ? `+${money(e.amount)}` : e.kind === 'payment' ? `−${money(e.amount)}` : money(e.amount));

function detail(e: CalEvent): string {
  const p = e.params;
  const monthName = (ms: number) => new Intl.DateTimeFormat(locale(), { month: 'long', year: 'numeric' }).format(new Date(ms));
  const dayName = (d: Date) => new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'long' }).format(d);
  if (e.key === 'activation') return t('cal.detail.activation', { amount: money(e.amount) });
  if (e.key === 'dab') return t('cal.detail.dab', { plan: t(`plans.${p.plan}`), date: dayName(new Date(`${p.day}T00:00:00`)) });
  if (e.key === 'matching') return t('cal.detail.matching', { date: dayName(new Date(Number(p.week))) });
  if (e.key === 'membership') return p.first ? t('cal.detail.membershipFirst', { plan: t(`plans.${p.plan}`) }) : t('cal.detail.membership', { plan: t(`plans.${p.plan}`) });
  if (e.key === 'renewal') return t('cal.detail.renewal');
  if (e.key === 'close') return t('cal.detail.close', { month: monthName(Number(p.month)) });
  return t('cal.detail.monthly', { month: monthName(Number(p.month)) });
}

export function calendarPanel(): string {
  const c = input();
  const events = eventsForMonth(view.year, view.month, c);
  const byDay = new Map<string, CalEvent[]>();
  events.forEach((e) => { const k = toIso(e.date); byDay.set(k, [...(byDay.get(k) ?? []), e]); });

  const first = new Date(view.year, view.month, 1);
  const lead = (first.getDay() + 6) % 7; // Monday first
  const days = new Date(view.year, view.month + 1, 0).getDate();
  const todayIso = toIso(new Date());
  const fmtMonth = new Intl.DateTimeFormat(locale(), { month: 'long', year: 'numeric' }).format(first);
  const weekdays = Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(locale(), { weekday: 'short' }).format(new Date(2024, 0, 1 + i)));
  const incoming = events.filter((e) => e.kind === 'payout').reduce((s, e) => s + e.amount, 0);
  const outgoing = events.filter((e) => e.kind === 'payment').reduce((s, e) => s + e.amount, 0);

  const cells: string[] = [];
  for (let i = 0; i < lead; i++) cells.push('<div class="cal-cell is-pad" aria-hidden="true"></div>');
  for (let d = 1; d <= days; d++) {
    const iso = toIso(new Date(view.year, view.month, d));
    const ev = byDay.get(iso) ?? [];
    const label = new Intl.DateTimeFormat(locale(), { dateStyle: 'full' }).format(new Date(view.year, view.month, d));
    cells.push(`<button type="button" class="cal-cell${iso === todayIso ? ' is-today' : ''}${iso === view.selected ? ' is-selected' : ''}" data-day="${iso}" aria-pressed="${iso === view.selected}" aria-label="${esc(label)}${ev.length ? `: ${ev.length}` : ''}">
      <span class="cal-num">${d}</span>
      <span class="cal-chips">${ev.slice(0, 3).map((e) => `<span class="cal-chip ${e.kind}" style="--c:${color(e)}"><span class="truncate">${esc(short(e))}</span>${e.amount ? `<span class="num">${esc(signed(e))}</span>` : ''}</span>`).join('')}
        ${ev.length > 3 ? `<span class="cal-more">+${ev.length - 3}</span>` : ''}</span>
      <span class="cal-dots" aria-hidden="true">${ev.slice(0, 4).map((e) => `<i style="background:${color(e)}"></i>`).join('')}</span>
    </button>`);
  }

  const sel = parse(view.selected);
  const selEvents = byDay.get(view.selected) ?? [];
  const selInView = sel && sel.getFullYear() === view.year && sel.getMonth() === view.month;

  return `
    <div class="flex flex-wrap items-start justify-between gap-3 mb-4">
      <div><h2 id="cal-h">${esc(t('cal.title'))}</h2><p class="hint mt-0.5 max-w-[70ch]">${esc(t('cal.hint'))}</p></div>
      <div class="flex items-center gap-1.5">
        <button type="button" class="btn btn-sm icon-btn" data-cal="prev" aria-label="${esc(t('cal.prev'))}"><span class="rotate-180 inline-flex">${icon('chevron', 16)}</span></button>
        <button type="button" class="btn btn-sm" data-cal="today">${esc(t('cal.today'))}</button>
        <button type="button" class="btn btn-sm icon-btn" data-cal="next" aria-label="${esc(t('cal.next'))}">${icon('chevron', 16)}</button>
      </div>
    </div>
    <div class="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 mb-3">
      <p class="font-display text-2xl font-bold uppercase" aria-live="polite">${esc(fmtMonth)}</p>
      <p class="text-sm text-ink-2"><span class="text-good font-semibold num">+${money(incoming)}</span> ${esc(t('cal.in'))} · <span class="text-bad font-semibold num">−${money(outgoing)}</span> ${esc(t('cal.out'))}</p>
    </div>
    <div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div>
        <div class="cal-grid cal-head" aria-hidden="true">${weekdays.map((w) => `<span>${esc(w)}</span>`).join('')}</div>
        <div class="cal-grid" role="group" aria-labelledby="cal-h">${cells.join('')}</div>
        ${events.length ? `<div class="legend mt-3">${[...new Map(events.map((e) => [e.kind === 'activation' ? `a-${e.params.plan}` : e.key, e])).values()]
          .map((e) => `<span><i style="background:${color(e)}"></i>${esc(e.kind === 'activation' ? t('cal.legendActivation', { plan: t(`plans.${e.params.plan}`) }) : title(e))}</span>`).join('')}</div>` : ''}
      </div>
      <div class="cal-detail" aria-live="polite">
        <p class="eyebrow">${sel ? esc(new Intl.DateTimeFormat(locale(), { dateStyle: 'full' }).format(sel)) : ''}</p>
        ${selInView && selEvents.length ? `<ul class="grid gap-2 mt-2">${selEvents.map((e) => `
          <li class="cal-item" style="--c:${color(e)}">
            <div class="flex items-baseline justify-between gap-3"><span class="font-semibold">${esc(title(e))}</span>${e.amount ? `<span class="num font-bold ${e.kind === 'payout' ? 'text-good' : e.kind === 'payment' ? 'text-bad' : 'text-ink-2'}">${esc(signed(e))}</span>` : ''}</div>
            <p class="hint mt-0.5">${esc(detail(e))}</p>
          </li>`).join('')}</ul>` : `<p class="hint mt-2">${esc(t('cal.noEvents'))}</p>`}
      </div>
    </div>`;
}

/** Handles navigation and day clicks; returns true when the panel needs re-rendering. */
export function calendarClick(target: HTMLElement): boolean {
  const nav = target.closest<HTMLElement>('[data-cal]');
  if (nav) {
    const a = nav.dataset.cal;
    if (a === 'today') { const n = new Date(); view.year = n.getFullYear(); view.month = n.getMonth(); view.selected = toIso(n); }
    else {
      const d = new Date(view.year, view.month + (a === 'next' ? 1 : -1), 1);
      view.year = d.getFullYear(); view.month = d.getMonth(); view.selected = toIso(d);
    }
    return true;
  }
  const day = target.closest<HTMLElement>('[data-day]');
  if (day) { view.selected = day.dataset.day!; return true; }
  return false;
}
