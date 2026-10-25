import { MEMBERSHIP_POINTS, MEMBER_PLANS, PARTNER_RENEWAL, PLAN_PRICES } from '../config/plan.ts';
import { toIso } from '../engine/activity.ts';
import type { MemberPlan, RankId } from '../config/plan.ts';
import { DEFAULT_ASSUMPTIONS } from '../engine/simulate.ts';
import type { GoalStyle, SimAssumptions, SimOptions } from '../engine/simulate.ts';
import { structureStart } from '../engine/team.ts';
import type { ActivationEntry, ActivityHistory, BusinessMonth, CalcProfile, Leg, PartnerNode, PlanCounts } from '../engine/types.ts';

export type Lang = 'en' | 'es';

export interface Profile {
  isMember: boolean;
  isPartner: boolean;
  memberPlan: MemberPlan;
  /** ISO date (yyyy-mm-dd) the Partnership was activated. Renewals fall every 6 months from it. */
  partnerSince: string;
  /** ISO date the paid membership started. Used to estimate Reward Points. */
  memberSince: string;
}

export interface GoalState {
  kind: 'rank' | 'income'; rank: RankId; net: number; deadline: number;
  style: GoalStyle;
  /** Start from your current Structure instead of from zero. */
  fromStructure: boolean;
}

/** Simulation settings: the monthly assumptions plus where to start from. */
export type SimSettings = SimAssumptions & { fromStructure: boolean };

export interface AppState {
  version: 1;
  lang: Lang;
  disclaimerAccepted: boolean;
  /** The welcome profile setup has been completed once. */
  onboarded: boolean;
  profile: Profile;
  month: BusinessMonth;
  sim: SimSettings;
  goal: GoalState;
}

const STORAGE_KEY = 'comp-plan-simulator:v1';
const zero = (): PlanCounts => ({ starter: 0, classic: 0, premium: 0 });

export const newPartner = (name: string): PartnerNode => ({
  id: `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
  name,
  activations: zero(),
  payingMembers: zero(),
  restActivationVolume: 0,
  restRecurringVolume: 0,
  children: [],
});

export const emptyHistory = (): ActivityHistory => ({ months1to2: zero(), months3to5: zero(), months6to11: zero(), qbiNew: 0, qbiPaying: 0 });

export function newActivation(date: string): ActivationEntry {
  return { id: `a-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, date, plan: 'classic', kind: 'new' };
}

type OldMonth = Partial<BusinessMonth> & {
  legs?: Leg[];
  personalActivations?: PlanCounts;
  newMemberShare?: unknown; qbi?: unknown; matchingWeeks?: unknown; minActivationsLongWindow?: unknown;
};

/**
 * Bring a month saved by an older version up to date: a flat list of teams ("legs") becomes
 * Partners, and activation counts become dated entries on the 1st of this month.
 */
function migrateMonth(m: BusinessMonth): BusinessMonth {
  const old = m as OldMonth;
  if (Array.isArray(old.legs)) {
    if (!old.team?.length) {
      old.team = old.legs.map((l) => ({
        ...newPartner(l.label), id: l.id, activations: l.headActivations,
        restActivationVolume: l.otherActivationVolume, restRecurringVolume: l.recurringVolume,
      }));
    }
    delete old.legs;
  }
  if (old.personalActivations) {
    if (!old.activationLog?.length) {
      const d = new Date();
      const first = toIso(new Date(d.getFullYear(), d.getMonth(), 1));
      old.activationLog = MEMBER_PLANS.flatMap((p) => Array.from({ length: old.personalActivations![p] }, () => ({ ...newActivation(first), plan: p })));
    }
    delete old.personalActivations;
  }
  delete old.newMemberShare; delete old.qbi; delete old.matchingWeeks; delete old.minActivationsLongWindow;
  old.activationLog ??= [];
  old.history = { ...emptyHistory(), ...old.history };
  old.team ??= [];
  return old as BusinessMonth;
}

