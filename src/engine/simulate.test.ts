import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_ASSUMPTIONS, planGoal, simulate } from './simulate.ts';
import type { CalcProfile, Prices } from './types.ts';

const prices: Prices = {
  activation: { starter: 100, classic: 200, premium: 500 },
  monthly: { starter: 50, classic: 100, premium: 250 },
};
const profile: CalcProfile = { isMember: true, isPartner: true, memberPlan: 'classic', renewalCurrent: true, fastStartMonth: false };
const opts = { fastStartIndex: -1, start: new Date(2026, 9, 1) };

test('zero activity: only costs, no income', () => {
  const months = simulate(DEFAULT_ASSUMPTIONS, profile, prices, opts);
  assert.equal(months.length, 12);
  assert.ok(months.every((m) => m.result.gross === 0));
  assert.ok(months[0].result.net < 0);
});

test('members accumulate and churn', () => {
  const a = { ...DEFAULT_ASSUMPTIONS, personalActivations: { starter: 0, classic: 2, premium: 0 }, churn: 0.5 };
  const months = simulate(a, profile, prices, opts);
  // steady state of members with 2 new / month and 50% churn → 4
  assert.ok(Math.abs(months[11].payingMembers - 4) < 0.01);
});

test('a growing team eventually reaches a rank', () => {
  const a = {
    ...DEFAULT_ASSUMPTIONS, months: 24,
    personalActivations: { starter: 0, classic: 2, premium: 1 },
    newPartnersPerMonth: 1, partnerActivations: { starter: 0, classic: 1, premium: 0 },
    teamGrowth: 0.1, partnerDropout: 0.05, churn: 0.05,
  };
  const months = simulate(a, profile, prices, opts);
  assert.ok(months.some((m) => m.result.qpRank !== 'none'));
});

test('goal planner finds a multiplier that reaches MD in 6 months', () => {
  const a = { ...DEFAULT_ASSUMPTIONS, personalActivations: { starter: 0, classic: 1, premium: 0 } };
  const g = planGoal({ kind: 'rank', rank: 'md' }, a, 6, profile, prices, opts);
  assert.ok(g.factor !== null && g.factor > 1);
  const check = simulate({ ...g.scaled!, months: 6 }, profile, prices, opts);
  assert.ok(check.some((m) => m.result.qpRank === 'md'));
});
