import { MEMBER_PLANS, MIN_ACTIVATIONS, rankIndex } from '../config/plan.ts';
import type { RankId } from '../config/plan.ts';
import { activationVolume, calcMonth, decideRank } from './calc.ts';
import type { CalcProfile, Leg, MonthResult, PlanCounts, Prices } from './types.ts';

/** Whole people at a regular pace: `count` new Partners every `every` months (e.g. 1 every 2). */
export interface Cadence { count: number; every: number }

/**
 * A typical month, repeated. Everything is in whole people and whole registrations:
 * no percentages of people leaving or growing.
 */
export interface SimAssumptions {
  months: number;
  /** Your new personal activations per month, by plan. */
  personalActivations: PlanCounts;
  /** New direct Partners you sponsor. */
  newPartners: Cadence;
  /** Activations each Partner makes per month, by plan. */
  partnerActivations: PlanCounts;
  /** New Partners each of your teams adds. */
  teamNewPartners: Cadence;
  /** Share of activations that are first-ever activations (for Builders Base Volume). */
  newMemberShare: number;
  /** Most new direct teams the simulation adds. */
  maxLegs: number;
  /** Optional losses, in whole people over time. */
  losses: Losses;
}

/**
 * People leaving, in whole people: `members` stop paying (you and each team lose them at that
 * pace) and `partners` stop (from your biggest team). Regular, or at random months averaging the
 * same pace; the randomness is seeded, so the same inputs always give the same result.
 */
export interface Losses { on: boolean; random: boolean; members: Cadence; partners: Cadence }

export const DEFAULT_ASSUMPTIONS: SimAssumptions = {
  months: 12,
  personalActivations: { starter: 0, classic: 0, premium: 0 },
  newPartners: { count: 0, every: 1 },
  partnerActivations: { starter: 0, classic: 0, premium: 0 },
  teamNewPartners: { count: 0, every: 1 },
  newMemberShare: 0.9,
  maxLegs: 10,
  losses: { on: false, random: false, members: { count: 1, every: 3 }, partners: { count: 1, every: 6 } },
};

interface SimLeg {
  joined: number;
  partners: number;
  members: PlanCounts;
}

export interface SimMonth {
  index: number;
  date: Date;
  result: MonthResult;
  payingMembers: number;
  teamPartners: number;
  legs: number;
}

/** Where the simulation starts: your paying members and existing teams (e.g. from Structure). */
export interface SimStart {
  members: PlanCounts;
  legs: { partners: number; members: PlanCounts }[];
}

export interface SimOptions {
  /** Month (0-based) that counts as the Fast Start month, or -1. */
  fastStartIndex: number;
  start: Date;
  /** Start from an existing business instead of from zero. */
  from?: SimStart;
}

const zero = (): PlanCounts => ({ starter: 0, classic: 0, premium: 0 });
const times = (c: PlanCounts, k: number): PlanCounts => ({ starter: c.starter * k, classic: c.classic * k, premium: c.premium * k });
const add = (a: PlanCounts, b: PlanCounts): PlanCounts => ({ starter: a.starter + b.starter, classic: a.classic + b.classic, premium: a.premium + b.premium });
const total = (c: PlanCounts) => c.starter + c.classic + c.premium;
const recurring = (members: PlanCounts, prices: Prices) => MEMBER_PLANS.reduce((s, p) => s + members[p] * prices.monthly[p], 0);
/** Whether a cadence adds people in month `m` (counting from its first month). */
const due = (c: Cadence, m: number) => c.count > 0 && m >= 0 && m % Math.max(1, c.every) === 0;

/** Small seeded random number generator (mulberry32): the same seed gives the same sequence. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let x = Math.imul(s ^ (s >>> 15), 1 | s);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** Remove up to n whole members, always from the plan with the most members. */
function removeMembers(c: PlanCounts, n: number): void {
  for (let i = 0; i < n; i++) {
    const p = MEMBER_PLANS.reduce((best, q) => (c[q] > c[best] ? q : best), MEMBER_PLANS[0]);
    if (c[p] <= 0) return;
    c[p] -= 1;
  }
}

/**
 * Month-by-month model in whole people. Your Members add up from your activations and pay
 * from the month after; new direct Partners join on their cadence, each starting a team that
 * adds Partners on the team cadence. Every Partner makes the same activations each month.
 * Without losses nobody leaves, so read the results as an upper bound. With losses, people leave
 * from the end of the first period on (e.g. "every 3 months" → months 3, 6, 9…). A team's own
 * rank is estimated from its production without the per-leg cap.
 */
