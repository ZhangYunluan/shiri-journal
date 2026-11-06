const STORAGE_KEY = 'fitness-diary:v1';
const SESSION_KINDS = new Set(['strength', 'cardio', 'sport', 'other', 'rest']);
const INTENSITIES = new Set(['easy', 'moderate', 'vigorous']);

const storageError = (detail = '') => new Error(
  `本机记录暂时无法读取或保存${detail ? `：${detail}` : '。请检查浏览器存储设置。'}`
);

const requireStorage = (storage) => {
  if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
    throw storageError('浏览器不支持本机存储');
  }
  return storage;
};

const validDate = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
};

const optionalNumber = (value, min, max, integer = false) => value === null || (
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max && (!integer || Number.isInteger(value))
);

const validateSession = (session) => {
  if (!session || typeof session !== 'object') throw new Error('活动记录格式不正确。');
  if (typeof session.id !== 'string' || !session.id.trim()) throw new Error('每项活动都需要唯一编号。');
  if (!SESSION_KINDS.has(session.kind)) throw new Error('活动类型不正确。');
  if (!Number.isInteger(session.minutes) || session.minutes < 0 || session.minutes > 1440) throw new Error('活动时长需为 0–1440 分钟。');
  if (session.kind === 'rest') {
    if (session.minutes !== 0 || session.effort !== null || session.intensity !== null) {
      throw new Error('休息记录的时长和强度必须为空。');
    }
    return;
  }
  if (session.minutes < 1) throw new Error('训练活动至少记录 1 分钟。');
  if (!Number.isInteger(session.effort) || session.effort < 1 || session.effort > 10) throw new Error('主观强度需为 1–10。');
  if (session.kind === 'cardio') {
    if (session.intensity !== null && !INTENSITIES.has(session.intensity)) throw new Error('有氧强度选项不正确。');
  } else if (session.intensity !== null) {
    throw new Error('只有有氧活动可以设置轻松、中等或剧烈强度。');
  }
};

const validateDay = (day) => {
  if (!day || typeof day !== 'object' || !validDate(day.date)) throw new Error('日期格式不正确。');
  if (!Array.isArray(day.sessions) || day.sessions.length === 0) throw new Error('每天至少添加一项活动或休息记录。');
  const ids = new Set();
  for (const session of day.sessions) {
    validateSession(session);
    if (ids.has(session.id)) throw new Error('同一天内活动编号不能重复。');
    ids.add(session.id);
  }
  if (!optionalNumber(day.sleepHours, 0, 24)) throw new Error('睡眠时长需为 0–24 小时。');
  if (!optionalNumber(day.fatigue, 1, 5, true)) throw new Error('疲劳程度需为 1–5。');
  if (!optionalNumber(day.soreness, 1, 5, true)) throw new Error('酸痛程度需为 1–5。');
  if (day.painOrInjury !== null && typeof day.painOrInjury !== 'boolean') throw new Error('疼痛/受伤感需选择是、否或暂不记录。');
  if (!optionalNumber(day.weightKg, 20, 500)) throw new Error('体重需为 20–500 公斤。');
  if (typeof day.foodNote !== 'string' || typeof day.note !== 'string') throw new Error('饮食和备注需为文字。');
  return structuredClone(day);
};

const readPayload = (storage) => {
  const current = requireStorage(storage).getItem(STORAGE_KEY);
  if (current === null) return { schemaVersion: 1, days: [] };
  try {
    const parsed = JSON.parse(current);
    if (parsed?.schemaVersion !== 1 || !Array.isArray(parsed.days)) throw new Error();
    return { schemaVersion: 1, days: parsed.days.map(validateDay) };
  } catch {
    throw storageError('记录文件格式损坏；原数据未更改');
  }
};

const writePayload = (storage, days) => {
  try {
    requireStorage(storage).setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 1, days }));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('本机记录')) throw error;
    throw storageError(error instanceof Error ? error.message : '未知错误');
  }
};

const globalStorage = () => {
  try {
    return globalThis.localStorage;
  } catch {
    throw storageError('浏览器存储不可用');
  }
};

export const loadDays = (storage = globalStorage()) => readPayload(storage).days;

export const saveDay = (day, storage = globalStorage()) => {
  const valid = validateDay(day);
  const payload = readPayload(storage);
  const index = payload.days.findIndex((entry) => entry.date === valid.date);
  if (index === -1) payload.days.push(valid);
  else payload.days[index] = valid;
  payload.days.sort((a, b) => a.date.localeCompare(b.date));
  writePayload(storage, payload.days);
  return structuredClone(valid);
};

export const deleteDay = (date, storage = globalStorage()) => {
  if (!validDate(date)) throw new Error('日期格式不正确。');
  const days = readPayload(storage).days.filter((entry) => entry.date !== date);
  writePayload(storage, days);
};

export const exportData = (storage = globalStorage()) => JSON.stringify(readPayload(storage), null, 2);

export const importData = (json, storage = globalStorage()) => {
  let parsed;
  try {
    parsed = typeof json === 'string' ? JSON.parse(json) : json;
  } catch {
    throw new Error('备份文件不是有效的 JSON。');
  }
  if (parsed?.schemaVersion !== 1) throw new Error('备份版本不受支持。');
  if (!Array.isArray(parsed.days)) throw new Error('备份中的日记列表格式不正确。');
  const days = parsed.days.map(validateDay);
  const dates = new Set(days.map((entry) => entry.date));
  if (dates.size !== days.length) throw new Error('备份中同一天出现了重复日记。');
  days.sort((a, b) => a.date.localeCompare(b.date));
  writePayload(storage, days);
  return days.length;
};

export const clearData = (storage = globalStorage()) => {
  try {
    const target = requireStorage(storage);
    if (typeof target.removeItem === 'function') target.removeItem(STORAGE_KEY);
    else target.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 1, days: [] }));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('本机记录')) throw error;
    throw storageError(error instanceof Error ? error.message : '未知错误');
  }
};
