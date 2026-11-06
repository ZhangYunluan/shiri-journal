import { clearData, deleteDay, exportData, importData, loadDays, saveDay } from './fitness-store.mjs';
import { getTodayAdvice, getWeeklySummary } from './fitness-advice.mjs';
import { getPreviousActivityTemplate, getWeeklyCalendar } from './fitness-view-models.mjs';

const views = ['today', 'log', 'trends'];
const activityLabels = { strength: '力量训练', cardio: '有氧', sport: '球类 / 运动', other: '其他活动', rest: '休息' };
const intensityLabels = { easy: '轻松', moderate: '中等', vigorous: '剧烈' };
const state = { days: [], view: 'today', date: localDate(), storeError: '' };
let toastTimer = 0;
let sessionSequence = 0;

function localDate(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function formatDate(date, options = { month: 'numeric', day: 'numeric', weekday: 'short' }) {
  const parsed = new Date(`${date}T00:00:00`);
  return new Intl.DateTimeFormat('zh-CN', options).format(parsed);
}

function getDay(date) {
  return state.days.find((day) => day.date === date) ?? null;
}

function getSessions(date) {
  return getDay(date)?.sessions ?? [];
}

function newId() {
  sessionSequence += 1;
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${sessionSequence}`;
}

function showToast(message, kind = 'info') {
  const toast = document.querySelector('#toast');
  toast.textContent = message;
  toast.dataset.kind = kind;
  toast.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { toast.hidden = true; }, 3600);
}

function refreshDays() {
  state.storeError = '';
  try {
    state.days = loadDays();
  } catch (error) {
    state.days = [];
    state.storeError = error.message;
  }
}

function pageHeading(title, description, trailing = '') {
  return `<header class="page-heading"><div><h1>${title}</h1><p>${description}</p></div>${trailing}</header>`;
}

function summaryItem(label, value, unit, note) {
  return `<div class="summary-item"><div class="summary-label">${label}</div><div class="summary-value">${value}${unit ? `<span class="summary-unit">${unit}</span>` : ''}</div><div class="summary-note">${note}</div></div>`;
}

function renderStoreWarning() {
  return state.storeError
    ? `<p class="empty-note" role="alert">${escapeHtml(state.storeError)}。你仍可查看当前页面，但暂时无法保存新记录。</p>`
    : '';
}

function renderToday() {
  const today = localDate();
  const advice = getTodayAdvice(state.days, today);
  const summary = getWeeklySummary(state.days, today);
  const todayRecord = getDay(today);
  const recent = state.days.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);
  const confidenceText = advice.confidence === 'low' ? '依据较少' : '依据近期记录';
  const missing = advice.missingData.length
    ? `<p class="missing-data">补充后建议会更贴合：${advice.missingData.map(escapeHtml).join('、')}</p>`
    : '';
  const todaySessions = todayRecord?.sessions.map((item) => activityLabels[item.kind]).join('、') ?? '';
  const weekDays = getWeeklyCalendar(state.days, today);
  const weekStatusLabels = { training: '练', rest: '休', empty: '未记' };
  const weekStrip = weekDays.map(({ date, status }) => {
    const isToday = date === today;
    const accessibleDate = formatDate(date, { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
    return `<button class="week-day" type="button" data-edit-date="${date}" data-status="${status}" ${isToday ? 'aria-current="date"' : ''} aria-label="${escapeHtml(accessibleDate)}，${weekStatusLabels[status]}，点按记录或查看">
      <span class="week-day-name">${escapeHtml(formatDate(date, { weekday: 'short' }))}</span>
      <strong>${date.slice(8)}</strong>
      <span class="week-day-status">${weekStatusLabels[status]}</span>
    </button>`;
  }).join('');
  const recentMarkup = recent.length ? recent.map((day) => {
    const activities = day.sessions.map((item) => activityLabels[item.kind]).join('、');
    const minutes = day.sessions.reduce((total, item) => total + item.minutes, 0);
    return `<div class="recent-entry">
      <span class="recent-date">${escapeHtml(formatDate(day.date))}</span>
      <div class="recent-main">${escapeHtml(activities || '日常记录')}<div class="recent-meta">${minutes ? `${minutes} 分钟活动` : '休息记录'}${day.sleepHours !== null ? ` · 睡眠 ${day.sleepHours} 小时` : ''}</div></div>
      <span class="recent-weight">${day.weightKg !== null ? `${day.weightKg} kg` : ''}</span>
    </div>`;
  }).join('') : '<p class="empty-note">还没有记录。完成一次训练后花半分钟记下来，趋势和建议就会逐渐有依据。</p>';

  document.querySelector('#view-today').innerHTML = `
    ${pageHeading('今天怎么练', '根据最近记录，给自己一个清楚、可执行的下一步。', `<span class="date-label">${escapeHtml(formatDate(today, { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }))}</span>`)}
    ${renderStoreWarning()}
    <section class="suggestion" aria-labelledby="advice-title">
      <div class="hero-copy">
        <div class="suggestion-top"><span class="suggestion-label">今天的训练方向</span><span class="confidence">${confidenceText}</span></div>
        <h2 id="advice-title">${escapeHtml(advice.title)}</h2>
        <p class="suggestion-action">${escapeHtml(advice.action)}</p>
        <p class="suggestion-reason">${escapeHtml(advice.reason)}</p>
      </div>
      <div class="hero-rail">
        <span class="hero-rail-label">练得有依据，也留意恢复</span>
        ${todaySessions ? `<p class="hero-recorded"><span>今天已记</span>${escapeHtml(todaySessions)}</p>` : '<p class="hero-recorded"><span>今天还没记录</span>练完后花半分钟记下来</p>'}
        <div class="suggestion-actions"><button class="button button-primary" type="button" data-view="log">${todayRecord ? '更新今天记录' : '记录今天'}<span aria-hidden="true">↗</span></button><button class="button" type="button" data-view="trends">看本周趋势</button></div>
        ${missing ? `<div class="hero-missing">${missing}</div>` : ''}
      </div>
    </section>

    <div class="section-title"><h2>这一周</h2><p>点日期即可补记或查看</p></div>
    <div class="week-strip" role="group" aria-label="最近 7 天训练记录">${weekStrip}</div>
    <div class="section-title"><h2>近 7 天概览</h2><p>根据你实际记录的内容</p></div>
    <div class="summary-grid">
      ${summaryItem('训练天数', summary.trainingDays, '天', '有训练的不同日期')}
      ${summaryItem('力量训练', summary.strengthDays, '天', '每周通用参考：2 天')}
      ${summaryItem('活动时长', summary.activityMinutes, '分钟', '所有已记录活动')}
      ${summaryItem('平均睡眠', summary.averageSleepHours ?? '—', summary.averageSleepHours === null ? '' : '小时', summary.averageSleepHours === null ? '记录后显示平均值' : '已记录日期的均值')}
      ${summaryItem('最近体重', summary.latestWeightKg ?? '—', summary.latestWeightKg === null ? '' : 'kg', summary.latestWeightKg === null ? '可选记录' : '只看趋势，不评判单日变化')}
      ${summaryItem('有氧进度', summary.moderateEquivalentMinutes, '分钟', '中等强度等量 · 通用参考 150 分钟')}
    </div>

    <div class="section-title"><h2>最近记录</h2><button class="button button-small" type="button" data-view="trends">查看全部</button></div>
    <div class="recent-list">${recentMarkup}</div>`;
}

function option(value, label, selected = false) {
  return `<option value="${value}"${selected ? ' selected' : ''}>${label}</option>`;
}

function sessionRow(session = {}, index = sessionSequence) {
  const kind = session.kind ?? 'strength';
  const isRest = kind === 'rest';
  const minutesValue = session.minutes ?? (isRest ? 0 : 30);
  const effortValue = session.effort ?? (isRest ? '' : 5);
  const intensityValue = session.intensity ?? '';
  const id = session.id ?? `draft-${index}`;
  return `<div class="session-row" data-session-row data-id="${escapeHtml(id)}">
    <div class="session-row-head"><strong>活动</strong></div>
    <div class="session-row-fields">
      <div class="field"><label for="session-kind-${index}">类型</label><select class="select" id="session-kind-${index}" data-session-field="kind">
        ${option('strength', '力量训练', kind === 'strength')}${option('cardio', '有氧', kind === 'cardio')}${option('sport', '球类 / 运动', kind === 'sport')}${option('other', '其他活动', kind === 'other')}${option('rest', '休息', kind === 'rest')}
      </select></div>
      <div class="field"><label for="session-minutes-${index}">时长（分）</label><input class="input" id="session-minutes-${index}" data-session-field="minutes" type="number" min="0" max="1440" step="1" value="${minutesValue}" ${isRest ? 'readonly' : 'required'}></div>
      <div class="field"><label for="session-effort-${index}">用力程度</label><select class="select" id="session-effort-${index}" data-session-field="effort" ${isRest ? 'disabled' : 'required'}>
        ${option('', '选择', isRest || !effortValue)}${Array.from({ length: 10 }, (_, i) => option(String(i + 1), `${i + 1} / 10`, Number(effortValue) === i + 1)).join('')}
      </select></div>
      <div class="field" data-intensity-wrap ${kind !== 'cardio' ? 'hidden' : ''}><label for="session-intensity-${index}">有氧强度</label><select class="select" id="session-intensity-${index}" data-session-field="intensity" ${kind === 'cardio' ? '' : 'disabled'}>
        ${option('', '可选', !intensityValue)}${option('easy', '轻松', intensityValue === 'easy')}${option('moderate', '中等', intensityValue === 'moderate')}${option('vigorous', '剧烈', intensityValue === 'vigorous')}
      </select></div>
      <button class="session-remove" type="button" data-remove-session aria-label="移除此项活动">移除</button>
    </div>
  </div>`;
}

function dayFieldValue(day, key) {
  const value = day?.[key];
  return value === null || value === undefined ? '' : value;
}

function renderLog() {
  const date = state.date;
  const day = getDay(date);
  const previousTemplate = day ? null : getPreviousActivityTemplate(state.days, date);
  const previousTemplateAction = previousTemplate
    ? `<div class="reuse-activities"><button class="button button-small" type="button" id="copy-last-activities">沿用上次活动（${escapeHtml(formatDate(previousTemplate.sourceDate, { month: 'numeric', day: 'numeric' }))}）</button><span>只带入活动类型、时长和有氧强度；身体状态等请按今天记录。</span></div>`
    : '';
  const sessions = day?.sessions.length ? day.sessions : [{ kind: 'strength', minutes: 30, effort: 5, intensity: null }];
  const sessionMarkup = sessions.map((item, index) => sessionRow(item, index)).join('');
  const painValue = day?.painOrInjury === true ? 'yes' : day?.painOrInjury === false ? 'no' : '';

  document.querySelector('#view-log').innerHTML = `
    ${pageHeading(day ? '更新日常记录' : '记录今天', '训练内容必填；睡眠、饮食和体重等信息可以跳过。', `<button class="button button-small" type="button" data-set-date="today">回到今天</button>`)}
    ${renderStoreWarning()}
    <form class="form-panel" id="day-form" novalidate>
      <section class="form-section">
        <h2>活动</h2>
        <div class="field-grid"><div class="field"><label for="log-date">日期</label><input class="input" id="log-date" name="date" type="date" value="${escapeHtml(date)}" required></div></div>
        ${previousTemplateAction}
        <div class="session-list" id="session-list">${sessionMarkup}</div>
        <div class="suggestion-actions"><button class="button button-small" type="button" id="add-session">＋ 再加一项活动</button></div>
      </section>
      <section class="form-section">
        <h2>身体状态 <span class="field-help">选填，记录几项就够</span></h2>
        <div class="field-grid">
          <div class="field"><label for="sleep-hours">睡眠时长（小时）</label><input class="input" id="sleep-hours" name="sleepHours" type="number" min="0" max="24" step="0.1" inputmode="decimal" placeholder="例如 7.5" value="${escapeHtml(dayFieldValue(day, 'sleepHours'))}"></div>
          <div class="field"><label for="weight-kg">体重（公斤）</label><input class="input" id="weight-kg" name="weightKg" type="number" min="20" max="500" step="0.1" inputmode="decimal" placeholder="可留空" value="${escapeHtml(dayFieldValue(day, 'weightKg'))}"></div>
          <div class="field"><label for="fatigue">疲劳程度</label><select class="select" id="fatigue" name="fatigue">${option('', '暂不记录', day?.fatigue == null)}${[1,2,3,4,5].map((value) => option(String(value), `${value} / 5${value === 1 ? ' · 精力很好' : value === 5 ? ' · 非常疲惫' : ''}`, day?.fatigue === value)).join('')}</select></div>
          <div class="field"><label for="soreness">酸痛程度</label><select class="select" id="soreness" name="soreness">${option('', '暂不记录', day?.soreness == null)}${[1,2,3,4,5].map((value) => option(String(value), `${value} / 5${value === 1 ? ' · 几乎没有' : value === 5 ? ' · 明显影响活动' : ''}`, day?.soreness === value)).join('')}</select></div>
          <div class="field"><label for="pain-flag">是否有明显疼痛或受伤感</label><select class="select" id="pain-flag" name="painOrInjury">${option('', '暂不记录', painValue === '')}${option('no', '没有', painValue === 'no')}${option('yes', '有', painValue === 'yes')}</select><span class="field-help">如果选择“有”，网页会优先建议休息或轻活动。</span></div>
        </div>
      </section>
      <section class="form-section">
        <h2>饮食与备注 <span class="field-help">选填</span></h2>
        <div class="field-grid">
          <div class="field field-wide"><label for="food-note">饮食简记</label><textarea class="textarea" id="food-note" name="foodNote" placeholder="例如：豆浆、鸡蛋；午餐有蔬菜和米饭">${escapeHtml(day?.foodNote ?? '')}</textarea></div>
          <div class="field field-wide"><label for="day-note">其他备注</label><textarea class="textarea" id="day-note" name="note" placeholder="今天的状态、训练感受或想留意的事">${escapeHtml(day?.note ?? '')}</textarea></div>
        </div>
      </section>
      <div class="form-error" id="form-error" role="alert" tabindex="-1" hidden></div>
      <div class="form-actions"><span class="field-help">记录保存在当前浏览器，不会上传。</span><div class="form-actions-right">${day ? '<button class="button button-danger" type="button" id="delete-day">删除这天</button>' : ''}<button class="button button-primary" type="submit" ${state.storeError ? 'disabled' : ''}>保存记录</button></div></div>
    </form>`;
}

function svgBarChart(days) {
  const width = 640;
  const chartTop = 18;
  const chartBottom = 176;
  const maxValue = Math.max(60, ...days.map((day) => day.minutes));
  const step = width / 7;
  const bars = days.map((day, index) => {
    const height = day.minutes ? Math.max(3, (day.minutes / maxValue) * 130) : 0;
    const x = index * step + 24;
    const y = chartBottom - height;
    const dateLabel = formatDate(day.date, { month: 'numeric', day: 'numeric' });
    return `<g><rect class="chart-bar" x="${x}" y="${y}" width="42" height="${height}" rx="4"><title>${escapeHtml(dateLabel)}：${day.minutes} 分钟</title></rect><text class="chart-value" x="${x + 21}" y="${Math.max(chartTop, y - 7)}" text-anchor="middle">${day.minutes || ''}</text><text class="chart-label" x="${x + 21}" y="${chartBottom + 22}" text-anchor="middle">${escapeHtml(dateLabel)}</text></g>`;
  }).join('');
  const grid = [0, 1, 2, 3].map((index) => {
    const y = chartTop + index * 43;
    const value = Math.round(maxValue * (3 - index) / 3);
    return `<g><line class="chart-grid" x1="12" y1="${y}" x2="628" y2="${y}"/><text class="chart-label" x="4" y="${y - 4}">${value}</text></g>`;
  }).join('');
  return `<svg class="activity-chart" viewBox="0 0 ${width} 220" role="img" aria-labelledby="activity-chart-title activity-chart-description"><title id="activity-chart-title">最近 7 天活动分钟</title><desc id="activity-chart-description">${days.map((day) => `${formatDate(day.date, { month: 'numeric', day: 'numeric' })} ${day.minutes} 分钟`).join('；')}</desc>${grid}${bars}</svg>`;
}

function svgWeightChart(points) {
  if (points.length < 2) return '<p class="empty-note">至少记录两次体重后，这里会显示变化走势。体重是可选项。</p>';
  const width = 640;
  const height = 180;
  const values = points.map((point) => point.value);
  const min = Math.min(...values) - .5;
  const max = Math.max(...values) + .5;
  const step = width / Math.max(1, points.length - 1);
  const coords = points.map((point, index) => ({
    x: 24 + index * (width - 48) / (points.length - 1),
    y: 145 - ((point.value - min) / Math.max(.1, max - min)) * 105,
    ...point
  }));
  const path = coords.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
  const marks = coords.map((point) => `<g><circle class="weight-point" cx="${point.x}" cy="${point.y}" r="4"><title>${escapeHtml(formatDate(point.date))}：${point.value} 公斤</title></circle><text class="chart-label" x="${point.x}" y="169" text-anchor="middle">${escapeHtml(formatDate(point.date, { month: 'numeric', day: 'numeric' }))}</text></g>`).join('');
  return `<svg class="weight-chart" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="weight-chart-title"><title id="weight-chart-title">最近记录的体重走势</title><path class="weight-line" d="${path}"/>${marks}</svg>`;
}

function sevenDateKeys(today) {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(`${today}T00:00:00`);
    date.setDate(date.getDate() - (6 - index));
    return localDate(date);
  });
}

function renderTrends() {
  const today = localDate();
  const summary = getWeeklySummary(state.days, today);
  const days = sevenDateKeys(today).map((date) => {
    const day = getDay(date);
    return { date, minutes: day?.sessions.reduce((total, item) => total + (item.kind === 'rest' ? 0 : item.minutes), 0) ?? 0 };
  });
  const weights = state.days.filter((day) => day.date >= days[0].date && day.date <= today && typeof day.weightKg === 'number').map((day) => ({ date: day.date, value: day.weightKg }));
  const aerobicPercent = Math.min(100, Math.round(summary.moderateEquivalentMinutes / 150 * 100));
  const strengthPercent = Math.min(100, Math.round(summary.strengthDays / 2 * 100));
  const history = state.days.slice().sort((a, b) => b.date.localeCompare(a.date));
  const historyMarkup = history.length ? history.map((day) => {
    const activities = day.sessions.map((item) => `${activityLabels[item.kind]}${item.kind === 'rest' ? '' : ` ${item.minutes} 分钟`}`).join(' · ');
    const status = [day.sleepHours !== null ? `睡眠 ${day.sleepHours}h` : '', day.weightKg !== null ? `${day.weightKg}kg` : '', day.fatigue !== null ? `疲劳 ${day.fatigue}/5` : ''].filter(Boolean).join(' · ');
    return `<div class="recent-entry"><span class="recent-date">${escapeHtml(formatDate(day.date))}</span><div class="recent-main">${escapeHtml(activities)}${status ? `<div class="recent-meta">${escapeHtml(status)}</div>` : ''}</div><button class="button button-small" type="button" data-edit-date="${escapeHtml(day.date)}">编辑</button></div>`;
  }).join('') : '<p class="empty-note">还没有历史记录。记下第一次训练后，周趋势就会从真实数据开始累积。</p>';

  document.querySelector('#view-trends').innerHTML = `
    ${pageHeading('看见自己的节奏', '只展示你真实记录的训练、恢复和体重变化。')}
    ${renderStoreWarning()}
    <div class="summary-grid">
      ${summaryItem('训练天数', summary.trainingDays, '天', '最近 7 天')}
      ${summaryItem('力量训练', summary.strengthDays, '天', '不同训练日期')}
      ${summaryItem('活动时长', summary.activityMinutes, '分钟', '不含休息记录')}
    </div>
    <section class="trend-block"><h2>每天活动时长</h2><p>把力量、有氧和球类运动都记入活动时间。</p><div class="chart-scroll">${svgBarChart(days)}</div></section>
    <section class="trend-block"><h2>成人通用活动参考</h2><p>用于了解大致进度，不是个人训练处方；未标注强度的有氧不会计入。</p>
      <div class="progress-row"><div class="progress-label"><span>中等强度等量有氧</span><span>${summary.moderateEquivalentMinutes} / 150 分钟</span></div><div class="progress-track" role="progressbar" aria-label="中等强度等量有氧进度" aria-valuemin="0" aria-valuemax="150" aria-valuenow="${Math.min(150, summary.moderateEquivalentMinutes)}"><div class="progress-fill" style="width:${aerobicPercent}%"></div></div></div>
      <div class="progress-row"><div class="progress-label"><span>肌肉强化活动</span><span>${summary.strengthDays} / 2 天</span></div><div class="progress-track" role="progressbar" aria-label="肌肉强化活动进度" aria-valuemin="0" aria-valuemax="2" aria-valuenow="${Math.min(2, summary.strengthDays)}"><div class="progress-fill progress-fill-accent" style="width:${strengthPercent}%"></div></div></div>
      <p class="reference-note">成人常见建议为每周至少 150 分钟中等强度有氧（或 75 分钟剧烈强度等量组合）和 2 天肌肉强化活动。你的目标、年龄和身体状况可能不同。</p>
    </section>
    <section class="trend-block"><h2>体重走势</h2><p>单日波动很常见，建议看一段时间的方向。</p><div class="chart-scroll">${svgWeightChart(weights)}</div></section>
    <div class="section-title"><h2>所有记录</h2><button class="button button-small" type="button" data-view="log">记录一天</button></div>
    <div class="recent-list">${historyMarkup}</div>
    <section class="settings" aria-labelledby="settings-title"><h2 id="settings-title">数据与隐私</h2><p>记录仅保存在当前浏览器。更换设备前，请先导出备份。</p>
      <div class="settings-actions"><button class="button button-small" id="export-data" type="button" ${state.storeError ? 'disabled' : ''}>导出 JSON</button><button class="button button-small" id="choose-import" type="button">导入备份</button><button class="button button-small button-danger" id="clear-data" type="button">清空全部数据</button><input class="file-input-hidden" id="import-file" type="file" accept="application/json,.json" tabindex="-1" aria-label="选择 JSON 备份文件"></div>
    </section>`;
}

function render() {
  renderToday();
  renderLog();
  renderTrends();
  document.querySelectorAll('[data-view]').forEach((button) => {
    const active = button.dataset.view === state.view;
    button.classList.toggle('is-active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  for (const view of views) document.querySelector(`#view-${view}`).hidden = view !== state.view;
}

function chooseView(view) {
  if (!views.includes(view)) return;
  state.view = view;
  render();
  document.querySelector('#app-main').focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
}

function setSessionRowMode(row) {
  const kind = row.querySelector('[data-session-field="kind"]').value;
  const isRest = kind === 'rest';
  const minutes = row.querySelector('[data-session-field="minutes"]');
  const effort = row.querySelector('[data-session-field="effort"]');
  const intensityWrap = row.querySelector('[data-intensity-wrap]');
  const intensity = row.querySelector('[data-session-field="intensity"]');
  minutes.readOnly = isRest;
  if (isRest) minutes.value = '0';
  else if (minutes.value === '0') minutes.value = '30';
  effort.disabled = isRest;
  effort.required = !isRest;
  if (isRest) effort.value = '';
  else if (!effort.value) effort.value = '5';
  intensityWrap.hidden = kind !== 'cardio';
  intensity.disabled = kind !== 'cardio';
  if (kind !== 'cardio') intensity.value = '';
}

function readOptionalNumber(value) {
  if (value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function getSubmissionForm(event) {
  return event.target;
}

function submitDay(event) {
  event.preventDefault();
  const form = getSubmissionForm(event);
  const errorBox = form.querySelector('#form-error');
  errorBox.hidden = true;
  const sessionRows = [...form.querySelectorAll('[data-session-row]')];
  const sessions = sessionRows.map((row) => {
    const kind = row.querySelector('[data-session-field="kind"]').value;
    return {
      id: row.dataset.id.startsWith('draft-') ? newId() : row.dataset.id,
      kind,
      minutes: kind === 'rest' ? 0 : Number(row.querySelector('[data-session-field="minutes"]').value),
      effort: kind === 'rest' ? null : Number(row.querySelector('[data-session-field="effort"]').value),
      intensity: kind === 'cardio' ? (row.querySelector('[data-session-field="intensity"]').value || null) : null
    };
  });
  const formData = new FormData(form);
  const painValue = formData.get('painOrInjury');
  const day = {
    date: String(formData.get('date') ?? ''),
    sessions,
    sleepHours: readOptionalNumber(String(formData.get('sleepHours') ?? '')),
    fatigue: readOptionalNumber(String(formData.get('fatigue') ?? '')),
    soreness: readOptionalNumber(String(formData.get('soreness') ?? '')),
    painOrInjury: painValue === 'yes' ? true : painValue === 'no' ? false : null,
    weightKg: readOptionalNumber(String(formData.get('weightKg') ?? '')),
    foodNote: String(formData.get('foodNote') ?? '').trim(),
    note: String(formData.get('note') ?? '').trim()
  };
  try {
    saveDay(day);
    state.date = day.date;
    refreshDays();
    showToast('记录已保存在这台设备。');
    render();
  } catch (error) {
    errorBox.textContent = error.message;
    errorBox.hidden = false;
    errorBox.focus?.();
  }
}

function handleClick(event) {
  const viewButton = event.target.closest('[data-view]');
  if (viewButton) {
    if (viewButton.dataset.view === 'log') state.date = localDate();
    chooseView(viewButton.dataset.view);
    return;
  }

  const dateButton = event.target.closest('[data-edit-date]');
  if (dateButton) { state.date = dateButton.dataset.editDate; chooseView('log'); return; }

  if (event.target.closest('[data-set-date="today"]')) { state.date = localDate(); render(); return; }

  if (event.target.closest('#add-session')) {
    const container = document.querySelector('#session-list');
    const index = ++sessionSequence + container.querySelectorAll('[data-session-row]').length;
    container.insertAdjacentHTML('beforeend', sessionRow({ kind: 'strength', minutes: 30, effort: 5 }, index));
    return;
  }

  if (event.target.closest('#copy-last-activities')) {
    const template = getPreviousActivityTemplate(state.days, state.date);
    if (!template) { showToast('没有找到更早的活动记录。', 'error'); return; }
    const container = document.querySelector('#session-list');
    container.innerHTML = template.sessions.map((session, index) => sessionRow({
      kind: session.kind,
      minutes: session.minutes,
      effort: null,
      intensity: session.intensity
    }, sessionSequence + index)).join('');
    sessionSequence += template.sessions.length;
    showToast('已沿用上次活动，请按今天实际情况调整。');
    return;
  }

  const removeButton = event.target.closest('[data-remove-session]');
  if (removeButton) {
    const rows = document.querySelectorAll('[data-session-row]');
    if (rows.length <= 1) { showToast('每天至少保留一项活动或休息记录。', 'error'); return; }
    removeButton.closest('[data-session-row]').remove();
    return;
  }

  if (event.target.closest('#delete-day')) {
    if (!window.confirm(`确定删除 ${formatDate(state.date)} 的全部记录吗？此操作无法撤销。`)) return;
    try {
      deleteDay(state.date);
      refreshDays();
      showToast('这天的记录已删除。');
      state.date = localDate();
      render();
    } catch (error) { showToast(error.message, 'error'); }
    return;
  }

  if (event.target.closest('#export-data')) {
    try {
      const blob = new Blob([exportData()], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `练记备份-${localDate()}.json`;
      link.click();
      URL.revokeObjectURL(url);
      showToast('备份文件已导出。');
    } catch (error) { showToast(error.message, 'error'); }
    return;
  }

  if (event.target.closest('#choose-import')) { document.querySelector('#import-file').click(); return; }

  if (event.target.closest('#clear-data')) {
    if (!window.confirm('确定清空这台设备上的全部健身记录吗？建议先导出备份。此操作无法撤销。')) return;
    try {
      clearData();
      refreshDays();
      showToast('本机记录已清空。');
      render();
    } catch (error) { showToast(error.message, 'error'); }
  }
}

function handleChange(event) {
  if (event.target.matches('#log-date')) {
    state.date = event.target.value || localDate();
    renderLog();
    return;
  }
  if (event.target.matches('[data-session-field="kind"]')) {
    setSessionRowMode(event.target.closest('[data-session-row]'));
    return;
  }
  if (event.target.matches('#import-file') && event.target.files?.length) {
    const file = event.target.files[0];
    if (!window.confirm('导入备份会替换当前设备上的全部记录。请确认已导出备份或不再需要当前数据。')) {
      event.target.value = '';
      return;
    }
    file.text().then((contents) => {
      const count = importData(contents);
      refreshDays();
      render();
      showToast(`已导入 ${count} 天的记录。`);
    }).catch((error) => showToast(error.message, 'error'))
      .finally(() => { event.target.value = ''; });
  }
}

function initialise() {
  refreshDays();
  render();
  document.addEventListener('click', handleClick);
  document.addEventListener('change', handleChange);
  document.addEventListener('submit', (event) => {
    if (event.target.matches('#day-form')) submitDay(event);
  });
  document.addEventListener('input', (event) => {
    if (event.target.matches('#log-date')) state.date = event.target.value || localDate();
  });
}

if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', initialise);
