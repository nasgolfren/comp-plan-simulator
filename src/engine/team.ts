import type { MemberPlan, RankId } from '../config/plan.ts';
import { deriveActivity, inMonth } from './activity.ts';
import type { DerivedActivity } from './activity.ts';
import { activationVolume, decideRank, recurringVolume } from './calc.ts';
import type { SimStart } from './simulate.ts';
import type { ActivationEntry, BusinessMonth, Leg, MonthInput, PartnerNode, PlanCounts, Prices } from './types.ts';

export interface NodeSummary {
  /** The Partner's activations this month, including the Partner-Members they sponsored this month. */
  activations: PlanCounts;
  /** The Partner's paying members, including the Partner-Members they sponsored before this month. */
  paying: PlanCounts;
  /** The Partner's own activation production. */
  ownActivation: number;
  /** The Partner's own direct members' monthly payments. */
  ownRecurring: number;
  /** Activation volume of the whole subtree, the Partner included. */
  teamActivation: number;
  /** Monthly payments of the whole subtree, the Partner included. */
  teamRecurring: number;
  /** Partners in the subtree below this one (not counting them). */
  size: number;
  rank: RankId;
}

const plus = (c: PlanCounts, plan: MemberPlan | null): PlanCounts => (plan ? { ...c, [plan]: c[plan] + 1 } : c);

/**
 * A Partner-Member's membership is their sponsor's production (Guide: Members and Partner-Members
 * count the same): a new activation when it started this month, a paying member when it started
 * earlier, nothing yet when the date is in the future or missing.
 */
export function membershipCounts(n: PartnerNode, today: Date): { activation: MemberPlan | null; paying: MemberPlan | null } {
  const m = n.membership;
  if (!m || !/^\d{4}-\d{2}-\d{2}$/.test(m.since)) return { activation: null, paying: null };
  if (inMonth({ id: '', date: m.since, plan: m.plan, kind: 'new' }, today)) return { activation: m.plan, paying: null };
  const started = new Date(`${m.since}T00:00:00`) < new Date(today.getFullYear(), today.getMonth(), 1);
  return { activation: null, paying: started ? m.plan : null };
}

/**
 * Summaries for every Partner in the tree, computed bottom-up. Each Partner's rank comes from
 * their own production plus their legs (direct children, and the unlisted rest as one more leg),
 * with the same rules as your own rank. Eligibility conditions (renewal, minimum activations)
 * aren't known for other Partners and are assumed met.
 */
export function summarizeTeam(team: PartnerNode[], prices: Prices, today = new Date()): Map<string, NodeSummary> {
  const out = new Map<string, NodeSummary>();
  const visit = (n: PartnerNode): NodeSummary => {
    const kids = n.children.map(visit);
    // The Partner-Members this Partner sponsored count as their activations / paying members.
    let activations = { ...n.activations };
    let paying = { ...n.payingMembers };
    n.children.forEach((c) => {
      const mc = membershipCounts(c, today);
      activations = plus(activations, mc.activation);
      paying = plus(paying, mc.paying);
    });
    const ownActivation = activationVolume(activations, prices);
    const ownRecurring = recurringVolume(paying, prices);
    const legProd = kids.map((k) => k.teamActivation + k.teamRecurring);
    const rest = n.restActivationVolume + n.restRecurringVolume;
    if (rest > 0) legProd.push(rest);
    const teamActivation = ownActivation + n.restActivationVolume + kids.reduce((s, k) => s + k.teamActivation, 0);
    const teamRecurring = ownRecurring + n.restRecurringVolume + kids.reduce((s, k) => s + k.teamRecurring, 0);
    const d = decideRank(ownActivation + ownRecurring, legProd, teamActivation);
    const summary: NodeSummary = {
      activations, paying, ownActivation, ownRecurring, teamActivation, teamRecurring,
      size: kids.reduce((s, k) => s + 1 + k.size, 0),
      rank: d.qpRank === 'none' ? 'none' : d.paidRank,
    };
    out.set(n.id, summary);
    return summary;
  };
  team.forEach(visit);
  return out;
}

