import {
  BBB_MAX, BBB_MAX_LEG_RANK, BBB_TIERS, BOD_RECURRING_GUARANTEE, DAB, FAST_START, MAB_TIERS,
  MEMBER_PLANS, MEMBERSHIP_FREE, MIN_ACTIVATIONS, PARTNER_RENEWAL, QBI_FULL_PAY, RANKS,
  RECURRING_MULTIPLIER, RQP_THRESHOLDS, SUPER_BBB, SUPER_BBB_RECURRING_PER100, TLB_PARTIAL_RATE,
  TLB_TAV_FLOOR, WEEKLY_MATCHING, rankById, rankIndex,
} from '../config/plan.ts';
import type { RankId } from '../config/plan.ts';
import type {
  CalcProfile, IncomeKey, IncomeLine, Leg, MonthInput, MonthResult, Note, PlanCounts, Prices, RankGap,
} from './types.ts';

export const WEEKS_PER_MONTH = 52 / 12;
const round2 = (n: number) => Math.round(n * 100) / 100;

// ---------- Activation bonuses ----------

export function dailyActivationBonus(activations: PlanCounts): number {
  return MEMBER_PLANS.reduce((sum, p) => sum + activations[p] * DAB[p], 0);
}

/** Per-activation MAB amount for one plan, given that plan's activation count in the calendar month. */
export function mabRate(plan: 'classic' | 'premium', count: number): number {
  return MAB_TIERS[plan].find((t) => count >= t.min)?.amount ?? 0;
}

export function monthlyActivationsBonus(activations: PlanCounts): number {
  return activations.classic * mabRate('classic', activations.classic)
    + activations.premium * mabRate('premium', activations.premium);
}

export function activationVolume(activations: PlanCounts, prices: Prices): number {
  return MEMBER_PLANS.reduce((sum, p) => sum + activations[p] * prices.activation[p], 0);
}

export function recurringVolume(members: PlanCounts, prices: Prices): number {
  return MEMBER_PLANS.reduce((sum, p) => sum + members[p] * prices.monthly[p], 0);
}

// ---------- Weekly Matching Bonus ----------

export interface MatchingWeek {
  personalProduction: number;
  directs: { production: number; dabPaid: number; mabPaid: number }[];
}

/** Exact weekly calculation, as described in the guide. */
export function weeklyMatchingBonus(week: MatchingWeek): { amount: number; qualified: boolean } {
  const team = week.directs.reduce((s, d) => s + d.production, 0);
  const qualified = week.personalProduction >= WEEKLY_MATCHING.personalMin && team >= WEEKLY_MATCHING.teamMin;
  const amount = qualified
    ? week.directs.reduce((s, d) => s + (d.dabPaid + d.mabPaid) * WEEKLY_MATCHING.matchRate, 0)
    : 0;
  return { amount, qualified };
}

// ---------- Qualified Production & ranks ----------

/** Personal production counts in full; each Partner leg counts up to `cap`. */
export function cappedSum(personal: number, legValues: number[], cap: number): number {
  return personal + legValues.reduce((s, v) => s + Math.min(v, cap), 0);
}

export function qpForRank(rankId: RankId, personal: number, legValues: number[]): number {
  const r = rankById(rankId);
  return cappedSum(personal, legValues, r.legCap * r.qp);
}

export interface RankDecision {
  qpRank: RankId;
  paidRank: RankId;
  tlbStatus: 'full' | 'partial' | 'none';
  tlb: number;
  qp: number;
}

/**
 * Rank is set by Qualified Production. Ranks sharing one QP level (Ambassador/Premier,
 * Global/Royal) are told apart by Total Activation Volume. TLB is full when TAV meets the
 * rank requirement, 50% for SMD+ when TAV is above $600, otherwise the leader keeps only
 * the MD title without TLB.
 */
