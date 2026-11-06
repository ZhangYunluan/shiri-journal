const DAY_MS = 24 * 60 * 60 * 1000;

const dateOffset = (date, offset) => new Date(Date.parse(`${date}T00:00:00.000Z`) + offset * DAY_MS)
  .toISOString().slice(0, 10);

export const getPreviousActivityTemplate = (days, beforeDate) => {
  const previous = days
    .filter((day) => day.date < beforeDate)
    .slice()
    .sort((left, right) => right.date.localeCompare(left.date))[0];
  if (!previous) return null;

  return {
    sourceDate: previous.date,
    sessions: previous.sessions.map(({ kind, minutes, intensity }) => ({ kind, minutes, intensity }))
  };
};

export const getWeeklyCalendar = (days, today) => {
  const entries = new Map(days.map((day) => [day.date, day]));
  return Array.from({ length: 7 }, (_, index) => {
    const date = dateOffset(today, index - 6);
    const entry = entries.get(date);
    const status = !entry
      ? 'empty'
      : entry.sessions.some((session) => session.kind !== 'rest') ? 'training' : 'rest';
    return { date, status };
  });
};
