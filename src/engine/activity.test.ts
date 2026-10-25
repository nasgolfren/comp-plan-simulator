import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveActivity } from './activity.ts';
import type { ActivationEntry, ActivityHistory, Prices } from './types.ts';

const prices: Prices = {
  activation: { starter: 50, classic: 200, premium: 500 },
  monthly: { starter: 50, classic: 100, premium: 250 },
};
const zero = { starter: 0, classic: 0, premium: 0 };
const noHistory: ActivityHistory = { months1to2: zero, months3to5: zero, months6to11: zero, qbiNew: 0, qbiPaying: 0 };
// October 2026: starts on a Thursday, 31 days → weeks starting Sep 28, Oct 5, 12, 19, 26
const today = new Date(2026, 9, 25);
const entry = (date: string, plan: ActivationEntry['plan'], kind: ActivationEntry['kind'] = 'new'): ActivationEntry => ({ id: date + plan, date, plan, kind });

test('counts and first-ever share come from this month\'s entries only', () => {
  const log = [entry('2026-10-03', 'premium'), entry('2026-10-12', 'classic', 'upgrade'), entry('2026-10-20', 'classic'), entry('2026-09-30', 'premium')];
  const a = deriveActivity(log, noHistory, 0, prices, today);
  assert.deepEqual(a.counts, { starter: 0, classic: 2, premium: 1 });
  assert.equal(a.newShare, 2 / 3);
});

test('QBI is the share of new Classic/Premium members still paying, 100% without any', () => {
  assert.equal(deriveActivity([], { ...noHistory, qbiNew: 20, qbiPaying: 14 }, 0, prices, today).qbi, 0.7);
  assert.equal(deriveActivity([], noHistory, 0, prices, today).qbi, 1);
});

test('Minimum Activations: the longer windows add up the history', () => {
  const history = { ...noHistory, months1to2: { starter: 0, classic: 2, premium: 0 }, months3to5: { starter: 0, classic: 0, premium: 1 } };
  const a = deriveActivity([entry('2026-10-05', 'classic')], history, 0, prices, today);
  assert.deepEqual(a.windows.map((w) => w.amount), [600, 1_100, 1_100]); // 90 days: 200 + 400
  assert.equal(a.longWindowMet, true); // $600 in 90 days
});

test('Weekly Matching: your dated activations per week, Partners spread evenly', () => {
  // $3,100 from direct Partners over 31 days = $100 a day → full weeks get $700, Sep 28 week gets $400 (4 days)
  const log = [entry('2026-10-01', 'classic'), entry('2026-10-06', 'classic'), entry('2026-10-14', 'starter')];
  const a = deriveActivity(log, noHistory, 3_100, prices, today);
  assert.equal(a.weeks.length, 5);
  assert.deepEqual(a.weeks.map((w) => w.qualifies), [false, true, false, false, false]);
  assert.equal(a.matchingShare, 1 / 5);
});