export function decideRank(personal: number, legValues: number[], tav: number): RankDecision {
  let qpLevel = 0;
  for (let i = RANKS.length - 1; i >= 1; i--) {
    if (qpForRank(RANKS[i].id, personal, legValues) >= RANKS[i].qp) { qpLevel = RANKS[i].qp; break; }
  }
  if (qpLevel === 0) {
    return { qpRank: 'none', paidRank: 'none', tlbStatus: 'none', tlb: 0, qp: qpForRank('md', personal, legValues) };
  }
  const group = RANKS.filter((r) => r.qp === qpLevel); // low → high
  const fullyMet = [...group].reverse().find((r) => tav >= r.tav);
  const rank = fullyMet ?? group[0];
  const qp = qpForRank(rank.id, personal, legValues);

  if (fullyMet) return { qpRank: rank.id, paidRank: rank.id, tlbStatus: 'full', tlb: rank.tlb, qp };
  if (rank.id !== 'md' && tav > TLB_TAV_FLOOR) {
    return { qpRank: rank.id, paidRank: rank.id, tlbStatus: 'partial', tlb: rank.tlb * TLB_PARTIAL_RATE, qp };
  }
  return { qpRank: rank.id, paidRank: 'md', tlbStatus: 'none', tlb: 0, qp };
}

export function rankGap(target: RankId, personal: number, legs: { id: string; value: number }[], tav: number): RankGap {
  const r = rankById(target);
  const cap = r.legCap * r.qp;
  return {
    rankId: target,
    qpRequired: r.qp,
    qpCounted: cappedSum(personal, legs.map((l) => l.value), cap),
    legCapAmount: cap,
    cappedLegIds: legs.filter((l) => l.value > cap).map((l) => l.id),
    tavRequired: r.tav,
    tav,
  };
}

// ---------- Recurring Income ----------

/**
 * RQP: your own recurring production counts in full; each leg counts up to the per-leg
 * maximum of the highest threshold your RQP (computed with that maximum) reaches.
 */
export function recurringQualifiedProduction(personal: number, legValues: number[]): { rqp: number; maxPerLeg: number } {
  for (const t of RQP_THRESHOLDS) {
    const rqp = cappedSum(personal, legValues, t.maxPerLeg);
    if (rqp >= t.min) return { rqp, maxPerLeg: t.maxPerLeg };
  }
  return { rqp: personal, maxPerLeg: 0 };
}

export function recurringPer100(bbbPaid: number, superBbb: boolean): number {
  if (superBbb) return SUPER_BBB_RECURRING_PER100;
  return RECURRING_MULTIPLIER.find((m) => bbbPaid >= m.minBbb)?.per100 ?? 5;
}

// ---------- Builders Base Bonus ----------

export function bbbRate(bbv: number): number {
  return BBB_TIERS.find((t) => bbv >= t.minBbv)?.rate ?? 0;
}

export function qbiFactor(qbi: number): number {
  return qbi >= QBI_FULL_PAY ? 1 : Math.max(0, qbi);
}

export interface BbbResult { potential: number; superBonus: number; paid: number; superBbb: boolean; rate: number }

export function buildersBaseBonus(bbv: number, idTeamsBbv: number, hasIdTeam: boolean, rank: RankId, qbi: number): BbbResult {
  const rate = bbbRate(bbv);
  const potential = Math.min(bbv * rate, BBB_MAX);
  const superBbb = potential >= BBB_MAX && hasIdTeam;
  const superBonus = superBbb
    ? bbv * SUPER_BBB.ownRate + (rankIndex(rank) >= rankIndex(SUPER_BBB.idTeamMinRank) ? idTeamsBbv * SUPER_BBB.idTeamRate : 0)
    : 0;
  const f = qbiFactor(qbi);
  return { potential, superBonus, paid: (potential + superBonus) * f, superBbb, rate };
}

// ---------- Whole month ----------

export function legActivationVolume(leg: Leg, prices: Prices): number {
  return activationVolume(leg.headActivations, prices) + leg.otherActivationVolume;
}