export function simulate(a: SimAssumptions, profile: CalcProfile, prices: Prices, opts: SimOptions): SimMonth[] {
  const out: SimMonth[] = [];
  let members: PlanCounts = { ...zero(), ...opts.from?.members };
  // Existing teams count as joined before month 0; maxLegs only limits new ones.
  const legs: SimLeg[] = (opts.from?.legs ?? []).map((l) => ({ joined: -1, partners: l.partners, members: { ...l.members } }));
  const maxLegs = legs.length + a.maxLegs;
  const personalHistory: number[] = [];
  const loss = a.losses;
  const rand = seeded(20261);
  /** Whether people leave in month m: regularly at the end of each period, or at random at the same average pace. */
  const leaves = (c: Cadence, m: number) => loss.on && c.count > 0 && (loss.random ? rand() < 1 / Math.max(1, c.every) : (m + 1) % Math.max(1, c.every) === 0);

  for (let m = 0; m < a.months; m++) {
    if (leaves(loss.members, m)) {
      removeMembers(members, loss.members.count);
      legs.forEach((l) => removeMembers(l.members, loss.members.count));
    }
    if (leaves(loss.partners, m)) {
      for (let i = 0; i < loss.partners.count && legs.length; i++) {
        // From the biggest team; a team whose only Partner leaves is gone, with its members.
        const big = legs.reduce((b, l) => (l.partners > b.partners ? l : b), legs[0]);
        if (big.partners > 1) big.partners -= 1;
        else legs.splice(legs.indexOf(big), 1);
      }
    }
    // Teams grow first (not in the month they start), then new direct Partners join.
    legs.forEach((l) => { if (m > l.joined && due(a.teamNewPartners, m - l.joined - 1)) l.partners += a.teamNewPartners.count; });
    if (due(a.newPartners, m)) {
      for (let i = 0; i < a.newPartners.count && legs.length < maxLegs; i++) legs.push({ joined: m, partners: 1, members: zero() });
    }

    const personalNew = { ...a.personalActivations };
    const calcLegs: Leg[] = legs.map((l, i) => {
      const legRecurring = recurring(l.members, prices); // members from earlier months pay this month
      const head = { ...a.partnerActivations };
      const others = times(a.partnerActivations, l.partners - 1);
      const legNew = add(head, others);
      const legAct = activationVolume(legNew, prices);
      const rank = decideRank(legAct + legRecurring, [], legAct).paidRank;
      l.members = add(l.members, legNew);
      return {
        id: `leg${i + 1}`, label: `Team ${i + 1}`, rank,
        headActivations: head, otherActivationVolume: activationVolume(others, prices), recurringVolume: legRecurring,
      };
    });

    const personalAct = activationVolume(personalNew, prices);
    personalHistory.push(personalAct);
    const trailing = (n: number) => personalHistory.slice(-n).reduce((s, v) => s + v, 0);
    const longWindow = trailing(3) >= MIN_ACTIVATIONS[1].amount
      || trailing(6) >= MIN_ACTIVATIONS[2].amount
      || trailing(12) >= MIN_ACTIVATIONS[3].amount;

    const result = calcMonth({
      personalActivations: personalNew,
      personalPayingMembers: members,
      newMemberShare: a.newMemberShare,
      qbi: 1, // nobody stops paying in this model
      matchingWeeks: 'auto',
      minActivationsLongWindow: longWindow,
      legs: calcLegs,
    }, { ...profile, renewalCurrent: true, fastStartMonth: m === opts.fastStartIndex }, prices);

    members = add(members, personalNew);
    out.push({
      index: m,
      date: new Date(opts.start.getFullYear(), opts.start.getMonth() + m, 1),
      result,
      payingMembers: total(members) + legs.reduce((s, l) => s + total(l.members), 0),
      teamPartners: legs.reduce((s, l) => s + l.partners, 0),
      legs: legs.length,
    });
  }
  return out;
}

// ---------- Goal planner ----------

export type Goal = { kind: 'rank'; rank: RankId } | { kind: 'income'; net: number };
export type GoalStyle = 'personal' | 'balanced' | 'team';

/** A plan's shape as average rates per month; the planner scales it and rounds to whole people. */
interface Shape { personal: PlanCounts; partners: number; partner: PlanCounts; team: number }

