/** Pure local calendar, summary and suggestion logic. No I/O or network. */
import {MOODS,feelingLabel,validEmotion} from './life-expression.mjs';
export {MOODS} from './life-expression.mjs';
export const DEFAULT_CATEGORIES = [
  {
    id: "daily",
    name: "日常生活",
    color: "#a9bd9f",
    icon: "sun",
    builtIn: true,
  },
  {
    id: "travel",
    name: "旅途与见闻",
    color: "#91b5c4",
    icon: "compass",
    builtIn: true,
  },
  {
    id: "learning",
    name: "学习与成长",
    color: "#b0a1cc",
    icon: "book",
    builtIn: true,
  },
  {
    id: "spending",
    name: "消费与好物",
    color: "#d2b787",
    icon: "wallet",
    builtIn: true,
  },
  {
    id: "wellbeing",
    name: "心情与感受",
    color: "#c997a6",
    icon: "heart",
    builtIn: true,
  },
  {
    id: "fitness",
    name: "运动与活力",
    color: "#95b7ac",
    icon: "activity",
    builtIn: true,
  },
  {
    id: "other",
    name: "生活碎片",
    color: "#adb0b8",
    icon: "layers",
    builtIn: true,
  },
];
export const DEFAULT_SETTINGS = {
  id: "main",
  reminderEnabled: false,
  reminderTime: "22:00",
  lastReminderDate: "",
  reportStyle: "brief",
  autoReport: true,
  aiEnabled: false,
  ocrEnabled: false,
  theme: "dark",
};
export const PERIOD_LABELS = {
  day: "日报",
  week: "周报",
  month: "月报",
  year: "年报",
};
export const uid = () => crypto.randomUUID();
export function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function validDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T12:00:00`);
  return (
    Number.isFinite(+d) &&
    localDate(d) === s &&
    s >= "1900-01-01" &&
    s <= "2200-12-31"
  );
}
export function addDays(s, n) {
  const d = new Date(`${s}T12:00:00`);
  d.setDate(d.getDate() + n);
  return localDate(d);
}
export function periodRange(period, date) {
  if (!validDate(date)) throw Error("日期不正确");
  const d = new Date(`${date}T12:00:00`),
    y = d.getFullYear(),
    m = d.getMonth();
  if (period === "day") return { start: date, end: date };
  if (period === "week") {
    const start = addDays(date, -((d.getDay() + 6) % 7));
    return { start, end: addDays(start, 6) };
  }
  if (period === "month")
    return {
      start: localDate(new Date(y, m, 1, 12)),
      end: localDate(new Date(y, m + 1, 0, 12)),
    };
  if (period === "year") return { start: `${y}-01-01`, end: `${y}-12-31` };
  throw Error("未知报告周期");
}
export function inRange(records, { start, end }, confirmed = true) {
  return records.filter(
    (r) =>
      !r.excluded &&
      r.date >= start &&
      r.date <= end &&
      (!confirmed || r.status === "confirmed"),
  );
}
export function summary(records, categories = DEFAULT_CATEGORIES) {
  const moods = records.filter((r) => r.mood != null),
    durations = records.filter((r) => r.duration != null),
    amounts = records.filter((r) => r.amount != null);
  return {
    count: records.length,
    photos: records.filter((r) => r.assetId).length,
    days: new Set(records.map((r) => r.date)).size,
    mood: moods.length
      ? moods.reduce((a, r) => a + r.mood, 0) / moods.length
      : null,
    moodCount: moods.length,
    duration: durations.reduce((a, r) => a + r.duration, 0),
    durationCount: durations.length,
    amount: amounts.reduce((a, r) => a + r.amount, 0),
    amountCount: amounts.length,
    categories: categories
      .map((c) => ({
        ...c,
        count: records.filter((r) => r.categoryId === c.id).length,
        duration: records
          .filter((r) => r.categoryId === c.id)
          .reduce((a, r) => a + (r.duration || 0), 0),
      }))
      .filter((c) => c.count),
  };
}
export function signature(records) {
  return records
    .map((r) => `${r.id}:${r.updatedAt}`)
    .sort()
    .join("|");
}
const clean = (s) =>
  String(s || "")
    .replace(/[\r\n]+/g, " ")
    .trim();
export function makeReport(all, categories, period, date, style = "brief") {
  const range = periodRange(period, date),
    rows = inRange(all, range).sort((a, b) =>
      (a.date + a.time).localeCompare(b.date + b.time),
    ),
    s = summary(rows, categories);
  const lines = [
    `# ${range.start === range.end ? range.start : `${range.start} — ${range.end}`} · 生活${PERIOD_LABELS[period]}`,
    "",
    "> 本地规则生成 · 仅依据已确认的记录，未记录不代表未发生。",
    "",
  ];
  if (!rows.length)
    return [
      ...lines,
      "这个周期还没有记录。选几张照片，或写下一件小事，再来回顾。",
      "",
      style === "deep"
        ? "## 留给自己的问题\n今天有什么值得留住？希望下次做出什么小改变？"
        : "",
    ].join("\n");
  lines.push(
    "## 生活全景",
    `留下 ${s.count} 条记录，覆盖 ${s.days} 天、${s.categories.length} 个生活分类。`,
    "",
    ...s.categories.map(
      (c) =>
        `- ${c.name}：${c.count} 条记录${c.duration ? `，已记录 ${c.duration} 分钟` : ""}`,
    ),
    "",
  );
  if (period === "year") {
    lines.push("## 年度时间线");
    for (let m = 1; m <= 12; m++) {
      const group = rows.filter((r) => Number(r.date.slice(5, 7)) === m);
      if (group.length)
        lines.push(
          `- ${m} 月 · ${group.length} 条：${group
            .slice(0, 3)
            .map((r) => clean(r.title))
            .join("；")}${group.length > 3 ? "等" : ""}`,
        );
    }
    lines.push("");
  } else {
    lines.push(
      "## 事件梳理",
      ...rows.map(
        (r) =>
          `- ${r.date} ${r.time || ""} · ${clean(r.title)}${r.location ? `｜${clean(r.location)}` : ""}${r.note ? `\n  ${clean(r.note)}` : ""}`,
      ),
      "",
    );
  }
  lines.push(
    "## 心情与感受",
    rows.some(r=>feelingLabel(r))
      ? `${s.moodCount?`共有 ${s.moodCount} 次自评，平均 ${s.mood.toFixed(1)} / 5。`:''}${rows
          .filter((r) => feelingLabel(r))
          .map((r) => `${r.date}：${clean(feelingLabel(r))}`)
          .join("；")}。`
      : "这个周期未记录心情，不从照片推测感受。",
    "",
  );
  lines.push("## 亮点与遗憾");
  for (const [key, label] of [
    ["highlight", "值得留住"],
    ["regret", "下次改进"],
  ]) {
    const part = rows.filter((r) => r.reflection === key);
    lines.push(
      `- ${label}：${part.length ? part.map((r) => clean(r.title)).join("；") : "尚未标记，可以补充自己的感受。"}`,
    );
  }
  lines.push("");
  if (period !== "day") {
    const prev = periodRange(period, addDays(range.start, -1)),
      ps = summary(inRange(all, prev), categories);
    lines.push(
      "## 习惯与变化",
      `本周期有 ${s.days} 天留下记录；上一周期有 ${ps.days} 天、${ps.count} 条记录。${s.days>=3&&ps.days>=3 ? "周期完整度可能不同，记录量不能直接判断生活节奏或质量。" : "可比较的记录天数不足，暂不判断长期趋势。"}`,
      s.durationCount
        ? `已填写时长合计 ${s.duration} 分钟（${s.durationCount} 条）。这不是全天时间分配。`
        : "尚未填写活动时长，暂不统计时间分配。",
      "",
    );
  }
  if (s.amountCount)
    lines.push(
      "## 消费小记",
      `已记录金额合计 ¥${s.amount.toFixed(2)}（${s.amountCount} 条）；不代表完整支出。`,
      "",
    );
  const fitness = rows.filter((r) => r.categoryId === "fitness"),
    weights = rows.filter((r) => r.weight != null);
  if (fitness.length || weights.length)
    lines.push(
      "## 健身与身体 · 生活的一部分",
      `运动记录 ${fitness.length} 条，填写的活动时长共 ${fitness.reduce((n, r) => n + (r.duration || 0), 0)} 分钟。`,
      weights.length
        ? `体重记录：${weights.map((r) => `${r.date} ${r.weight} kg`).join("；")}。单次变化不做健康判断。`
        : "尚无体重记录。",
      "",
    );
  if (style === "deep")
    lines.push(
      "## 深一步，和自己聊聊",
      `最近保存的是 ${rows.at(-1).date} 的「${clean(rows.at(-1).title)}」。现在回看，有没有想补充的感受？`,
      rows.some(r=>r.reflection==='regret') ? `你把「${clean(rows.filter(r=>r.reflection==='regret').at(-1).title)}」标记为下次改进。可以先写下一个愿意调整的小步骤。` : "尚未标记需要改进的事，不必为了复盘寻找遗憾。",
      s.days<3 ? "目前记录天数较少，先保留这些具体经历，暂不推断习惯。" : `这些记录分布在 ${s.days} 天。哪些想继续，哪些只想留作回忆，可以由你决定。`,
      "",
      "## 给下一阶段的自己",
      "选择一件想延续的事，设定一个足够小的行动；为它留出时间。以上是反思提示，具体感受与安排由你补充。",
    );
  return lines.join("\n");
}
export function suggestCategory(text, learning = []) {
  const normalized = clean(text).toLowerCase();
  const learned = learning.find(
    (x) =>
      x.text && normalized.includes(x.text.toLowerCase()) && x.text.length >= 2,
  );
  if (learned)
    return { categoryId: learned.categoryId, method: "本地纠正记忆" };
  const rules = [
    ["spending", /账单|支付|发票|消费|receipt|invoice|账单/],
    ["fitness", /健身|训练|跑步|体测|运动|gym|workout|跑量/],
    ["learning", /学习|笔记|会议|代码|文档|课程|读书|document|notebook|screen/],
    ["travel", /旅行|出行|风景|公园|山|海边|车站|landscape|travel/],
    ["wellbeing", /心情|情绪|睡眠|身体|疲惫/],
    ["daily", /饭|咖啡|猫|狗|日常|散步|food|meal|coffee/],
  ];
  return {
    categoryId:
      rules.find(([, pattern]) => pattern.test(normalized))?.[0] || "other",
    method: "文字规则建议",
  };
}
export function reminderDue(settings, now = new Date()) {
  return (
    !!settings.reminderEnabled &&
    settings.lastReminderDate !== localDate(now) &&
    `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}` >=
      settings.reminderTime
  );
}
/** Evidence-first local suggestions. No cloud, inferred moods or automatic adoption. */
export function planningReview(all,categories,horizon,date,plans=[]){
  const current=periodRange(horizon,date),range={start:current.start,end:date};
  const previous=periodRange(horizon,addDays(current.start,-1));
  const elapsed=Math.round((new Date(date+'T12:00:00')-new Date(current.start+'T12:00:00'))/86400000);
  const previousEnd=[addDays(previous.start,elapsed),previous.end].sort()[0];
  const rows=inRange(all,range).sort((a,b)=>(a.date+(a.time||'')).localeCompare(b.date+(b.time||''))),before=inRange(all,{start:previous.start,end:previousEnd});
  const stats=summary(rows,categories),old=summary(before,categories),next=periodRange(horizon,addDays(current.end,1));
  const observations=[`${range.start} — ${range.end}：保存 ${stats.count} 条记录，覆盖 ${stats.days} 天。`];
  const ranked=stats.categories.slice().sort((a,b)=>b.count-a.count);
  if(ranked.length)observations.push(`记录最多的是「${ranked[0].name}」，共 ${ranked[0].count} 条；记录数量不等于实际时间投入。`);
  observations.push(stats.moodCount?`你主动填写了 ${stats.moodCount} 次心情自评，平均 ${stats.mood.toFixed(1)} / 5。`:rows.some(r=>r.emotion)?`你主动记录了 ${rows.filter(r=>r.emotion).length} 次感受：${[...new Set(rows.map(r=>r.emotion).filter(Boolean))].slice(0,5).join('、')}。情绪词不换算为分数，不据此判断心理状态。`:'这段时间未填写心情，不从照片推断情绪。');
  const changes=[];
  if(stats.days>=3&&old.days>=3)changes.push(`与 ${previous.start} — ${previousEnd} 的 ${old.count} 条记录相比，本期${stats.count>old.count?'多':stats.count<old.count?'少':'持平'}${stats.count===old.count?'':` ${Math.abs(stats.count-old.count)} 条`}。这反映记录变化，不代表生活好坏。`);
  else changes.push('可比较的记录天数不足，暂不判断生活趋势。');
  if(new Set(rows.filter(r=>r.mood!=null).map(r=>r.date)).size>=3&&new Set(before.filter(r=>r.mood!=null).map(r=>r.date)).size>=3)changes.push(`心情自评均值从 ${old.mood.toFixed(1)} 到 ${stats.mood.toFixed(1)}，样本仅来自你填写的记录；不据此判断心理状态。`);
  const pending=plans.filter(p=>!p.done&&p.date<=next.end).sort((a,b)=>a.date.localeCompare(b.date));
  if(pending.length)observations.push(`截至 ${next.end}，已有 ${pending.length} 项计划尚未勾选完成；未勾选不等于没有做。`);
  const suggestions=[],fallback=categories.some(c=>c.id==='daily')?'daily':categories[0]?.id;
  function add(key,title,categoryId,reason){
    let target=next.start;
    for(let i=0;i<7&&addDays(next.start,i)<=next.end;i++){target=addDays(next.start,i);if(!plans.some(p=>!p.done&&p.date===target))break;}
    suggestions.push({key:next.start+':'+key,title,categoryId:categories.some(c=>c.id===categoryId)?categoryId:fallback,reason,date:target,done:false,horizon,source:'rule'});
  }
  if(pending.length){const p=pending[0];add('goal:'+p.id,`给「${clean(p.title).slice(0,55)}」留 15 分钟，列出下一步`,p.categoryId,`来自你 ${p.date} 的未完成计划。可以先核对进度，再决定继续、调整或取消。`);}
  const regret=rows.slice().reverse().find(r=>r.reflection==='regret');
  if(regret)add('regret:'+regret.id,`花 10 分钟复看「${clean(regret.title).slice(0,55)}」，写一个可调整的小步骤`,regret.categoryId,`依据 ${regret.date} 你标记的「下次改进」，不猜测原因。`);
  const positive=rows.slice().reverse().find(r=>r.reflection==='highlight'||r.mood>=4);
  if(positive)add('keep:'+positive.id,`回看「${clean(positive.title).slice(0,55)}」，选一个愿意延续的细节`,positive.categoryId,`来自 ${positive.date} 你${positive.reflection==='highlight'?'标记的亮点':`填写的心情 ${positive.mood}/5`}。不假设整件事可以重复，可编辑为一次具体安排。`);
  else if(ranked.length){const c=ranked[0],sample=rows.slice().reverse().find(r=>r.categoryId===c.id);add('category:'+c.id,`用 10 分钟回看「${clean(sample.title).slice(0,55)}」，决定是否继续`,c.id,`${sample.date} 的记录；本期同类记录合计 ${c.count} 条。可以延续，也可以留出空白。`);}
  if(!suggestions.length)add('start','留 5 分钟，记录一件日常小事',fallback,'历史记录不足，先留下日期、发生的事，以及你愿意填写的感受。');
  return {range,observations,changes,suggestions:suggestions.slice(0,3)};
}
export function suggestPlans(all,categories,horizon,date,plans=[]){return planningReview(all,categories,horizon,date,plans).suggestions;}
export function validateRecord(r, categories) {
  if(!validEmotion(r.emotion))throw Error('情绪词需为 20 字以内的文字');
  if(r?.shareApproved!=null&&typeof r.shareApproved!=='boolean')throw Error('照片开放状态无效');
  if (
    !r ||
    typeof r.id !== "string" ||
    !r.id ||
    !validDate(r.date) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(r.time || "")
  )
    throw Error("记录日期或时间不正确");
  if (
    typeof r.title !== "string" ||
    !r.title.trim() ||
    r.title.length > 200 ||
    typeof r.note !== "string" ||
    r.note.length > 20000
  )
    throw Error("标题或笔记超出限制");
  if (
    !categories.some((c) => c.id === r.categoryId) ||
    !Array.isArray(r.tags) ||
    r.tags.length > 20 ||
    r.tags.some((t) => typeof t !== "string" || t.length > 40)
  )
    throw Error("分类或标签不正确");
  for (const [key, min, max] of [
    ["mood", 1, 5],
    ["duration", 0, 1440],
    ["amount", 0, 1e8],
    ["weight", 1, 1000],
  ])
    if (
      r[key] != null &&
      (!Number.isFinite(r[key]) ||
        r[key] < min ||
        r[key] > max ||
        (key === "mood" && !Number.isInteger(r[key])))
    )
      throw Error("数值超出合理范围");
  if (
    !["review", "confirmed"].includes(r.status) ||
    !["", "highlight", "regret"].includes(r.reflection) ||
    typeof r.location !== "string" ||
    r.location.length > 200
  )
    throw Error("记录状态或地点无效");
  return r;
}
// Extract only explicitly labelled data; do not infer health, emotions or location from pixels.
export function extractFields(text) {
  const fields = {},
    s = String(text || "");
  const location = s.match(/(?:地点|位置|地址)\s*[：:]\s*([^\n，,；;]{1,100})/);
  if (location) fields.location = location[1].trim();
  for (const [key, re, max] of [
    [
      "amount",
      /(?:实付|合计|金额|支付金额|total)\s*[：:]?\s*[¥￥]?\s*(\d+(?:\.\d{1,2})?)/i,
      1e8,
    ],
    [
      "duration",
      /(?:时长|持续|duration)\s*[：:]?\s*(\d+(?:\.\d+)?)\s*(?:分钟|min)/i,
      1440,
    ],
    [
      "weight",
      /(?:体重|weight)\s*[：:]?\s*(\d+(?:\.\d+)?)\s*(?:kg|公斤|千克)/i,
      1000,
    ],
  ]) {
    const m = s.match(re);
    if (m && Number(m[1]) <= max) fields[key] = Number(m[1]);
  }
  return fields;
}