export function calcMonth(input: MonthInput, profile: CalcProfile, prices: Prices): MonthResult {
  const notes: Note[] = [];
  const lines: Record<IncomeKey, Note[]> = { dab: [], mab: [], matching: [], tlb: [], recurring: [], bbb: [], fastStart: [] };

  const personalActivation = activationVolume(input.personalActivations, prices);
  const personalRecurring = recurringVolume(input.personalPayingMembers, prices);
  const directProduction = personalActivation + personalRecurring;

  const legAct = input.legs.map((l) => legActivationVolume(l, prices));
  const legProd = input.legs.map((l, i) => legAct[i] + l.recurringVolume);
  const tav = personalActivation + legAct.reduce((s, v) => s + v, 0);

  // Rank & TLB
  const decision = decideRank(directProduction, legProd, tav);
  const paidIdx = rankIndex(decision.paidRank);
  const isLeader = paidIdx >= rankIndex('md');

  // Eligibility
  const renewalCurrent = profile.isPartner && profile.renewalCurrent;
  const marRequired = isLeader && paidIdx < rankIndex('bod');
  const marMet = !marRequired || personalActivation >= MIN_ACTIVATIONS[0].amount || input.minActivationsLongWindow;
  const eligible = renewalCurrent && marMet;
  if (!profile.isPartner) notes.push({ key: 'note.notPartner', tone: 'warn' });
  else if (!profile.renewalCurrent) notes.push({ key: 'note.renewalLapsed', tone: 'warn' });
  if (marRequired && !marMet) notes.push({ key: 'note.minActivationsMissing', params: { amount: MIN_ACTIVATIONS[0].amount }, tone: 'warn' });

  // 1. Activation bonuses
  const dab = dailyActivationBonus(input.personalActivations);
  const mab = monthlyActivationsBonus(input.personalActivations);
  lines.dab.push({ key: 'explain.dab', params: {
    s: input.personalActivations.starter, c: input.personalActivations.classic, p: input.personalActivations.premium } });
  for (const plan of ['classic', 'premium'] as const) {
    const n = input.personalActivations[plan];
    const rate = mabRate(plan, n);
    if (rate > 0) lines.mab.push({ key: 'explain.mabTier', params: { plan, n, rate } });
    else if (n > 0) lines.mab.push({ key: 'explain.mabBelow', params: { plan, n, missing: 3 - n }, tone: 'info' });
  }

  // 2. Weekly Matching (monthly estimate)
  const directsBonus = input.legs.reduce((s, l) => s + dailyActivationBonus(l.headActivations) + monthlyActivationsBonus(l.headActivations), 0);
  const directsProduction = input.legs.reduce((s, l) => s + activationVolume(l.headActivations, prices), 0);
  let weeks: number;
  if (input.matchingWeeks === 'auto') {
    const ok = personalActivation / WEEKS_PER_MONTH >= WEEKLY_MATCHING.personalMin
      && directsProduction / WEEKS_PER_MONTH >= WEEKLY_MATCHING.teamMin;
    weeks = ok ? 1 : 0;
    lines.matching.push({ key: ok ? 'explain.matchingAutoOk' : 'explain.matchingAutoNo', params: {
      personal: Math.round(personalActivation / WEEKS_PER_MONTH), team: Math.round(directsProduction / WEEKS_PER_MONTH) },
    tone: ok ? 'good' : 'info' });
  } else {
    weeks = Math.min(1, Math.max(0, input.matchingWeeks));
    lines.matching.push({ key: 'explain.matchingManual', params: { pct: Math.round(weeks * 100) } });
  }
  const matching = directsBonus * weeks;

  // 3. Team Leadership Bonus
  let tlb = decision.tlb;
  const rank = rankById(decision.qpRank);
  if (decision.qpRank === 'none') lines.tlb.push({ key: 'explain.tlbNoRank', params: { qp: Math.round(decision.qp) } });
  else if (decision.tlbStatus === 'full') lines.tlb.push({ key: 'explain.tlbFull', params: { rank: rank.short, tav: Math.round(tav) }, tone: 'good' });
  else if (decision.tlbStatus === 'partial') lines.tlb.push({ key: 'explain.tlbPartial', params: { rank: rank.short, tav: Math.round(tav), req: rank.tav }, tone: 'warn' });
  else lines.tlb.push({ key: 'explain.tlbNoTav', params: { floor: TLB_TAV_FLOOR }, tone: 'warn' });

  // Fast Start
  let fastStart = 0;
  const fastStartHit = profile.fastStartMonth && isLeader;
  if (fastStartHit) {
    fastStart = FAST_START.bonus;
    if (decision.paidRank === 'md' && tlb === FAST_START.replacesMdTlb) {
      tlb = 0;
      lines.fastStart.push({ key: 'explain.fastStartReplaces', tone: 'good' });
    } else lines.fastStart.push({ key: 'explain.fastStart', tone: 'good' });
  } else if (profile.fastStartMonth) {
    lines.fastStart.push({ key: 'explain.fastStartOpen', params: { qp: rankById('md').qp } });
  }

  // 5. Builders Base Bonus (before Recurring, because it sets the multiplier)
  const share = Math.min(1, Math.max(0, input.newMemberShare));
  let bbv = isLeader ? personalActivation * share : 0;
  let idTeamsBbv = 0;
  let hasIdTeam = false;
  input.legs.forEach((l, i) => {
    const li = rankIndex(l.rank);
    if (li >= rankIndex('id')) hasIdTeam = true;
    if (l.rank === 'id') idTeamsBbv += legAct[i] * share;
    if (isLeader && li < paidIdx && li <= rankIndex(BBB_MAX_LEG_RANK)) bbv += legAct[i] * share;
  });
  const bbbRes = isLeader ? buildersBaseBonus(bbv, idTeamsBbv, hasIdTeam, decision.paidRank, input.qbi)
    : { potential: 0, superBonus: 0, paid: 0, superBbb: false, rate: 0 };
  if (!isLeader) lines.bbb.push({ key: 'explain.leaderOnly' });
  else if (bbbRes.rate === 0) lines.bbb.push({ key: 'explain.bbbBelow', params: { bbv: Math.round(bbv), min: 5000 } });
  else {
    lines.bbb.push({ key: 'explain.bbbTier', params: { bbv: Math.round(bbv), pct: Math.round(bbbRes.rate * 100) } });
    if (input.qbi < QBI_FULL_PAY) lines.bbb.push({ key: 'explain.qbiReduced', params: { qbi: Math.round(input.qbi * 100) }, tone: 'warn' });
    if (bbbRes.superBbb) lines.bbb.push({ key: 'explain.superBbb', tone: 'good' });
  }

  // 4. Recurring Income
  const legRec = input.legs.map((l) => l.recurringVolume);
  const { rqp, maxPerLeg } = recurringQualifiedProduction(personalRecurring, legRec);
  const per100 = recurringPer100(bbbRes.paid, bbbRes.superBbb);
  let recurring = isLeader ? (rqp / 100) * per100 : 0;
  if (!isLeader) lines.recurring.push({ key: 'explain.leaderOnly' });
  else {
    lines.recurring.push({ key: 'explain.recurring', params: { rqp: Math.round(rqp), per100, max: maxPerLeg } });
    const isBod = paidIdx >= rankIndex('bod');
    if (isBod && bbbRes.paid >= BOD_RECURRING_GUARANTEE.minBbb && recurring < BOD_RECURRING_GUARANTEE.minRecurring) {
      recurring = BOD_RECURRING_GUARANTEE.minRecurring;
      lines.recurring.push({ key: 'explain.bodGuarantee', tone: 'good' });
    }
  }

  const raw: Record<IncomeKey, number> = {
    dab, mab, matching, tlb, recurring, bbb: bbbRes.paid, fastStart,
  };
  const income = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, eligible ? round2(v) : 0]),
  ) as Record<IncomeKey, number>;

  // Costs
  const renewal = profile.isPartner ? PARTNER_RENEWAL.amount / PARTNER_RENEWAL.months : 0;
  const ownFee = profile.isMember ? prices.monthly[profile.memberPlan] : 0;
  const membershipFree = directProduction >= MEMBERSHIP_FREE.directProductionMin;
  const membershipWaiver = profile.isMember && membershipFree ? Math.min(MEMBERSHIP_FREE.maxWaiver, ownFee) : 0;
  if (membershipFree) notes.push({ key: profile.isMember ? 'note.membershipFree' : 'note.membershipFreePoints', params: { waiver: membershipWaiver }, tone: 'good' });
  const costs = { renewal: round2(renewal), membership: ownFee, membershipWaiver, total: round2(renewal + ownFee - membershipWaiver) };

  // Next rank
  const nextIdx = Math.max(rankIndex(decision.qpRank), 0) + 1;
  const legsForGap = input.legs.map((l, i) => ({ id: l.id, value: legProd[i] }));
  const nextRank = nextIdx < RANKS.length ? rankGap(RANKS[nextIdx].id, directProduction, legsForGap, tav) : null;

  const allLines: IncomeLine[] = (Object.keys(lines) as IncomeKey[]).map((k) => ({ key: k, amount: income[k], notes: lines[k] }));
  const gross = round2(Object.values(income).reduce((s, v) => s + v, 0));

  return {
    production: { personalActivation, personalRecurring, directProduction, tav, qp: decision.qp, rqp, bbv },
    qpRank: decision.qpRank,
    paidRank: decision.paidRank,
    tlbStatus: decision.tlbStatus,
    nextRank,
    income,
    lines: allLines,
    costs,
    gross,
    net: round2(gross - costs.total),
    conditions: {
      renewalCurrent, minActivations: { required: marRequired, met: marMet },
      membershipFree, fastStart: fastStartHit, superBbb: bbbRes.superBbb, eligible,
    },
    notes,
  };
}
