import test from 'node:test';
import assert from 'node:assert/strict';
import { getTodayAdvice, getWeeklySummary } from '../fitness-advice.mjs';

const entry = (date, sessions, extras = {}) => ({
  date,
  sessions,
  sleepHours: null,
  fatigue: null,
  soreness: null,
  painOrInjury: null,
  weightKg: null,
  ...extras
});

const session = (kind, minutes, intensity = null, effort = 5) => ({
  id: `${kind}-${minutes}-${intensity ?? 'none'}`,
  kind,
  minutes,
  effort,
  intensity
});

test('empty week has zero activity and no invented recovery or weight values', () => {
  assert.deepEqual(getWeeklySummary([], '2026-09-26'), {
    activityMinutes: 0,
    trainingDays: 0,
    strengthDays: 0,
    moderateEquivalentMinutes: 0,
    moderateMinutes: 0,
    vigorousMinutes: 0,
    averageSleepHours: null,
    latestWeightKg: null,
    weightChangeKg: null
  });
});

test('weekly summary counts a strength day and converts vigorous aerobic minutes', () => {
  const days = [
    entry('2026-09-26', [session('strength', 30), session('cardio', 30, 'moderate')]),
    entry('2026-09-25', [session('cardio', 15, 'vigorous')]),
    entry('2026-09-24', [session('cardio', 40)])
  ];
  const summary = getWeeklySummary(days, '2026-09-26');
  assert.equal(summary.strengthDays, 1);
  assert.equal(summary.moderateMinutes, 30);
  assert.equal(summary.vigorousMinutes, 15);
  assert.equal(summary.moderateEquivalentMinutes, 60);
  assert.equal(summary.activityMinutes, 115);
});

test('fewer than two logged days in the last three produces a low-confidence suggestion', () => {
  const advice = getTodayAdvice([
    entry('2026-09-26', [session('strength', 30)])
  ], '2026-09-26');
  assert.equal(advice.confidence, 'low');
  assert.match(advice.reason, /记录/);
});

test('pain or high reported fatigue prioritizes recovery', () => {
  const days = [
    entry('2026-09-26', [session('sport', 60)], { painOrInjury: true, fatigue: 2 }),
    entry('2026-09-25', [session('strength', 40)], { fatigue: 4 }),
    entry('2026-09-24', [session('cardio', 30, 'moderate')], { soreness: 4 })
  ];
  const advice = getTodayAdvice(days, '2026-09-26');
  assert.match(advice.title, /恢复|休息/);
  assert.match(advice.reason, /疼痛|受伤|疲劳|酸痛/);
});

test('with enough clean records, an unmet strength minimum recommends strength first', () => {
  const days = [
    entry('2026-09-25', [session('cardio', 30, 'moderate')], { fatigue: 2, soreness: 1 }),
    entry('2026-09-24', [session('sport', 45)], { fatigue: 2, soreness: 1 })
  ];
  const advice = getTodayAdvice(days, '2026-09-26');
  assert.match(advice.action, /力量/);
  assert.ok(advice.reason.length > 0);
});

test('a training entry for today prevents recommending a second workout today', () => {
  const days = [
    entry('2026-09-26', [session('strength', 45)], { fatigue: 2, soreness: 1, painOrInjury: false }),
    entry('2026-09-25', [session('sport', 60)], { fatigue: 2, soreness: 1, painOrInjury: false })
  ];
  const advice = getTodayAdvice(days, '2026-09-26');
  assert.match(advice.title, /今天已完成/);
  assert.match(advice.action, /恢复|休息/);
});
