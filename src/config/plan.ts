/**
 * Compensation plan rules, transcribed from the
 * "Income and Incentive Guide" (REF: JAN 7, 2026-214EN-KP) and checked against the
 * "Income and Incentive Overview" (REF: JAN 4, 2026-109EN-KP). "Guide p. N" below
 * points to the page of the Guide each rule comes from.
 *
 * Every rate, threshold and table used by the engine lives here, so a plan
 * update means editing this one file. All amounts are USD.
 */

export const PLAN_VERSION = 'Income and Incentive Guide, REF: 214EN_INCOME_AND_INCENTIVE_GUIDE.pdf';
export const PLAN_OVERVIEW_VERSION = 'Income and Incentive Overview, REF: 109EN_INCOME_AND_INCENTIVE_OVERVIEW.pdf';
export const DISCLOSURE_URL = 'https://www.incruises.com/disclosure';

export type MemberPlan = 'starter' | 'classic' | 'premium';
export const MEMBER_PLANS: MemberPlan[] = ['starter', 'classic', 'premium'];

/** Daily Activation Bonus per direct activation. Guide p. 4. */
export const DAB: Record<MemberPlan, number> = { starter: 20, classic: 20, premium: 50 };

/**
 * Monthly Activations Bonus: per-activation amount by monthly count of that plan. Starter earns no MAB.
 * Guide p. 5. Counted per plan ("of a specific plan"), as the Guide's 3 Classic + 3 Premium example confirms.
 */
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

/**
 * Plan prices: the first payment (activation production) and the monthly payment. From the guide
 * (pp. 5–6, 13), except Starter activation ($50) and Classic monthly ($100), which the guide doesn't
 * list and come from inCruises plan materials. Fixed facts: users can't change them.
 */
export const PLAN_PRICES: Record<'activation' | 'monthly', Record<MemberPlan, number>> = {
  activation: { starter: 50, classic: 200, premium: 500 },
  monthly: { starter: 50, classic: 100, premium: 250 },
};

/**
 * Reward Points a Member receives with the membership (from inCruises plan materials, not the guide):
 * a fixed amount with the first payment, and each month points per $1 of the monthly payment.
 */
export const MEMBERSHIP_POINTS: Record<MemberPlan, { firstPayment: number; perMonthlyDollar: number }> = {
  starter: { firstPayment: 50, perMonthlyDollar: 1 },
  classic: { firstPayment: 350, perMonthlyDollar: 2 },
  premium: { firstPayment: 800, perMonthlyDollar: 2 },
};

/** Guide p. 3. */
export const PARTNER_RENEWAL = { amount: 95, months: 6 };

/** Weekly Matching Bonus qualification (per qualification week). Guide pp. 5–6. */
export const WEEKLY_MATCHING = { personalMin: 200, teamMin: 600, matchRate: 1 };

/**
 * Minimum Activations Requirement for MD and above (BOD ranks exempt). Meeting any one window qualifies.
 * Guide pp. 3–4 ("direct Activation Production"); the Overview says "direct New Member Activation Production".
 */
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

/** Ordered lowest → highest. Guide pp. 6–7. */
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

/** Below this TAV a qualified leader keeps only the MD title and earns no TLB. Guide pp. 7–8. */
export const TLB_TAV_FLOOR = 600;
/** Share of TLB paid to SMD+ when TAV reaches the floor but is below the rank requirement. */
export const TLB_PARTIAL_RATE = 0.5;

/** Guide p. 13. */
export const FAST_START = { bonus: 500, replacesMdTlb: 300, uplineMatch: 500 };

/**
 * Recurring Qualified Production thresholds → max RQP counted from one Partner leg. Ordered high → low.
 * Guide p. 8. The Overview adds that Recurring Income is uncapped for Board of Directors leaders;
 * neither document states a cap for lower ranks, so none is modelled.
 */
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

/** Recurring Income per $100 of RQP, by Builders Base Bonus earned. Ordered high → low. Guide p. 9. */
export const RECURRING_MULTIPLIER: { minBbb: number; per100: number }[] = [
  { minBbb: 30_000, per100: 9 },
  { minBbb: 23_000, per100: 8 },
  { minBbb: 16_000, per100: 7 },
  { minBbb: 9_000, per100: 6 },
  { minBbb: 0, per100: 5 },
];
export const SUPER_BBB_RECURRING_PER100 = 10;
export const BOD_RECURRING_GUARANTEE = { minBbb: 5_850, minRecurring: 55_000 };

/** Builders Base Bonus: share of the whole month's Builders Base Volume. Ordered high → low. Guide pp. 9–11. */
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

/** Guide pp. 12–13. */
export const MEMBERSHIP_FREE = { directProductionMin: 500, maxWaiver: 100, rewardPoints: 200, starterRewardPoints: 50 };

/** Guide p. 13. Regular Members may pay up to 50% of a cruise with Reward Points, one booking at a time. */
export const ELITE_TRAVEL = { tlbMonthsRequired: 3, unlimitedBookingsRank: 'nd' as RankId, regularPointsShare: 0.5 };

/** Reward Points competitions (non-cash). Guide pp. 14–15. */
export const REWARD_POINTS_COMPETITIONS = {
  weekly: { directActivationMin: 400 },
  monthly: { directActivationMin: 400, teamActivationMin: 1_000, rankCategories: ['none', 'md', 'smd', 'rd', 'nd'] as RankId[] },
  winnersPerCategory: 25,
  points: { min: 20, max: 500 },
};

export type PayoutKey = 'dab' | 'mab' | 'matching' | 'tlb' | 'recurring' | 'bbb' | 'fastStart';
export type Payout =
  | { kind: 'within24h' }
  | { kind: 'weekly'; weekday: 'monday' }
  | { kind: 'monthly'; day: number; delayedDay?: number };

/**
 * When each income source is paid. Guide pp. 5–6, 8, 11, 13.
 * - `within24h`: normally within 24 hours of the activation
 * - `weekly`: every Monday for the previous Monday 00:00 – Sunday 23:59 UTC week
 * - `monthly`: on `day` of the month after the production month
 * Monthly days that fall on a weekend move to the next business day.
 */
export const PAYOUT_SCHEDULE: Record<PayoutKey, Payout> = {
  dab: { kind: 'within24h' },
  matching: { kind: 'weekly', weekday: 'monday' },
  mab: { kind: 'monthly', day: 8 },
  tlb: { kind: 'monthly', day: 10 },
  fastStart: { kind: 'monthly', day: 10 },
  recurring: { kind: 'monthly', day: 15 },
  // Paid on the 14th of the month after that instead when the month's Classic/Premium Builders Base
  // activations outnumber the New Classic/Premium Members in the QBI period.
  bbb: { kind: 'monthly', day: 15, delayedDay: 14 },
};