export function defaultState(): AppState {
  return {
    version: 1,
    lang: navigator.language?.toLowerCase().startsWith('es') ? 'es' : 'en',
    disclaimerAccepted: false,
    onboarded: false,
    // Nothing is chosen until the welcome setup; memberPlan only counts once isMember is on.
    profile: { isMember: false, isPartner: false, memberPlan: 'classic', partnerSince: '', memberSince: '' },
    month: {
      activationLog: [],
      personalPayingMembers: zero(),
      history: emptyHistory(),
      team: [],
    },
    sim: { ...structuredClone(DEFAULT_ASSUMPTIONS), fromStructure: true },
    goal: { kind: 'rank', rank: 'md', net: 1000, deadline: 12, style: 'balanced', fromStructure: true },
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

/** Remove fields older versions saved that no longer exist (editable prices, TLB month count, theme). */
function dropRemoved(s: AppState): AppState {
  const loose = s as unknown as Record<string, unknown>;
  delete loose.prices;
  delete loose.theme;
  delete (s.profile as unknown as Record<string, unknown>).tlbMonths;
  delete (s.profile as unknown as Record<string, unknown>).lastRenewal;
  s.month = migrateMonth(s.month);
  delete loose.scenarios;
  // The simulation used to work with percentages of people leaving and growing.
  const oldSim = s.sim as unknown as Record<string, unknown>;
  ['startingMembers', 'personalGrowth', 'churn', 'partnerDropout', 'teamGrowth', 'newPartnersPerMonth'].forEach((k) => delete oldSim[k]);
  // New Partners in Simulation are entered per month only (a pace is used just for people leaving).
  s.sim.newPartners.every = 1;
  s.sim.teamNewPartners.every = 1;
  return s;
}

function load(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return dropRemoved(merge(defaultState(), JSON.parse(raw)));
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
  state = dropRemoved(merge(defaultState(), next));
  emit('*');
}

export function resetAll(): void {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  const keep = { lang: state.lang };
  state = { ...defaultState(), ...keep, disclaimerAccepted: true };
  emit('*');
}

// ---------- Derived values ----------

const parseDate = (iso: string): Date | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, d.getDate());

/** Whole months from `from` to `to` (0 until the first monthly anniversary). */
function fullMonths(from: Date, to: Date): number {
  let n = (to.getFullYear() - from.getFullYear()) * 12 + to.getMonth() - from.getMonth();
  if (to.getDate() < from.getDate()) n -= 1;
  return Math.max(0, n);
}

/**
 * Days until the next $95 Partner renewal is due, or null without a Partner-since date.
 * Assumes every renewal so far was paid on time, every 6 months from the activation date.
 */
export function renewalDaysLeft(s: AppState = state, today = new Date()): number | null {
  const d = parseDate(s.profile.partnerSince);
  if (!d) return null;
  const cycles = Math.floor(fullMonths(d, today) / PARTNER_RENEWAL.months) + 1;
  const due = addMonths(d, cycles * PARTNER_RENEWAL.months);
  return Math.ceil((due.getTime() - today.getTime()) / 86_400_000);
}

export interface PointsEstimate { points: number; months: number; first: number; perMonth: number }

/**
 * Rough Reward Points collected from the membership: the first-payment points plus the monthly
 * points for every monthly payment since. Points already used and other awards aren't counted.
 */
export function estimatedRewardPoints(s: AppState = state, today = new Date()): PointsEstimate | null {
  const d = parseDate(s.profile.memberSince);
  if (!s.profile.isMember || !d || d > today) return null;
  const plan = s.profile.memberPlan;
  const months = fullMonths(d, today);
  const first = MEMBERSHIP_POINTS[plan].firstPayment;
  const perMonth = PLAN_PRICES.monthly[plan] * MEMBERSHIP_POINTS[plan].perMonthlyDollar;
  return { points: first + months * perMonth, months, first, perMonth };
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

/** Simulation options; `fromStructure` starts from your current paying members and teams. */
export function simOptions(s: AppState = state, fromStructure = false, today = new Date()): SimOptions {
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  const fs = fastStartDate(s);
  const idx = fs ? (fs.getFullYear() - start.getFullYear()) * 12 + fs.getMonth() - start.getMonth() : -1;
  return { start, fastStartIndex: idx >= 0 ? idx : -1, from: fromStructure ? structureStart(s.month, PLAN_PRICES) : undefined };
}

// ---------- Export / import ----------

export function exportJson(): string {
  return JSON.stringify(state, null, 2);
}

export function importJson(text: string): void {
  const data = JSON.parse(text);
  if (!data || typeof data !== 'object' || !('month' in data)) throw new Error('invalid');
  replaceState(data as AppState);
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
