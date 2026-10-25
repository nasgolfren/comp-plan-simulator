import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcMonth } from './calc.ts';
import { findNode, flattenTeam, removeNode, summarizeTeam, teamToLegs, toMonthInput } from './team.ts';
import type { BusinessMonth, CalcProfile, PartnerNode, Prices } from './types.ts';

const prices: Prices = {
  activation: { starter: 50, classic: 200, premium: 500 },
  monthly: { starter: 50, classic: 100, premium: 250 },
};
const zero = { starter: 0, classic: 0, premium: 0 };
const node = (id: string, o: Partial<PartnerNode> = {}): PartnerNode => ({
  id, name: id, activations: zero, payingMembers: zero, restActivationVolume: 0, restRecurringVolume: 0, children: [], ...o,
});
const profile: CalcProfile = { isMember: false, isPartner: true, memberPlan: 'classic', renewalCurrent: true, fastStartMonth: false };

test('summarizeTeam adds up each subtree', () => {
  const team = [node('a', {
    activations: { starter: 0, classic: 1, premium: 0 }, // 200
    payingMembers: { starter: 0, classic: 2, premium: 0 }, // 200 / mo
    children: [node('b', { activations: { starter: 0, classic: 0, premium: 1 } }), node('c', { restActivationVolume: 300, restRecurringVolume: 50 })],
  })];
  const s = summarizeTeam(team, prices);
  assert.equal(s.get('a')!.teamActivation, 200 + 500 + 300);
  assert.equal(s.get('a')!.teamRecurring, 200 + 50);
  assert.equal(s.get('a')!.size, 2);
  assert.equal(s.get('c')!.teamActivation, 300);
});

test('a Partner\'s rank is computed from their own subtree', () => {
  // b: own 6 Premium = $3,000 → MD (QP from personal production counts in full; TAV $3,000 ≥ $600)
  const team = [node('a', { children: [node('b', { activations: { starter: 0, classic: 0, premium: 6 } })] })];
  const s = summarizeTeam(team, prices);
  assert.equal(s.get('b')!.rank, 'md');
  // a only has b's $3,000 as one leg, capped at $1,200 → no rank
  assert.equal(s.get('a')!.rank, 'none');
});

test('teamToLegs: one leg per direct Partner with the rest of their tree as other volume', () => {
  const team = [node('a', {
    activations: { starter: 0, classic: 1, premium: 0 },
    children: [node('b', { activations: { starter: 0, classic: 0, premium: 2 }, payingMembers: { starter: 0, classic: 0, premium: 1 } })],
  })];
  const [leg] = teamToLegs(team, prices);
  assert.deepEqual(leg.headActivations, { starter: 0, classic: 1, premium: 0 });
  assert.equal(leg.otherActivationVolume, 1000);
  assert.equal(leg.recurringVolume, 250);
});

test('toMonthInput feeds the tree into the monthly calculation', () => {
  const month: BusinessMonth = {
    activationLog: [], personalPayingMembers: zero,
    history: { months1to2: zero, months3to5: zero, months6to11: zero, qbiNew: 0, qbiPaying: 0 },
    team: [node('a', { restActivationVolume: 1_000 }), node('b', { restActivationVolume: 1_000 }), node('c', { restActivationVolume: 1_000 })],
  };
  const r = calcMonth(toMonthInput(month, prices), profile, prices);
  assert.equal(r.production.tav, 3_000);
  assert.equal(r.qpRank, 'md'); // three legs of $1,000, each under the $1,200 cap
});

test('tree helpers find, flatten and remove Partners', () => {
  const team = [node('a', { children: [node('b', { children: [node('c')] })] }), node('d')];
  assert.equal(findNode(team, 'c')?.id, 'c');
  assert.deepEqual(flattenTeam(team).map((x) => `${x.node.id}${x.level}`), ['a0', 'b1', 'c2', 'd0']);
  assert.equal(removeNode(team, 'b'), true);
  assert.deepEqual(flattenTeam(team).map((x) => x.node.id), ['a', 'd']);
});
