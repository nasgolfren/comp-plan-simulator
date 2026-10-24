/**
 * Compensation plan rules, transcribed from the
 * "Income and Incentive Guide" (REF: JAN 7, 2026-214EN-KP).
 *
 * Every rate, threshold and table used by the engine lives here, so a plan
 * update means editing this one file. All amounts are USD.
 */

export const PLAN_VERSION = 'Income and Incentive Guide, REF: JAN 7, 2026-214EN-KP';
export const DISCLOSURE_URL = 'https://www.incruises.com/disclosure';

export type MemberPlan = 'starter' | 'classic' | 'premium';
export const MEMBER_PLANS: MemberPlan[] = ['starter', 'classic', 'premium'];

/** Daily Activation Bonus per direct activation. */
export const DAB: Record<MemberPlan, number> = { starter: 20, classic: 20, premium: 50 };

/** Monthly Activations Bonus: per-activation amount by monthly count of that plan. Starter earns no MAB. */
export const MAB_TIERS: Record<'classic' | 'premium', { min: number; amount: number }[]> = {
  classic: [
    { min: 10, amount: 40 },
    { min: 5, amount: 30 },
    { min: 3, amount: 20 },
  ],
  premium: [
    { min: 10, amount: 100 },
    { min: 5, amount: 75 },
    { min: 3, amount: 50 },
  ],
};

/** Plan prices known from the guide. Missing values are set by each user in Settings. */
export const KNOWN_PRICES: Record<MemberPlan, { activation: number | null; monthly: number | null }> = {
  starter: { activation: null, monthly: 50 },
  classic: { activation: 200, monthly: null },
  premium: { activation: 500, monthly: 250 },
};

export const PARTNER_RENEWAL = { amount: 95, months: 6 };

/** Weekly Matching Bonus qualification (per qualification week). */
export const WEEKLY_MATCHING = { personalMin: 200, teamMin: 600, matchRate: 1 };

/** Minimum Activations Requirement for MD and above (BOD ranks exempt). Meeting any one window qualifies. */
export const MIN_ACTIVATIONS = [
  { amount: 200, days: 30 },
  { amount: 600, days: 90 },
  { amount: 1200, days: 180 },
  { amount: 2400, days: 365 },
];

export type RankId =
  | 'none' | 'md' | 'smd' | 'rd' | 'nd' | 'id' | 'ed' | 'bod' | 'abod' | 'pabod' | 'gabod' | 'rabod';

export interface Rank {
  id: RankId;
  name: string;
  short: string;
  qp: number;        // Qualified Production required
  legCap: number;    // max share of the QP requirement from one Partner team
  tav: number;       // Total Activation Volume for the full Team Leadership Bonus
  tlb: number;       // full Team Leadership Bonus
}

/** Ordered lowest → highest. */
export const RANKS: Rank[] = [
  { id: 'none', name: 'Partner', short: '—', qp: 0, legCap: 0.4, tav: 0, tlb: 0 },
  { id: 'md', name: 'Marketing Director', short: 'MD', qp: 3_000, legCap: 0.4, tav: 600, tlb: 300 },
  { id: 'smd', name: 'Senior Marketing Director', short: 'SMD', qp: 10_000, legCap: 0.4, tav: 2_000, tlb: 1_000 },
  { id: 'rd', name: 'Regional Director', short: 'RD', qp: 25_000, legCap: 0.4, tav: 5_000, tlb: 2_500 },
  { id: 'nd', name: 'National Director', short: 'ND', qp: 50_000, legCap: 0.4, tav: 10_000, tlb: 5_000 },
  { id: 'id', name: 'International Director', short: 'ID', qp: 100_000, legCap: 0.4, tav: 20_000, tlb: 10_000 },
  { id: 'ed', name: 'Executive Director', short: 'ED', qp: 250_000, legCap: 0.4, tav: 50_000, tlb: 25_000 },
  { id: 'bod', name: 'Board of Directors', short: 'BOD', qp: 550_000, legCap: 0.4, tav: 110_000, tlb: 55_000 },
  { id: 'abod', name: 'Ambassador Board of Directors', short: 'ABOD', qp: 750_000, legCap: 0.2, tav: 300_000, tlb: 105_000 },
  { id: 'pabod', name: 'Premier Ambassador Board of Directors', short: 'PABOD', qp: 750_000, legCap: 0.2, tav: 1_000_000, tlb: 155_000 },
  { id: 'gabod', name: 'Global Ambassador Board of Directors', short: 'GABOD', qp: 1_000_000, legCap: 0.1, tav: 400_000, tlb: 180_000 },
  { id: 'rabod', name: 'Royal Ambassador Board of Directors', short: 'RABOD', qp: 1_000_000, legCap: 0.1, tav: 2_000_000, tlb: 305_000 },
];

export const rankIndex = (id: RankId): number => RANKS.findIndex((r) => r.id === id);
export const rankById = (id: RankId): Rank => RANKS[rankIndex(id)];

/** Below this TAV a qualified leader keeps only the MD title and earns no TLB. */
export const TLB_TAV_FLOOR = 600;
/** Share of TLB paid to SMD+ when TAV is above the floor but below the rank requirement. */
export const TLB_PARTIAL_RATE = 0.5;

export const FAST_START = { bonus: 500, replacesMdTlb: 300, uplineMatch: 500 };

/** Recurring Qualified Production thresholds → max RQP counted from one Partner leg. Ordered high → low. */
export const RQP_THRESHOLDS: { min: number; maxPerLeg: number }[] = [
  { min: 550_000, maxPerLeg: 220_000 },
  { min: 250_000, maxPerLeg: 100_000 },
  { min: 100_000, maxPerLeg: 40_000 },
  { min: 50_000, maxPerLeg: 20_000 },
  { min: 25_000, maxPerLeg: 10_000 },
  { min: 10_000, maxPerLeg: 4_000 },
  { min: 3_000, maxPerLeg: 1_200 },
  { min: 0, maxPerLeg: 1_200 },
];

/** Recurring Income per $100 of RQP, by Builders Base Bonus earned. Ordered high → low. */
export const RECURRING_MULTIPLIER: { minBbb: number; per100: number }[] = [
  { minBbb: 30_000, per100: 9 },
  { minBbb: 23_000, per100: 8 },
  { minBbb: 16_000, per100: 7 },
  { minBbb: 9_000, per100: 6 },
  { minBbb: 0, per100: 5 },
];
export const SUPER_BBB_RECURRING_PER100 = 10;
export const BOD_RECURRING_GUARANTEE = { minBbb: 5_850, minRecurring: 55_000 };

/** Builders Base Bonus: share of the whole month's Builders Base Volume. Ordered high → low. */
export const BBB_TIERS: { minBbv: number; rate: number }[] = [
  { minBbv: 30_000, rate: 0.3 },
  { minBbv: 10_000, rate: 0.1 },
  { minBbv: 5_000, rate: 0.05 },
];
export const BBB_MAX = 30_000;
export const SUPER_BBB = { ownRate: 0.05, idTeamRate: 0.05, idTeamMinRank: 'ed' as RankId };
/** Builders Base legs may not be ranked higher than this. */
export const BBB_MAX_LEG_RANK: RankId = 'nd';
export const QBI_FULL_PAY = 0.65;

export const MEMBERSHIP_FREE = { directProductionMin: 500, maxWaiver: 100, rewardPoints: 200, starterRewardPoints: 50 };

export const ELITE_TRAVEL = { tlbMonthsRequired: 3, unlimitedBookingsRank: 'nd' as RankId };
