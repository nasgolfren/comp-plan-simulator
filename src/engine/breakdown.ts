import { BBB_MAX_LEG_RANK, SUPER_BBB, rankById, rankIndex } from '../config/plan.ts';
import {
  activationVolume, calcMonth, dailyActivationBonus, legActivationVolume, monthlyActivationsBonus,
  recurringQualifiedProduction, recurringVolume,
} from './calc.ts';
import type { CalcProfile, MonthInput, MonthResult, PlanCounts, Prices } from './types.ts';

export interface LegIncome {
  id: string;
  name: string;
  /** Weekly Matching on this direct Partner's activation bonuses. */
  matching: number;
  /** This team's share of your Recurring Income (after the per-team limit). */
  recurring: number;
  /** This team's share of your Builders Base Bonus. */
  bbb: number;
  total: number;
  /** The team's production and how much of it counts toward your current (or next) rank. */
  production: number;
  qpCounted: number;
  /** Monthly payments over the per-team Recurring limit, which earn you nothing. */
  recurringOverLimit: number;
}

export interface IncomeBreakdown {
  result: MonthResult;
  /** Bonuses for your rank, not for any one person. */
  rank: { tlb: number; fastStart: number };
  /** Your own activations: how many, their volume, their DAB and MAB, and their share of the Builders Base Bonus. */
  activations: { counts: PlanCounts; volume: number; dab: number; mab: number; bbb: number; total: number };
  /** Your own paying members: how many, their monthly payments, and their share of Recurring Income. */
  paying: { counts: PlanCounts; volume: number; recurring: number; total: number };
  legs: LegIncome[];
}

const share = (part: number, whole: number, amount: number) => (whole > 0 ? (amount * part) / whole : 0);

/**
 * Who your income comes from. DAB, MAB and Weekly Matching belong to exact people. Recurring
 * Income and the Builders Base Bonus are split in proportion to what each part counts toward
 * them (your own part, and each team after the per-team limits). TLB and Fast Start are for
 * your rank, so they stay with you. The parts always add up to the month's gross income.
 */
export function incomeBreakdown(input: MonthInput, profile: CalcProfile, prices: Prices): IncomeBreakdown {
  const r = calcMonth(input, profile, prices);
  const inc = r.income;

  // Weekly Matching: in proportion to each direct Partner's own DAB + MAB.
  const headBonus = input.legs.map((l) => dailyActivationBonus(l.headActivations) + monthlyActivationsBonus(l.headActivations));
  const headTotal = headBonus.reduce((s, v) => s + v, 0);

  // Recurring: in proportion to the RQP each part counts.
  const personalRec = recurringVolume(input.personalPayingMembers, prices);
  const legRec = input.legs.map((l) => l.recurringVolume);
  const { maxPerLeg } = recurringQualifiedProduction(personalRec, legRec);
  const counted = legRec.map((v) => (maxPerLeg > 0 ? Math.min(v, maxPerLeg) : 0));
  const rqp = personalRec + counted.reduce((s, v) => s + v, 0);

  // Builders Base: in proportion to the Builders Base Volume each part brings (same rules as the bonus).
  const paidIdx = rankIndex(r.paidRank);
  const legAct = input.legs.map((l) => legActivationVolume(l, prices));
  const ownBbv = activationVolume(input.personalActivations, prices) * input.newMemberShare;
  const legBbv = input.legs.map((l, i) => {
    const li = rankIndex(l.rank);
    const inBase = li < paidIdx && li <= rankIndex(BBB_MAX_LEG_RANK);
    const idTeam = r.conditions.superBbb && l.rank === 'id' && paidIdx >= rankIndex(SUPER_BBB.idTeamMinRank);
    return inBase || idTeam ? legAct[i] * input.newMemberShare : 0;
  });
  const bbvTotal = ownBbv + legBbv.reduce((s, v) => s + v, 0);

  // Per-team limit for Qualified Production, at the current rank (or MD when there's none yet).
  const qpRank = rankById(r.qpRank === 'none' ? 'md' : r.qpRank);
  const qpCap = qpRank.legCap * qpRank.qp;

  const legs: LegIncome[] = input.legs.map((l, i) => {
    const matching = share(headBonus[i], headTotal, inc.matching);
    const recurring = share(counted[i], rqp, inc.recurring);
    const bbb = share(legBbv[i], bbvTotal, inc.bbb);
    const production = legAct[i] + l.recurringVolume;
    return {
      id: l.id, name: l.label, matching, recurring, bbb, total: matching + recurring + bbb,
      production, qpCounted: Math.min(production, qpCap), recurringOverLimit: Math.max(0, l.recurringVolume - counted[i]),
    };
  });
  const own = { dab: inc.dab, mab: inc.mab, bbb: share(ownBbv, bbvTotal, inc.bbb) };
  const payingRec = share(personalRec, rqp, inc.recurring);
  return {
    result: r,
    rank: { tlb: inc.tlb, fastStart: inc.fastStart },
    activations: { counts: input.personalActivations, volume: activationVolume(input.personalActivations, prices), ...own, total: own.dab + own.mab + own.bbb },
    paying: { counts: input.personalPayingMembers, volume: personalRec, recurring: payingRec, total: payingRec },
    legs,
  };
}
