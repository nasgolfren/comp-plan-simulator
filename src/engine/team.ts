import type { RankId } from '../config/plan.ts';
import { deriveActivity } from './activity.ts';
import type { DerivedActivity } from './activity.ts';
import { activationVolume, decideRank, recurringVolume } from './calc.ts';
import type { SimStart } from './simulate.ts';
import type { BusinessMonth, Leg, MonthInput, PartnerNode, PlanCounts, Prices } from './types.ts';

export interface NodeSummary {
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

/**
 * Summaries for every Partner in the tree, computed bottom-up. Each Partner's rank comes from
 * their own production plus their legs (direct children, and the unlisted rest as one more leg),
 * with the same rules as your own rank. Eligibility conditions (renewal, minimum activations)
 * aren't known for other Partners and are assumed met.
 */
export function summarizeTeam(team: PartnerNode[], prices: Prices): Map<string, NodeSummary> {
  const out = new Map<string, NodeSummary>();
  const visit = (n: PartnerNode): NodeSummary => {
    const kids = n.children.map(visit);
    const ownActivation = activationVolume(n.activations, prices);
    const ownRecurring = recurringVolume(n.payingMembers, prices);
    const legProd = kids.map((k) => k.teamActivation + k.teamRecurring);
    const rest = n.restActivationVolume + n.restRecurringVolume;
    if (rest > 0) legProd.push(rest);
    const teamActivation = ownActivation + n.restActivationVolume + kids.reduce((s, k) => s + k.teamActivation, 0);
    const teamRecurring = ownRecurring + n.restRecurringVolume + kids.reduce((s, k) => s + k.teamRecurring, 0);
    const d = decideRank(ownActivation + ownRecurring, legProd, teamActivation);
    const summary: NodeSummary = {
      ownActivation, ownRecurring, teamActivation, teamRecurring,
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
export function teamToLegs(team: PartnerNode[], prices: Prices): Leg[] {
  const sums = summarizeTeam(team, prices);
  return team.map((n) => {
    const s = sums.get(n.id)!;
    return {
      id: n.id,
      label: n.name,
      rank: s.rank,
      headActivations: n.activations,
      otherActivationVolume: s.teamActivation - s.ownActivation,
      recurringVolume: s.teamRecurring,
    };
  });
}

/** Legs from the tree, plus the values worked out from the dated activations and the history. */
export function monthActivity(month: BusinessMonth, prices: Prices, today = new Date()): { legs: Leg[]; activity: DerivedActivity } {
  const legs = teamToLegs(month.team, prices);
  const directsProduction = legs.reduce((s, l) => s + activationVolume(l.headActivations, prices), 0);
  return { legs, activity: deriveActivity(month.activationLog, month.history, directsProduction, prices, today) };
}

/** Everything the monthly calculation needs, derived from what the user entered. */
export function toMonthInput(month: BusinessMonth, prices: Prices, today = new Date()): MonthInput {
  const { legs, activity: a } = monthActivity(month, prices, today);
  return {
    personalActivations: a.counts,
    personalPayingMembers: month.personalPayingMembers,
    newMemberShare: a.newShare,
    qbi: a.qbi,
    matchingWeeks: a.matchingShare,
    minActivationsLongWindow: a.longWindowMet,
    legs,
  };
}

/**
 * Your Structure as the starting point of a simulation: your paying members, and each direct
 * team with its Partner count and paying members. A team's unlisted monthly payments are
 * counted as whole Classic members (rounded).
 */
export function structureStart(month: BusinessMonth, prices: Prices): SimStart {
  const sumMembers = (n: PartnerNode): PlanCounts => n.children.map(sumMembers).reduce((a, b) => ({
    starter: a.starter + b.starter, classic: a.classic + b.classic, premium: a.premium + b.premium,
  }), { ...n.payingMembers, classic: n.payingMembers.classic + Math.round(n.restRecurringVolume / prices.monthly.classic) });
  const sums = summarizeTeam(month.team, prices);
  return {
    members: { ...month.personalPayingMembers },
    legs: month.team.map((n) => ({ partners: 1 + sums.get(n.id)!.size, members: sumMembers(n) })),
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