/** Each direct Partner and everyone below them becomes one leg for the monthly calculation. */
export function teamToLegs(team: PartnerNode[], prices: Prices, today = new Date()): Leg[] {
  const sums = summarizeTeam(team, prices, today);
  return team.map((n) => {
    const s = sums.get(n.id)!;
    return {
      id: n.id,
      label: n.name,
      rank: s.rank,
      headActivations: s.activations,
      otherActivationVolume: s.teamActivation - s.ownActivation,
      recurringVolume: s.teamRecurring,
    };
  });
}

/**
 * Your activations this month: the ones you entered plus your direct Partner-Members whose
 * membership started this month (dated, so they count in Weekly Matching and the calendar).
 */
export function allActivations(month: BusinessMonth, today = new Date()): ActivationEntry[] {
  const fromPartners = month.team
    .filter((n) => membershipCounts(n, today).activation)
    .map((n): ActivationEntry => ({ id: `pm-${n.id}`, date: n.membership!.since, plan: n.membership!.plan, kind: 'new' }));
  return [...month.activationLog, ...fromPartners];
}

/** Your paying members plus your direct Partner-Members whose membership started before this month. */
export function allPaying(month: BusinessMonth, today = new Date()): PlanCounts {
  return month.team.reduce((c, n) => plus(c, membershipCounts(n, today).paying), { ...month.personalPayingMembers });
}

/** Legs from the tree, plus the values worked out from the dated activations and the history. */
export function monthActivity(month: BusinessMonth, prices: Prices, today = new Date()): { legs: Leg[]; activity: DerivedActivity } {
  const legs = teamToLegs(month.team, prices, today);
  const directsProduction = legs.reduce((s, l) => s + activationVolume(l.headActivations, prices), 0);
  return { legs, activity: deriveActivity(allActivations(month, today), month.history, directsProduction, prices, today) };
}

/** Everything the monthly calculation needs, derived from what the user entered. */
export function toMonthInput(month: BusinessMonth, prices: Prices, today = new Date()): MonthInput {
  const { legs, activity: a } = monthActivity(month, prices, today);
  return {
    personalActivations: a.counts,
    personalPayingMembers: allPaying(month, today),
    newMemberShare: a.newShare,
    qbi: a.qbi,
    matchingWeeks: a.matchingShare,
    minActivationsLongWindow: a.longWindowMet,
    legs,
  };
}

/**
 * Your Structure as the starting point of a simulation: your paying members, this month's
 * direct activations, and each direct team with its Partner count and paying members. A team's unlisted monthly payments are
 * counted as whole Classic members (rounded).
 */
export function structureStart(month: BusinessMonth, prices: Prices, today = new Date()): SimStart {
  const sums = summarizeTeam(month.team, prices, today);
  const sumMembers = (n: PartnerNode): PlanCounts => {
    const own = sums.get(n.id)!.paying;
    return n.children.map(sumMembers).reduce((a, b) => ({
      starter: a.starter + b.starter, classic: a.classic + b.classic, premium: a.premium + b.premium,
    }), { ...own, classic: own.classic + Math.round(n.restRecurringVolume / prices.monthly.classic) });
  };
  const activations: PlanCounts = { starter: 0, classic: 0, premium: 0 };
  allActivations(month, today).filter((e) => inMonth(e, today)).forEach((e) => { activations[e.plan] += 1; });
  return {
    members: allPaying(month, today),
    legs: month.team.map((n) => ({ partners: 1 + sums.get(n.id)!.size, members: sumMembers(n) })),
    activations,
  };
}

// ---------- Tree editing helpers (pure) ----------

export function findNode(team: PartnerNode[], id: string): PartnerNode | null {
  for (const n of team) {
    if (n.id === id) return n;
    const hit = findNode(n.children, id);
    if (hit) return hit;
  }
  return null;
}

/** Remove a Partner and everyone below them. Returns true when something was removed. */
export function removeNode(team: PartnerNode[], id: string): boolean {
  const i = team.findIndex((n) => n.id === id);
  if (i >= 0) { team.splice(i, 1); return true; }
  return team.some((n) => removeNode(n.children, id));
}

/** Depth-first list with each Partner's level (0 = your direct Partner). */
export function flattenTeam(team: PartnerNode[], level = 0): { node: PartnerNode; level: number }[] {
  return team.flatMap((n) => [{ node: n, level }, ...flattenTeam(n.children, level + 1)]);
}
