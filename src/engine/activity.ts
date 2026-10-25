import { MIN_ACTIVATIONS, WEEKLY_MATCHING } from '../config/plan.ts';
import { activationVolume } from './calc.ts';
import type { ActivationEntry, ActivityHistory, PlanCounts, Prices } from './types.ts';

const DAY = 86_400_000;

const parse = (iso: string): Date | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const toIso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Whether an activation falls in the calendar month of `today`. Others aren't counted. */
export function inMonth(entry: ActivationEntry, today: Date): boolean {
  const d = parse(entry.date);
  return !!d && d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth();
}

export interface WeekCheck {
  /** Monday of the week (may fall in the previous month). */
  start: Date;
  personal: number;
  /** Direct Partners' production assumed for the week (spread evenly over the month's days). */
  directs: number;
  qualifies: boolean;
}

export interface DerivedActivity {
  counts: PlanCounts;
  /** Share of this month's activations that are first-ever activations (1 when there are none). */
  newShare: number;
  /** Quality of Business Index from the history (1 when there were no new Classic/Premium members). */
  qbi: number;
  /** Direct activation production in the longer Minimum Activations windows. */
  windows: { days: number; amount: number; required: number }[];
  longWindowMet: boolean;
  weeks: WeekCheck[];
  /** Share of the month's weeks that qualify for the Weekly Matching Bonus. */
  matchingShare: number;
}

/**
 * Turn the dated activations and the history numbers into the values the monthly calculation
 * uses. Months count as 30 days for the Minimum Activations windows. Weekly Matching is checked
 * week by week (Monday–Sunday) with your own dated activations; your direct Partners' activations
 * have no dates, so their production is spread evenly over the month — a simulation estimate.
 */
export function deriveActivity(
  log: ActivationEntry[], history: ActivityHistory, directsProduction: number, prices: Prices, today: Date,
): DerivedActivity {
  const month = log.filter((e) => inMonth(e, today));
  const counts: PlanCounts = { starter: 0, classic: 0, premium: 0 };
  month.forEach((e) => { counts[e.plan] += 1; });
  const newShare = month.length ? month.filter((e) => e.kind === 'new').length / month.length : 1;
  const qbi = history.qbiNew > 0 ? Math.min(1, history.qbiPaying / history.qbiNew) : 1;

  // Minimum Activations: this month + earlier months, for the 90/180/365-day windows.
  const now = activationVolume(counts, prices);
  const a12 = activationVolume(history.months1to2, prices);
  const a35 = activationVolume(history.months3to5, prices);
  const a611 = activationVolume(history.months6to11, prices);
  const amounts: Record<number, number> = { 90: now + a12, 180: now + a12 + a35, 365: now + a12 + a35 + a611 };
  const windows = MIN_ACTIVATIONS.filter((w) => w.days > 30).map((w) => ({ days: w.days, amount: amounts[w.days] ?? 0, required: w.amount }));
  const longWindowMet = windows.some((w) => w.amount >= w.required);

  // Weekly Matching, week by week.
  const first = new Date(today.getFullYear(), today.getMonth(), 1);
  const last = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const daysInMonth = last.getDate();
  const weeks: WeekCheck[] = [];
  for (let start = new Date(first.getTime() - ((first.getDay() + 6) % 7) * DAY); start <= last; start = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7)) {
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
    const personal = month.reduce((s, e) => {
      const d = parse(e.date)!;
      return d >= start && d <= end ? s + prices.activation[e.plan] : s;
    }, 0);
    const overlap = (Math.min(end.getTime(), last.getTime()) - Math.max(start.getTime(), first.getTime())) / DAY + 1;
    const directs = directsProduction * overlap / daysInMonth;
    weeks.push({ start, personal, directs, qualifies: personal >= WEEKLY_MATCHING.personalMin && directs >= WEEKLY_MATCHING.teamMin });
  }
  const matchingShare = weeks.filter((w) => w.qualifies).length / weeks.length;

  return { counts, newShare, qbi, windows, longWindowMet, weeks, matchingShare };
}
