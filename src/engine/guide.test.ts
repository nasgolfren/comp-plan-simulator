/**
 * Every worked example from the Income and Incentive Guide, reproduced by the engine.
 * Run with: npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildersBaseBonus, calcMonth, dailyActivationBonus, decideRank, monthlyActivationsBonus,
  recurringQualifiedProduction, recurringPer100, weeklyMatchingBonus,
} from './calc.ts';
import type { CalcProfile, MonthInput, Prices } from './types.ts';

const prices: Prices = {
  activation: { starter: 100, classic: 200, premium: 500 },
  monthly: { starter: 50, classic: 100, premium: 250 },
};
const zero = { starter: 0, classic: 0, premium: 0 };
const profile: CalcProfile = { isMember: false, isPartner: true, memberPlan: 'classic', renewalCurrent: true, fastStartMonth: false };

test('DAB: $20 Starter/Classic, $50 Premium', () => {
  assert.equal(dailyActivationBonus({ starter: 1, classic: 1, premium: 1 }), 90);
});

test('MAB example: 3 Classic + 3 Premium in one month = $60 + $150', () => {
  assert.equal(monthlyActivationsBonus({ starter: 0, classic: 3, premium: 3 }), 210);
});

test('MAB tiers: 2 of a plan earns nothing, 5 and 10 step up', () => {
  assert.equal(monthlyActivationsBonus({ starter: 0, classic: 2, premium: 2 }), 0);
  assert.equal(monthlyActivationsBonus({ starter: 0, classic: 5, premium: 0 }), 150);
  assert.equal(monthlyActivationsBonus({ starter: 0, classic: 0, premium: 10 }), 1000);
});

test('Weekly Matching example: $300 ($200 for Partner 1 + $100 for Partner 2)', () => {
  const r = weeklyMatchingBonus({
    personalProduction: 200,
    directs: [
      { production: 500, dabPaid: 50, mabPaid: 150 },
      { production: 200, dabPaid: 20, mabPaid: 80 },
    ],
  });
  assert.deepEqual(r, { amount: 300, qualified: true });
});

test('Weekly Matching needs $200 personal production', () => {
  const r = weeklyMatchingBonus({ personalProduction: 199, directs: [{ production: 700, dabPaid: 70, mabPaid: 0 }] });
  assert.equal(r.qualified, false);
  assert.equal(r.amount, 0);
});

test('40% rule example: max $1,200 from one team for MD', () => {
  // personal 600, one huge leg → only $1,200 counts → 1,800 < 3,000
  assert.equal(decideRank(600, [10_000], 600).qpRank, 'none');
  // personal 600 + three legs of 1,200+ → 4,200 ≥ 3,000
  assert.equal(decideRank(600, [5_000, 1_200, 1_200], 600).qpRank, 'md');
});

test('TLB example: RD with $26,500 QP and $5,600 TAV earns full $2,500', () => {
  const d = decideRank(26_500, [], 5_600);
  assert.equal(d.paidRank, 'rd');
  assert.equal(d.tlb, 2_500);
});

test('TLB example: RD with $30,000 QP and $2,000 TAV earns 50% = $1,250', () => {
  const d = decideRank(30_000, [], 2_000);
  assert.equal(d.paidRank, 'rd');
  assert.equal(d.tlbStatus, 'partial');
  assert.equal(d.tlb, 1_250);
});

test('TLB: MD under $600 TAV keeps title, no TLB; SMD+ under $600 drops to MD', () => {
  assert.deepEqual([decideRank(3_000, [], 500).paidRank, decideRank(3_000, [], 500).tlb], ['md', 0]);
  const d = decideRank(12_000, [], 500);
  assert.equal(d.qpRank, 'smd');
  assert.equal(d.paidRank, 'md');
  assert.equal(d.tlb, 0);
});

test('RQP example: $1,000 direct + teams 5,000 / 4,000 / 700 → $4,100 RQP → $205', () => {
  const { rqp } = recurringQualifiedProduction(1_000, [5_000, 4_000, 700]);
  assert.equal(rqp, 4_100);
  assert.equal((rqp / 100) * recurringPer100(0, false), 205);
});

test('Recurring multiplier steps with Builders Base Bonus', () => {
  assert.equal(recurringPer100(8_999, false), 5);
  assert.equal(recurringPer100(9_000, false), 6);
  assert.equal(recurringPer100(30_000, false), 9);
  assert.equal(recurringPer100(30_000, true), 10);
});

test('BBB example: $9,600 BBV → 5% = $480', () => {
  assert.equal(buildersBaseBonus(9_600, 0, false, 'rd', 1).paid, 480);
});

test('BBB example: $100,000 BBV → 30% = $30,000', () => {
  assert.equal(buildersBaseBonus(100_000, 0, false, 'nd', 1).paid, 30_000);
});

test('QBI examples: 70% pays 100%, 60% pays 60% of $10,000', () => {
  // A $10,000 potential bonus comes from $33,333 BBV at the 30% tier.
  const potential = (bbv: number) => buildersBaseBonus(bbv, 0, false, 'nd', 1).potential;
  const bbv = 10_000 / 0.3;
  assert.ok(Math.abs(potential(bbv) - 10_000) < 0.01);
  assert.ok(Math.abs(buildersBaseBonus(bbv, 0, false, 'nd', 0.7).paid - 10_000) < 0.01);
  assert.ok(Math.abs(buildersBaseBonus(bbv, 0, false, 'nd', 0.6).paid - 6_000) < 0.01);
});

test('Super BBB: +5% own BBV with an ID team; ED+ also 5% of ID teams', () => {
  const nd = buildersBaseBonus(100_000, 40_000, true, 'nd', 1);
  assert.equal(nd.superBbb, true);
  assert.equal(nd.paid, 35_000);
  const ed = buildersBaseBonus(100_000, 40_000, true, 'ed', 1);
  assert.equal(ed.paid, 37_000);
});

test('calcMonth: lapsed renewal means no income', () => {
  const input: MonthInput = {
    personalActivations: { starter: 0, classic: 3, premium: 3 }, personalPayingMembers: zero,
    newMemberShare: 1, qbi: 1, matchingWeeks: 'auto', minActivationsLongWindow: false, legs: [],
  };
  const ok = calcMonth(input, profile, prices);
  assert.equal(ok.income.dab, 210);
  assert.equal(ok.income.mab, 210);
  const lapsed = calcMonth(input, { ...profile, renewalCurrent: false }, prices);
  assert.equal(lapsed.gross, 0);
});

test('calcMonth: Fast Start $500 replaces the $300 MD bonus', () => {
  const input: MonthInput = {
    personalActivations: { starter: 0, classic: 0, premium: 2 }, personalPayingMembers: { starter: 0, classic: 0, premium: 8 },
    newMemberShare: 1, qbi: 1, matchingWeeks: 0, minActivationsLongWindow: false, legs: [],
  };
  // personal production 1,000 + 2,000 = 3,000 → MD, TAV 1,000
  const r = calcMonth(input, { ...profile, fastStartMonth: true }, prices);
  assert.equal(r.paidRank, 'md');
  assert.equal(r.income.tlb, 0);
  assert.equal(r.income.fastStart, 500);
});

test('calcMonth: Membership Free waives up to $100 at $500 direct production', () => {
  const input: MonthInput = {
    personalActivations: { starter: 0, classic: 0, premium: 1 }, personalPayingMembers: zero,
    newMemberShare: 1, qbi: 1, matchingWeeks: 0, minActivationsLongWindow: false, legs: [],
  };
  const r = calcMonth(input, { ...profile, isMember: true, memberPlan: 'premium' }, prices);
  assert.equal(r.conditions.membershipFree, true);
  assert.equal(r.costs.membershipWaiver, 100);
  assert.equal(r.costs.membership, 250);
});
