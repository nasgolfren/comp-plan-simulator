import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_ASSUMPTIONS, planGoal, simulate, toCadence } from './simulate.ts';
import type { CalcProfile, Prices } from './types.ts';

const prices: Prices = {
  activation: { starter: 50, classic: 200, premium: 500 },
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

test('members add up in whole people and pay from the month after', () => {
  const a = { ...DEFAULT_ASSUMPTIONS, personalActivations: { starter: 0, classic: 2, premium: 0 } };
  const months = simulate(a, profile, prices, opts);
  assert.equal(months[11].payingMembers, 24);
  assert.equal(months[0].result.production.personalRecurring, 0);
  assert.equal(months[1].result.production.personalRecurring, 200);
});

test('Partners join on their cadence and teams grow in whole people', () => {
  const a = {
    ...DEFAULT_ASSUMPTIONS, months: 6,
    newPartners: { count: 1, every: 2 }, // months 1, 3, 5
    teamNewPartners: { count: 1, every: 1 },
  };
  const m = simulate(a, profile, prices, opts);
  assert.deepEqual(m.map((x) => x.legs), [1, 1, 2, 2, 3, 3]);
  assert.ok(m.every((x) => Number.isInteger(x.teamPartners) && Number.isInteger(x.payingMembers)));
  // first team: 1, then +1 every month after it started → 6 in month 6
  assert.equal(m[5].teamPartners, 6 + 4 + 2);
});

test('losses are off by default; when on, whole people leave on their pace', () => {
  const base = { ...DEFAULT_ASSUMPTIONS, personalActivations: { starter: 0, classic: 2, premium: 0 }, newPartners: { count: 1, every: 1 } };
  const none = simulate(base, profile, prices, opts);
  assert.equal(none[11].payingMembers, 24);
  const withLoss = { ...base, losses: { on: true, random: false, members: { count: 1, every: 3 }, partners: { count: 1, every: 6 } } };
  const m = simulate(withLoss, profile, prices, opts);
  // members leave in months 3, 6, 9, 12 → 24 − 4
  assert.equal(m[11].payingMembers, 20);
  // 12 Partners joined, 2 left (months 6 and 12)
  assert.equal(m[11].teamPartners, 10);
  assert.ok(m.every((x) => Number.isInteger(x.teamPartners) && Number.isInteger(x.payingMembers)));
});

test('random losses are repeatable and keep whole people', () => {
  const a = { ...DEFAULT_ASSUMPTIONS, personalActivations: { starter: 0, classic: 3, premium: 0 }, losses: { on: true, random: true, members: { count: 1, every: 2 }, partners: { count: 1, every: 6 } } };
  const one = simulate(a, profile, prices, opts).map((x) => x.payingMembers);
  const two = simulate(a, profile, prices, opts).map((x) => x.payingMembers);
  assert.deepEqual(one, two);
  assert.ok(one.every(Number.isInteger));
  assert.ok(one[11] < 36);
});

test('toCadence: whole Partners per month, or 1 every whole number of months', () => {
  assert.deepEqual(toCadence(0), { count: 0, every: 1 });
  assert.deepEqual(toCadence(0.4), { count: 1, every: 2 });
  assert.deepEqual(toCadence(0.2), { count: 1, every: 4 }); // 1 every 5 isn't a choice → every 4
  assert.deepEqual(toCadence(0.0001), { count: 1, every: 12 });
  assert.deepEqual(toCadence(1.2), { count: 2, every: 1 });
});

test('goal planner finds a whole-number monthly plan that reaches MD within 6 months', () => {
  for (const style of ['personal', 'balanced', 'team'] as const) {
    const g = planGoal({ kind: 'rank', rank: 'md' }, style, 6, profile, prices, opts);
    assert.ok(g.plan, style);
    assert.ok(g.reachedIn !== null && g.reachedIn < 6, style);
    assert.equal(g.milestones[0].rank, 'md');
    const p = g.plan!;
    for (const c of [p.personalActivations, p.partnerActivations]) assert.ok(Object.values(c).every(Number.isInteger), style);
    for (const c of [p.newPartners, p.teamNewPartners]) assert.ok(Number.isInteger(c.count) && Number.isInteger(c.every), style);
    assert.ok(g.months.every((m) => Number.isInteger(m.teamPartners)), style);
  }
});

test('goal planner: an existing business can already meet the goal with no extra activity', () => {
  const from = { members: { starter: 0, classic: 0, premium: 20 }, legs: [] }; // $5,000 / mo personal recurring
  const g = planGoal({ kind: 'rank', rank: 'md' }, 'balanced', 6, profile, prices, { ...opts, from });
  assert.equal(g.reachedIn, 0);
  assert.equal(g.plan!.newPartners.count, 0);
});

test('starting from Structure: this month\'s real activations replace the typical month in month 0', () => {
  const a = { ...DEFAULT_ASSUMPTIONS, personalActivations: { starter: 0, classic: 1, premium: 0 } };
  const from = { members: { starter: 0, classic: 0, premium: 0 }, legs: [], activations: { starter: 0, classic: 0, premium: 2 } };
  const m = simulate(a, profile, prices, { ...opts, from });
  assert.equal(m[0].result.production.personalActivation, 1_000);
  assert.equal(m[1].result.production.personalActivation, 200);
});

test('simulation can start from existing teams', () => {
  const from = { members: { starter: 0, classic: 0, premium: 0 }, legs: [{ partners: 3, members: { starter: 0, classic: 10, premium: 0 } }] };
  const m = simulate(DEFAULT_ASSUMPTIONS, profile, prices, { ...opts, from });
  assert.equal(m[0].legs, 1);
  assert.ok(m[0].result.production.rqp > 0);
});
