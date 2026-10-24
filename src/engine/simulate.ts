import { MEMBER_PLANS, MIN_ACTIVATIONS, rankIndex } from '../config/plan.ts';
import type { RankId } from '../config/plan.ts';
import { activationVolume, calcMonth, decideRank } from './calc.ts';
import type { CalcProfile, Leg, MonthResult, PlanCounts, Prices } from './types.ts';

export interface SimAssumptions {
  months: number;
  /** Your new personal activations per month, by plan. */
  personalActivations: PlanCounts;
  /** Direct members already paying when the simulation starts. */
  startingMembers: PlanCounts;
  /** Monthly change of your personal activity, e.g. 0.05 = +5% a month. */
  personalGrowth: number;
  /** Share of paying members who stop paying each month. */
  churn: number;
  /** New direct Partners you add per month (fractions allowed — 0.5 = one every two months). */
  newPartnersPerMonth: number;
  /** Activations an average Partner produces per month, by plan. */
  partnerActivations: PlanCounts;
  /** Monthly growth of the number of active Partners inside each team. */
  teamGrowth: number;
  /** Share of Partners in a team who stop being active each month. */
  partnerDropout: number;
  /** Share of activations that are first-ever activations. */
  newMemberShare: number;
  /** Most direct teams the simulation keeps adding. */
  maxLegs: number;
}

export const DEFAULT_ASSUMPTIONS: SimAssumptions = {
  months: 12,
  personalActivations: { starter: 0, classic: 0, premium: 0 },
  startingMembers: { starter: 0, classic: 0, premium: 0 },
  personalGrowth: 0,
  churn: 0.1,
  newPartnersPerMonth: 0,
  partnerActivations: { starter: 0, classic: 0, premium: 0 },
  teamGrowth: 0,
  partnerDropout: 0.1,
  newMemberShare: 0.9,
  maxLegs: 10,
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

export interface SimOptions {
  /** Month (0-based) that counts as the Fast Start month, or -1. */
  fastStartIndex: number;
  start: Date;
}

const scale = (c: PlanCounts, k: number): PlanCounts => ({ starter: c.starter * k, classic: c.classic * k, premium: c.premium * k });
const add = (a: PlanCounts, b: PlanCounts): PlanCounts => ({ starter: a.starter + b.starter, classic: a.classic + b.classic, premium: a.premium + b.premium });
const total = (c: PlanCounts) => c.starter + c.classic + c.premium;
const mul = (members: PlanCounts, prices: Prices) => MEMBER_PLANS.reduce((s, p) => s + members[p] * prices.monthly[p], 0);

/**
 * Month-by-month model. Members accumulate from activations and leave at the churn rate;
 * monthly payments start the month after activation. Each direct team grows by `teamGrowth`
 * and loses Partners at `partnerDropout`. A team's own rank is estimated from its production
 * without the per-leg cap, so it is an approximation.
 */
export function simulate(a: SimAssumptions, profile: CalcProfile, prices: Prices, opts: SimOptions): SimMonth[] {
  const out: SimMonth[] = [];
  let members: PlanCounts = { ...a.startingMembers };
  const legs: SimLeg[] = [];
  let partnerAccumulator = 0;
  const personalHistory: number[] = [];
  const qbi = Math.pow(1 - a.churn, 3);

  for (let m = 0; m < a.months; m++) {
    // New direct partners
    partnerAccumulator += a.newPartnersPerMonth;
    while (partnerAccumulator >= 1 && legs.length < a.maxLegs) {
      legs.push({ joined: m, partners: 1, members: { starter: 0, classic: 0, premium: 0 } });
      partnerAccumulator -= 1;
    }
    if (legs.length >= a.maxLegs) partnerAccumulator = 0;

    const growth = Math.pow(1 + a.personalGrowth, m);
    const personalNew = scale(a.personalActivations, growth);
    // Recurring comes from members who were already paying; churn applies first.
    members = scale(members, 1 - a.churn);

    const calcLegs: Leg[] = legs.map((l, i) => {
      if (m > l.joined) l.partners = l.partners * (1 + a.teamGrowth) * (1 - a.partnerDropout);
      l.members = scale(l.members, 1 - a.churn);
      const recurring = mul(l.members, prices);
      const headShare = Math.min(1, l.partners);
      const head = scale(a.partnerActivations, headShare);
      const others = scale(a.partnerActivations, Math.max(0, l.partners - headShare));
      const otherVolume = activationVolume(others, prices);
      const legNew = add(head, others);
      const legAct = activationVolume(legNew, prices);
      const rank = decideRank(legAct + recurring, [], legAct).paidRank;
      l.members = add(l.members, legNew);
      return {
        id: `leg${i + 1}`, label: `Team ${i + 1}`, rank,
        headActivations: head, otherActivationVolume: otherVolume, recurringVolume: recurring,
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
      qbi,
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

/** Multiply every activity input (activations, new Partners) by k. */
export function scaleActivity(a: SimAssumptions, k: number): SimAssumptions {
  return {
    ...a,
    personalActivations: scale(a.personalActivations, k),
    partnerActivations: scale(a.partnerActivations, k),
    newPartnersPerMonth: a.newPartnersPerMonth * k,
  };
}

export type Goal = { kind: 'rank'; rank: RankId } | { kind: 'income'; net: number };

export interface GoalResult {
  reachedIn: number | null;          // month index with current assumptions
  factor: number | null;              // activity multiplier needed to reach it by the deadline
  scaled: SimAssumptions | null;
}

function hits(goal: Goal, m: SimMonth): boolean {
  return goal.kind === 'rank'
    ? rankIndex(m.result.qpRank) >= rankIndex(goal.rank)
    : m.result.net >= goal.net;
}

/**
 * When does the goal happen with the current assumptions, and how much more activity
 * would reach it by `deadline` (month count)? Uses bisection on an activity multiplier.
 */
export function planGoal(goal: Goal, a: SimAssumptions, deadline: number, profile: CalcProfile, prices: Prices, opts: SimOptions): GoalResult {
  const base = simulate({ ...a, months: Math.max(a.months, deadline) }, profile, prices, opts);
  const hit = base.findIndex((m) => hits(goal, m));
  const reachedIn = hit >= 0 ? hit : null;

  const reachesBy = (k: number) => simulate({ ...scaleActivity(a, k), months: deadline }, profile, prices, opts).some((m) => hits(goal, m));
  const hasActivity = total(a.personalActivations) + total(a.partnerActivations) + a.newPartnersPerMonth > 0;
  if (!hasActivity) return { reachedIn, factor: null, scaled: null };

  let hi = 1;
  while (!reachesBy(hi) && hi < 64) hi *= 2;
  if (!reachesBy(hi)) return { reachedIn, factor: null, scaled: null };
  let lo = hi === 1 ? 0 : hi / 2;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    if (reachesBy(mid)) hi = mid; else lo = mid;
  }
  return { reachedIn, factor: hi, scaled: scaleActivity(a, hi) };
}
