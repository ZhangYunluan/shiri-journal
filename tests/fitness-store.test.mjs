import test from 'node:test';
import assert from 'node:assert/strict';
import { clearData, deleteDay, exportData, importData, loadDays, saveDay } from '../fitness-store.mjs';

class MemoryStorage {
  #data = new Map();
  getItem(key) { return this.#data.get(key) ?? null; }
  setItem(key, value) { this.#data.set(key, String(value)); }
  removeItem(key) { this.#data.delete(key); }
}

const day = (overrides = {}) => ({
  date: '2026-09-26',
  sessions: [{ id: 's1', kind: 'strength', minutes: 45, effort: 7, intensity: null }],
  sleepHours: null,
  fatigue: null,
  soreness: null,
  painOrInjury: null,
  weightKg: null,
  foodNote: '',
  note: '',
  ...overrides
});

test('empty local storage loads as an empty diary', () => {
  assert.deepEqual(loadDays(new MemoryStorage()), []);
});

test('saved day can be loaded back including its sessions', () => {
  const storage = new MemoryStorage();
  saveDay(day(), storage);
  assert.deepEqual(loadDays(storage), [day()]);
});

test('one day can contain multiple activities', () => {
  const storage = new MemoryStorage();
  const multiple = day({ sessions: [
    { id: 's1', kind: 'strength', minutes: 45, effort: 7, intensity: null },
    { id: 's2', kind: 'cardio', minutes: 25, effort: 4, intensity: 'moderate' }
  ] });
  saveDay(multiple, storage);
  assert.deepEqual(loadDays(storage), [multiple]);
});

test('rest sessions must have zero minutes and no effort score', () => {
  const storage = new MemoryStorage();
  assert.throws(() => saveDay(day({
    sessions: [{ id: 'rest', kind: 'rest', minutes: 15, effort: 1, intensity: null }]
  }), storage), /休息/);
  assert.deepEqual(loadDays(storage), []);
});

test('invalid import leaves the current diary unchanged', () => {
  const storage = new MemoryStorage();
  saveDay(day(), storage);
  assert.throws(() => importData('{"schemaVersion":99,"days":[]}', storage), /版本/);
  assert.deepEqual(loadDays(storage), [day()]);
});

test('exported JSON can be imported and a date can be deleted', () => {
  const source = new MemoryStorage();
  const target = new MemoryStorage();
  saveDay(day(), source);
  importData(exportData(source), target);
  assert.deepEqual(loadDays(target), [day()]);
  deleteDay('2026-09-26', target);
  assert.deepEqual(loadDays(target), []);
  clearData(source);
  assert.deepEqual(loadDays(source), []);
});