/**
 * The shape of a monthly plan for each style. The planner finds the smallest multiple of it
 * that reaches the goal, in whole registrations and whole Partners.
 */
export const GOAL_STYLES: Record<GoalStyle, Shape> = {
  personal: { personal: { starter: 0, classic: 2, premium: 1 }, partners: 0.25, partner: { starter: 0, classic: 1, premium: 0 }, team: 0 },
  balanced: { personal: { starter: 0, classic: 1, premium: 0.5 }, partners: 0.5, partner: { starter: 0, classic: 1, premium: 0.25 }, team: 0.25 },
  team: { personal: { starter: 0, classic: 1, premium: 0 }, partners: 1, partner: { starter: 0, classic: 1, premium: 0.5 }, team: 0.5 },
};

const whole = (x: number) => Math.ceil(x - 1e-9);
/** Paces a person can plan with (the same choices as the Simulation form). */
export const CADENCE_MONTHS = [1, 2, 3, 4, 6, 12];
/** A rate per month as whole people: n per month, or 1 every 2/3/4/6/12 months. Rounded up. */
export function toCadence(rate: number): Cadence {
  if (rate <= 1e-9) return { count: 0, every: 1 };
  if (rate >= 1) return { count: whole(rate), every: 1 };
  const every = [...CADENCE_MONTHS].reverse().find((n) => 1 / n >= rate - 1e-9) ?? 1;
  return { count: 1, every };
}
const wholeCounts = (c: PlanCounts): PlanCounts => ({ starter: whole(c.starter), classic: whole(c.classic), premium: whole(c.premium) });

/** The style's shape scaled by k, in whole registrations and whole Partners. */
function planAt(style: GoalStyle, k: number, months: number): SimAssumptions {
  const s = GOAL_STYLES[style];
  return {
    ...DEFAULT_ASSUMPTIONS, months,
    personalActivations: wholeCounts(times(s.personal, k)),
    newPartners: toCadence(s.partners * k),
    partnerActivations: wholeCounts(times(s.partner, k)),
    teamNewPartners: toCadence(s.team * k),
  };
}

export interface GoalPlan {
  /** The whole-number monthly plan that reaches the goal, or null if none does. */
  plan: SimAssumptions | null;
  /** Month by month with that plan, up to the deadline. */
  months: SimMonth[];
  /** Month index the goal is reached, or null. */
  reachedIn: number | null;
  /** First month each new rank is reached along the way. */
  milestones: { index: number; rank: RankId }[];
}

function hits(goal: Goal, m: SimMonth): boolean {
  return goal.kind === 'rank'
    ? rankIndex(m.result.qpRank) >= rankIndex(goal.rank)
    : m.result.net >= goal.net;
}

/**
 * Find the smallest whole-number monthly plan of the chosen style that reaches the goal within
 * `deadline` months (bisection on a multiplier of the style's shape), then lay it out month by month.
 */
export function planGoal(goal: Goal, style: GoalStyle, deadline: number, profile: CalcProfile, prices: Prices, opts: SimOptions): GoalPlan {
  const run = (a: SimAssumptions) => simulate(a, profile, prices, opts);
  const reaches = (a: SimAssumptions) => run(a).some((m) => hits(goal, m));

  let plan: SimAssumptions | null = null;
  if (reaches(planAt(style, 0, deadline))) {
    plan = planAt(style, 0, deadline); // already there with what you have
  } else {
    let hi = 1;
    while (!reaches(planAt(style, hi, deadline)) && hi < 64) hi *= 2;
    if (reaches(planAt(style, hi, deadline))) {
      let lo = hi === 1 ? 0 : hi / 2;
      for (let i = 0; i < 16; i++) {
        const mid = (lo + hi) / 2;
        if (reaches(planAt(style, mid, deadline))) hi = mid; else lo = mid;
      }
      plan = planAt(style, hi, deadline);
    }
  }

  if (!plan) return { plan: null, months: [], reachedIn: null, milestones: [] };
  const months = run(plan);
  const hit = months.findIndex((m) => hits(goal, m));
  const milestones: GoalPlan['milestones'] = [];
  let best = -1;
  months.forEach((m, i) => {
    const r = rankIndex(m.result.qpRank);
    if (r > best && m.result.qpRank !== 'none') { milestones.push({ index: i, rank: m.result.qpRank }); best = r; }
  });
  return { plan, months, reachedIn: hit >= 0 ? hit : null, milestones };
}
