import { en } from './en.ts';
import type { TKey } from './en.ts';
import { es } from './es.ts';
import { getState } from '../state/store.ts';
import type { Note } from '../engine/types.ts';

export type { TKey };

const dicts = { en, es };

const MONEY_PARAMS = new Set([
  'qp', 'tav', 'req', 'floor', 'bbv', 'min', 'rqp', 'max', 'personal', 'team', 'amount', 'waiver',
  'per100', 'rate', 'cap', 'have', 'need', 'pMin', 'tMin', 'costs',
]);

export const locale = (): string => (getState().lang === 'es' ? 'es-ES' : 'en-US');

export function t(key: TKey | string, params?: Record<string, string | number>): string {
  const lang = getState().lang;
  let s: string = (dicts[lang] as Record<string, string>)[key] ?? (en as Record<string, string>)[key] ?? key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

export function money(n: number, opts: { cents?: boolean } = {}): string {
  const cents = opts.cents ?? (Math.abs(n) < 100 && n % 1 !== 0);
  return new Intl.NumberFormat(locale(), {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0,
  }).format(n);
}

/** Lengths that can be chosen for Simulation and Goals: months up to 1½ years, then whole years up to 10. */
export const DURATIONS = [3, 6, 12, 18, 24, 36, 48, 60, 72, 84, 96, 108, 120];

/** "18 months", or "5 years" from two years on. */
export function durationLabel(months: number): string {
  return months >= 24 && months % 12 === 0 ? t('common.years', { n: months / 12 }) : t('common.months', { n: months });
}

export function num(n: number, digits = 0): string {
  return new Intl.NumberFormat(locale(), { maximumFractionDigits: digits }).format(n);
}

export function monthLabel(d: Date, style: 'short' | 'long' = 'short'): string {
  return new Intl.DateTimeFormat(locale(), { month: style, year: style === 'long' ? 'numeric' : '2-digit' }).format(d);
}

/** Translate an engine Note, formatting money params and plan names. */
export function noteText(n: Note): string {
  const params: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(n.params ?? {})) {
    if (k === 'plan') params[k] = t(`plans.${v}`);
    else if (typeof v === 'number' && MONEY_PARAMS.has(k)) params[k] = money(v);
    else params[k] = v;
  }
  return t(n.key, params);
}
