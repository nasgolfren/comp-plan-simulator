import { DAB, PARTNER_RENEWAL, PAYOUT_SCHEDULE, PLAN_PRICES } from '../config/plan.ts';
import type { MemberPlan, PayoutKey } from '../config/plan.ts';
import type { WeekCheck } from './activity.ts';
import type { ActivationEntry, IncomeKey } from './types.ts';

export type CalEventKind = 'activation' | 'payout' | 'payment' | 'deadline';

export interface CalEvent {
  date: Date;
  kind: CalEventKind;
  /** Income source for payouts; 'membership' / 'renewal' for payments; 'close' for the month end. */
  key: IncomeKey | 'activation' | 'membership' | 'renewal' | 'close';
  /** For activations: activation production. For payouts and payments: money in or out. */
  amount: number;
  /** Values for the explanation text. */
  params: Record<string, string | number>;
}

export interface CalendarInput {
  today: Date;
  isMember: boolean;
  isPartner: boolean;
  memberPlan: MemberPlan;
  memberSince: Date | null;
  partnerSince: Date | null;
  /** This month's dated activations (already filtered to the month). */
  activations: ActivationEntry[];
  /** This month's Weekly Matching weeks. */
  weeks: WeekCheck[];
  /** This month's calculated income, paid out on the schedule dates. */
  income: Record<IncomeKey, number>;
}

const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const daysIn = (y: number, m: number) => new Date(y, m + 1, 0).getDate();

/** A scheduled day that falls on a weekend moves to the next business day (Guide p. 11). */
export function businessDay(d: Date): Date {
  const wd = d.getDay();
  return wd === 6 ? addDays(d, 2) : wd === 0 ? addDays(d, 1) : d;
}

/** The same day of the month as `anchor`, in month `m` of year `y` (clamped to short months). */
const monthlyOn = (anchor: Date, y: number, m: number) => new Date(y, m, Math.min(anchor.getDate(), daysIn(y, m)));

/**
 * Events in the month (`year`, `month`): payouts of this month's calculated income on their
 * schedule dates (some fall next month), membership and Partner renewal payments, and the
 * close of the production month. Payouts are only known for the current production month.
 */
export function eventsForMonth(year: number, month: number, c: CalendarInput): CalEvent[] {
  const out: CalEvent[] = [];
  const inView = (d: Date) => d.getFullYear() === year && d.getMonth() === month;
  const push = (e: CalEvent) => { if (inView(e.date)) out.push(e); };
  const prodY = c.today.getFullYear(), prodM = c.today.getMonth();
  const prodMonth = new Date(prodY, prodM, 1);

  // Payouts from this production month
  // Your direct activations on their day, and their DAB the day after
  c.activations.forEach((a) => {
    const d = new Date(`${a.date}T00:00:00`);
    push({ date: d, kind: 'activation', key: 'activation', amount: PLAN_PRICES.activation[a.plan], params: { plan: a.plan, type: a.kind } });
    push({ date: addDays(d, 1), kind: 'payout', key: 'dab', amount: DAB[a.plan], params: { plan: a.plan, day: a.date } });
  });
  const qualified = c.weeks.filter((w) => w.qualifies);
  if (c.income.matching > 0 && qualified.length) {
    const each = c.income.matching / qualified.length;
    qualified.forEach((w) => push({ date: addDays(w.start, 7), kind: 'payout', key: 'matching', amount: each, params: { week: w.start.getTime() } }));
  }
  // Monthly payout days, shown in every month so the schedule is always visible. Amounts are known
  // only for the payouts of this production month (paid next month); elsewhere they're 0.
  // Fast Start is a one-time bonus, so it only appears when it's earned.
  const known = year === prodY + Math.floor((prodM + 1) / 12) && month === (prodM + 1) % 12;
  (Object.keys(PAYOUT_SCHEDULE) as PayoutKey[]).forEach((k) => {
    const rule = PAYOUT_SCHEDULE[k];
    if (rule.kind !== 'monthly') return;
    const amount = known ? c.income[k] : 0;
    if (k === 'fastStart' && !(amount > 0)) return;
    push({ date: businessDay(new Date(year, month, rule.day)), kind: 'payout', key: k, amount, params: { month: new Date(year, month - 1, 1).getTime(), known: known ? 1 : 0 } });
  });
  push({ date: new Date(prodY, prodM + 1, 0), kind: 'deadline', key: 'close', amount: 0, params: { month: prodMonth.getTime() } });

  // Membership: monthly on the day the membership started (the first payment that day included)
  if (c.isMember && c.memberSince) {
    const d = monthlyOn(c.memberSince, year, month);
    if (d >= c.memberSince || sameDay(d, c.memberSince)) {
      const first = sameDay(d, c.memberSince);
      push({ date: d, kind: 'payment', key: 'membership', amount: first ? PLAN_PRICES.activation[c.memberPlan] : PLAN_PRICES.monthly[c.memberPlan], params: { plan: c.memberPlan, first: first ? 1 : 0 } });
    }
  }
  // Partner renewal: every 6 months from the activation date
  if (c.isPartner && c.partnerSince) {
    const n = (year - c.partnerSince.getFullYear()) * 12 + month - c.partnerSince.getMonth();
    if (n > 0 && n % PARTNER_RENEWAL.months === 0) {
      push({ date: monthlyOn(c.partnerSince, year, month), kind: 'payment', key: 'renewal', amount: PARTNER_RENEWAL.amount, params: {} });
    }
  }
  return out.sort((a, b) => a.date.getTime() - b.date.getTime() || a.kind.localeCompare(b.kind));
}
