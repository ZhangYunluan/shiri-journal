const DAY_MS = 24 * 60 * 60 * 1000;

const dateKey = (date) => {
  if (date instanceof Date) return date.toISOString().slice(0, 10);
  return date;
};

const dateOffset = (date, offset) => new Date(Date.parse(`${date}T00:00:00.000Z`) + offset * DAY_MS)
  .toISOString().slice(0, 10);

const windowDays = (days, today, length) => {
  const end = dateKey(today);
  const start = dateOffset(end, -(length - 1));
  return days
    .filter((day) => day.date >= start && day.date <= end)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));
};

const sessionsOf = (day) => Array.isArray(day.sessions) ? day.sessions : [];

export const getWeeklySummary = (days, today) => {
  const recent = windowDays(days, today, 7);
  let activityMinutes = 0;
  let moderateMinutes = 0;
  let vigorousMinutes = 0;
  const trainingDates = new Set();
  const strengthDates = new Set();
  const sleeps = [];
  const weights = [];

  for (const day of recent) {
    for (const session of sessionsOf(day)) {
      if (session.kind === 'rest') continue;
      activityMinutes += session.minutes;
      trainingDates.add(day.date);
      if (session.kind === 'strength') strengthDates.add(day.date);
      if (session.kind === 'cardio' && session.intensity === 'moderate') moderateMinutes += session.minutes;
      if (session.kind === 'cardio' && session.intensity === 'vigorous') vigorousMinutes += session.minutes;
    }
    if (typeof day.sleepHours === 'number' && Number.isFinite(day.sleepHours)) sleeps.push(day.sleepHours);
    if (typeof day.weightKg === 'number' && Number.isFinite(day.weightKg)) weights.push({ date: day.date, value: day.weightKg });
  }

  const averageSleepHours = sleeps.length
    ? Math.round((sleeps.reduce((sum, value) => sum + value, 0) / sleeps.length) * 10) / 10
    : null;
  const latestWeightKg = weights.length ? weights.at(-1).value : null;
  const weightChangeKg = weights.length > 1 ? Math.round((weights.at(-1).value - weights[0].value) * 10) / 10 : null;

  return {
    activityMinutes,
    trainingDays: trainingDates.size,
    strengthDays: strengthDates.size,
    moderateEquivalentMinutes: moderateMinutes + vigorousMinutes * 2,
    moderateMinutes,
    vigorousMinutes,
    averageSleepHours,
    latestWeightKg,
    weightChangeKg
  };
};

const hasRecoveryConcern = (day) => day.painOrInjury === true || day.fatigue >= 4 || day.soreness >= 4;

export const getTodayAdvice = (days, today) => {
  const end = dateKey(today);
  const recentThree = windowDays(days, end, 3);
  const summary = getWeeklySummary(days, end);
  const daysWithRecords = new Set(recentThree.map((day) => day.date)).size;
  const missingData = [];
  if (!recentThree.some((day) => typeof day.sleepHours === 'number')) missingData.push('睡眠时长');
  if (!recentThree.some((day) => typeof day.fatigue === 'number')) missingData.push('疲劳程度');
  if (!recentThree.some((day) => typeof day.soreness === 'number')) missingData.push('酸痛程度');
  if (!recentThree.some((day) => typeof day.painOrInjury === 'boolean')) missingData.push('疼痛/受伤感');

  const hasRecoveryData = recentThree.some((day) => typeof day.fatigue === 'number' || typeof day.soreness === 'number' || typeof day.painOrInjury === 'boolean');
  const confidence = daysWithRecords < 2 || !hasRecoveryData ? 'low' : 'moderate';
  const concern = recentThree.find(hasRecoveryConcern);

  if (concern) {
    const reason = concern.painOrInjury === true
      ? `${concern.date} 标记了明显疼痛或受伤感。`
      : `${concern.date} 记录的疲劳或酸痛达到 4/5。`;
    return {
      title: '给身体留出恢复空间',
      action: '今天先休息，或只做不会加重不适的轻松活动。',
      reason: `${reason} 先避免加量或高强度训练。`,
      confidence,
      missingData
    };
  }

  const todayEntry = recentThree.find((day) => day.date === end);
  if (todayEntry && sessionsOf(todayEntry).some((session) => session.kind !== 'rest')) {
    return {
      title: '今天已完成训练',
      action: '训练已记下，今天以补水、正常进食和恢复为主；如果还想活动，选择轻松散步或拉伸。',
      reason: '今天已有训练记录，不需要为了达成周目标再追加一节训练。',
      confidence,
      missingData
    };
  }

  if (todayEntry && sessionsOf(todayEntry).some((session) => session.kind === 'rest')) {
    return {
      title: '今天安排了休息',
      action: '按计划恢复即可；不必为了补训练而加练，明天再根据身体状态安排。',
      reason: '今天已记录休息，规律训练也需要留出恢复时间。',
      confidence,
      missingData
    };
  }

  if (daysWithRecords < 2) {
    return {
      title: '先补一笔近况',
      action: '今天选择轻松活动或休息，并记录训练/休息与身体状态。',
      reason: '近 3 天少于 2 天有记录，目前依据不足，暂时不建议增加训练量。',
      confidence: 'low',
      missingData
    };
  }

  if (summary.strengthDays < 2) {
    return {
      title: '安排一节适中力量训练',
      action: '选择熟悉的全身力量动作，保持可控强度，训练后记录主观用力程度。',
      reason: `本周已记录 ${summary.strengthDays} 天力量训练，成人通用活动参考为每周至少 2 天肌肉强化活动。`,
      confidence,
      missingData
    };
  }

  if (summary.moderateEquivalentMinutes < 150) {
    const remaining = 150 - summary.moderateEquivalentMinutes;
    return {
      title: '补一点中等强度有氧',
      action: '安排 20–30 分钟快走、骑行或熟悉的中等强度有氧。',
      reason: `本周已标注强度的有氧约 ${summary.moderateEquivalentMinutes} 分钟中等强度等量，距离通用参考值 150 分钟还差约 ${remaining} 分钟。`,
      confidence,
      missingData
    };
  }

  return {
    title: '保持节奏，安排恢复',
    action: '今天以休息、散步或轻松活动为主，再按状态安排下一次训练。',
    reason: '本周记录已达到成人通用活动参考值；保持规律并留意恢复状态。',
    confidence,
    missingData
  };
};
