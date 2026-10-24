import { KNOWN_PRICES, MEMBER_PLANS, PARTNER_RENEWAL } from '../config/plan.ts';
import type { MemberPlan, RankId } from '../config/plan.ts';
import { DEFAULT_ASSUMPTIONS } from '../engine/simulate.ts';
import type { SimAssumptions, SimOptions } from '../engine/simulate.ts';
import type { CalcProfile, Leg, MonthInput, PlanCounts, Prices } from '../engine/types.ts';

export type Lang = 'en' | 'es';
export type Theme = 'system' | 'light' | 'dark';

export interface Profile {
  isMember: boolean;
  isPartner: boolean;
  memberPlan: MemberPlan;
  /** ISO date (yyyy-mm-dd) the Partnership was activated. */
  partnerSince: string;
  /** ISO date of the last $95 Partner renewal payment. */
  lastRenewal: string;
  tlbMonths: number;
}

export type NullablePrices = Record<'activation' | 'monthly', Record<MemberPlan, number | null>>;

export interface GoalState { kind: 'rank' | 'income'; rank: RankId; net: number; deadline: number }

export interface Scenario {
  id: string;
  name: string;
  createdAt: string;
  month: MonthInput;
  sim: SimAssumptions;
}

export interface AppState {
  version: 1;
  lang: Lang;
  theme: Theme;
  disclaimerAccepted: boolean;
  profile: Profile;
  prices: NullablePrices;
  month: MonthInput;
  sim: SimAssumptions;
  goal: GoalState;
  scenarios: Scenario[];
}

const STORAGE_KEY = 'comp-plan-simulator:v1';
const zero = (): PlanCounts => ({ starter: 0, classic: 0, premium: 0 });

