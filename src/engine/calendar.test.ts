import { test } from 'node:test';
import assert from 'node:assert/strict';
import { businessDay, eventsForMonth } from './calendar.ts';
import type { CalendarInput } from './calendar.ts';

const income = { dab: 70, mab: 60, matching: 200, tlb: 300, recurring: 205, bbb: 0, fastStart: 0 };
const base: CalendarInput = {
  today: new Date(2026, 9, 25), // October 2026
  isMember: true, isPartner: true, memberPlan: 'classic',
  memberSince: new Date(2026, 4, 31), partnerSince: new Date(2026, 3, 12),
  activations: [{ id: 'a', date: '2026-10-06', plan: 'classic', kind: 'new' }, { id: 'b', date: '2026-10-31', plan: 'premium', kind: 'new' }],
  weeks: [{ start: new Date(2026, 9, 5), personal: 200, directs: 700, qualifies: true }, { start: new Date(2026, 9, 12), personal: 0, directs: 700, qualifies: false }],
  income,
};
const iso = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;

test('weekend dates move to the next business day', () => {
  assert.equal(iso(businessDay(new Date(2026, 10, 8))), '11/9'); // Sunday 8 Nov → Monday 9
  assert.equal(iso(businessDay(new Date(2026, 10, 14))), '11/16'); // Saturday 14 Nov → Monday 16
});

test('this month: DAB the day after, matching the Monday after a qualifying week, month close', () => {
  const ev = eventsForMonth(2026, 9, base);
  assert.deepEqual(ev.filter((e) => e.key === 'activation').map((e) => [iso(e.date), e.amount]), [['10/6', 200], ['10/31', 500]]);
  assert.deepEqual(ev.filter((e) => e.key === 'dab').map((e) => iso(e.date)), ['10/7']); // the Oct 31 one pays Nov 1
  assert.deepEqual(ev.filter((e) => e.key === 'matching').map((e) => [iso(e.date), e.amount]), [['10/12', 200]]);
  assert.equal(iso(ev.find((e) => e.key === 'close')!.date), '10/31');
  // membership on the 31st every month
  assert.deepEqual(ev.filter((e) => e.key === 'membership').map((e) => [iso(e.date), e.amount]), [['10/31', 100]]);
  // renewal: April + 6 = October 12
  assert.deepEqual(ev.filter((e) => e.key === 'renewal').map((e) => iso(e.date)), ['10/12']);
});

test('next month: monthly payouts on their schedule days, zero amounts skipped', () => {
  const ev = eventsForMonth(2026, 10, base);
  const at = (k: string) => ev.filter((e) => e.key === k).map((e) => iso(e.date));
  assert.deepEqual(at('dab'), ['11/1']);
  assert.deepEqual(at('mab'), ['11/9']); // 8 Nov is a Sunday
  assert.deepEqual(at('tlb'), ['11/10']);
  assert.deepEqual(at('recurring'), ['11/16']); // 15 Nov is a Sunday
  assert.deepEqual(at('bbb'), []);
  assert.deepEqual(at('membership'), ['11/30']); // clamped to the 30th
});
