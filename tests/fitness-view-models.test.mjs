import test from 'node:test';
import assert from 'node:assert/strict';
import { getPreviousActivityTemplate, getWeeklyCalendar } from '../fitness-view-models.mjs';

const day = (date, sessions, extras = {}) => ({ date, sessions, ...extras });

test('previous activity template copies only activity fields from the latest earlier day', () => {
  const days = [
    day('2026-09-24', [
      { id: 'old', kind: 'sport', minutes: 60, effort: 8, intensity: null }
    ]),
    day('2026-09-27', [
      { id: 'new', kind: 'cardio', minutes: 25, effort: 6, intensity: 'moderate' }
    ], { sleepHours: 7.5, weightKg: 70, note: '不要复制' }),
    day('2026-09-28', [
      { id: 'today', kind: 'strength', minutes: 40, effort: 7, intensity: null }
    ])
  ];

  assert.deepEqual(getPreviousActivityTemplate(days, '2026-09-28'), {
    sourceDate: '2026-09-27',
    sessions: [{ kind: 'cardio', minutes: 25, intensity: 'moderate' }]
  });
});

test('previous activity template is absent when no earlier record exists', () => {
  assert.equal(getPreviousActivityTemplate([
    day('2026-09-28', [{ kind: 'strength', minutes: 30 }])
  ], '2026-09-28'), null);
});

test('weekly calendar contains seven days and distinguishes training, rest, and empty dates', () => {
  const days = [
    day('2026-09-23', [{ kind: 'rest', minutes: 0 }]),
    day('2026-09-25', [{ kind: 'sport', minutes: 60 }, { kind: 'rest', minutes: 0 }])
  ];

  assert.deepEqual(getWeeklyCalendar(days, '2026-09-28'), [
    { date: '2026-09-22', status: 'empty' },
    { date: '2026-09-23', status: 'rest' },
    { date: '2026-09-24', status: 'empty' },
    { date: '2026-09-25', status: 'training' },
    { date: '2026-09-26', status: 'empty' },
    { date: '2026-09-27', status: 'empty' },
    { date: '2026-09-28', status: 'empty' }
  ]);
});