export const newLeg = (n: number): Leg => ({
  id: `leg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
  label: `Team ${n}`,
  rank: 'none',
  headActivations: zero(),
  otherActivationVolume: 0,
  recurringVolume: 0,
});

export function defaultState(): AppState {
  return {
    version: 1,
    lang: navigator.language?.toLowerCase().startsWith('es') ? 'es' : 'en',
    theme: 'system',
    disclaimerAccepted: false,
    profile: { isMember: true, isPartner: true, memberPlan: 'classic', partnerSince: '', lastRenewal: '', tlbMonths: 0 },
    prices: {
      activation: { starter: KNOWN_PRICES.starter.activation, classic: KNOWN_PRICES.classic.activation, premium: KNOWN_PRICES.premium.activation },
      monthly: { starter: KNOWN_PRICES.starter.monthly, classic: KNOWN_PRICES.classic.monthly, premium: KNOWN_PRICES.premium.monthly },
    },
    month: {
      personalActivations: zero(),
      personalPayingMembers: zero(),
      newMemberShare: 0.9,
      qbi: 0.7,
      matchingWeeks: 'auto',
      minActivationsLongWindow: false,
      legs: [],
    },
    sim: structuredClone(DEFAULT_ASSUMPTIONS),
    goal: { kind: 'rank', rank: 'md', net: 1000, deadline: 12 },
    scenarios: [],
  };
}

/** Deep-merge saved data over defaults so new fields added later get sensible values. */
function merge<T>(base: T, saved: unknown): T {
  if (Array.isArray(base)) return (Array.isArray(saved) ? saved : base) as T;
  if (base && typeof base === 'object') {
    if (!saved || typeof saved !== 'object') return base;
    const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
    for (const k of Object.keys(saved as object)) {
      const b = (base as Record<string, unknown>)[k];
      const s = (saved as Record<string, unknown>)[k];
      out[k] = b === undefined || b === null ? s : merge(b, s);
    }
    return out as T;
  }
  return (saved === undefined ? base : saved) as T;
}

function load(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return merge(defaultState(), JSON.parse(raw));
  } catch { /* storage blocked or corrupt — start fresh */ }
  return defaultState();
}

type Listener = (state: AppState, changed: string) => void;

let state: AppState = load();
const listeners = new Set<Listener>();

export const getState = (): AppState => state;

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function persist(): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

function emit(changed: string): void {
  persist();
  listeners.forEach((fn) => fn(state, changed));
}

export function update(mutator: (s: AppState) => void, changed = '*'): void {
  mutator(state);
  emit(changed);
}

/** Set a value by dotted path, e.g. "month.personalActivations.classic". */
export function setPath(path: string, value: unknown): void {
  const keys = path.split('.');
  let obj: Record<string, unknown> = state as unknown as Record<string, unknown>;
  for (let i = 0; i < keys.length - 1; i++) obj = obj[keys[i]] as Record<string, unknown>;
  obj[keys[keys.length - 1]] = value;
  emit(path);
}

export function getPath(path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], state);
}

export function replaceState(next: AppState): void {
  state = merge(defaultState(), next);
  emit('*');
}

export function resetAll(): void {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  const keep = { lang: state.lang, theme: state.theme };
  state = { ...defaultState(), ...keep, disclaimerAccepted: true };
  emit('*');
}

// ---------- Derived values ----------

export function missingPrices(s: AppState = state): string[] {
  const out: string[] = [];
  for (const kind of ['activation', 'monthly'] as const) {
    for (const p of MEMBER_PLANS) if (s.prices[kind][p] === null || Number.isNaN(s.prices[kind][p])) out.push(`${kind}.${p}`);
  }
  return out;
}

export function resolvedPrices(s: AppState = state): Prices {
  const fill = (r: Record<MemberPlan, number | null>) => ({ starter: r.starter ?? 0, classic: r.classic ?? 0, premium: r.premium ?? 0 });
  return { activation: fill(s.prices.activation), monthly: fill(s.prices.monthly) };
}

const parseDate = (iso: string): Date | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/** Days until the Partner renewal expires (negative = expired), or null if unknown. */
export function renewalDaysLeft(s: AppState = state, today = new Date()): number | null {
  const d = parseDate(s.profile.lastRenewal);
  if (!d) return null;
  const expires = new Date(d.getFullYear(), d.getMonth() + PARTNER_RENEWAL.months, d.getDate());
  return Math.ceil((expires.getTime() - today.getTime()) / 86_400_000);
}

/** The first full calendar month after activation is the Fast Start month. */
export function fastStartDate(s: AppState = state): Date | null {
  const d = parseDate(s.profile.partnerSince);
  return d ? new Date(d.getFullYear(), d.getMonth() + 1, 1) : null;
}

export function calcProfile(s: AppState = state, today = new Date()): CalcProfile {
  const days = renewalDaysLeft(s, today);
  const fs = fastStartDate(s);
  return {
    isMember: s.profile.isMember,
    isPartner: s.profile.isPartner,
    memberPlan: s.profile.memberPlan,
    renewalCurrent: days === null ? true : days >= 0,
    fastStartMonth: !!fs && fs.getFullYear() === today.getFullYear() && fs.getMonth() === today.getMonth(),
  };
}

export function simOptions(s: AppState = state, today = new Date()): SimOptions {
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  const fs = fastStartDate(s);
  const idx = fs ? (fs.getFullYear() - start.getFullYear()) * 12 + fs.getMonth() - start.getMonth() : -1;
  return { start, fastStartIndex: idx >= 0 ? idx : -1 };
}

// ---------- Export / import / share ----------

export function exportJson(): string {
  return JSON.stringify(state, null, 2);
}

export function importJson(text: string): void {
  const data = JSON.parse(text);
  if (!data || typeof data !== 'object' || !('month' in data)) throw new Error('invalid');
  replaceState(data as AppState);
}

const toBase64Url = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromBase64Url = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)));

export interface SharePayload { name: string; month: MonthInput; sim: SimAssumptions; prices: NullablePrices }

export function shareLink(name: string, month: MonthInput, sim: SimAssumptions): string {
  const payload: SharePayload = { name, month, sim, prices: state.prices };
  const url = new URL(location.href);
  url.hash = `#/share/${toBase64Url(JSON.stringify(payload))}`;
  return url.toString();
}

export function decodeShare(data: string): SharePayload | null {
  try {
    const p = JSON.parse(fromBase64Url(data));
    return p && p.month && p.sim ? p : null;
  } catch { return null; }
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
