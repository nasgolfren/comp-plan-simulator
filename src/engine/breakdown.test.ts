import { test } from 'node:test';
import assert from 'node:assert/strict';
import { incomeBreakdown } from './breakdown.ts';
import type { CalcProfile, Leg, MonthInput, Prices } from './types.ts';

const prices: Prices = {
  activation: { starter: 50, classic: 200, premium: 500 },
  monthly: { starter: 50, classic: 100, premium: 250 },
};
const profile: CalcProfile = { isMember: true, isPartner: true, memberPlan: 'classic', renewalCurrent: true, fastStartMonth: false };
const leg = (id: string, o: Partial<Leg>): Leg => ({ id, label: id, rank: 'none', headActivations: { starter: 0, classic: 0, premium: 0 }, otherActivationVolume: 0, recurringVolume: 0, ...o });

const input: MonthInput = {
  personalActivations: { starter: 0, classic: 4, premium: 2 },
  personalPayingMembers: { starter: 0, classic: 6, premium: 2 },
  newMemberShare: 1, qbi: 1, matchingWeeks: 1, minActivationsLongWindow: false,
  legs: [
    leg('a', { headActivations: { starter: 0, classic: 3, premium: 1 }, otherActivationVolume: 2_000, recurringVolume: 3_000 }),
    leg('b', { headActivations: { starter: 0, classic: 1, premium: 0 }, otherActivationVolume: 800, recurringVolume: 600 }),
    leg('c', { recurringVolume: 900 }),
  ],
};

test('the parts add up to the month\'s gross income', () => {
  const b = incomeBreakdown(input, profile, prices);
  const sum = b.rank.tlb + b.rank.fastStart + b.activations.total + b.paying.total + b.legs.reduce((s, l) => s + l.total, 0);
  assert.ok(b.result.gross > 0);
  assert.ok(Math.abs(sum - b.result.gross) < 0.05, `${sum} vs ${b.result.gross}`);
});

test('DAB and MAB are yours; Weekly Matching follows each direct Partner\'s bonuses', () => {
  const b = incomeBreakdown(input, profile, prices);
  assert.equal(b.activations.dab, b.result.income.dab);
  assert.equal(b.activations.mab, b.result.income.mab);
  // leg a: 3 Classic + 1 Premium = $60 + $50 DAB + $60 MAB; leg b: $20; leg c: nothing
  assert.ok(b.legs[0].matching > b.legs[1].matching);
  assert.equal(b.legs[2].matching, 0);
});

test('recurring over the per-team limit earns nothing and is reported', () => {
  const b = incomeBreakdown(input, profile, prices);
  assert.ok(b.legs[0].recurringOverLimit > 0);
  assert.equal(b.legs[1].recurringOverLimit, 0);
});
