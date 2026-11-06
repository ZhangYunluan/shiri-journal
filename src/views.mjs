import {EMOTION_GROUPS,feelingLabel,feelingSelection} from './life-expression.mjs';
import {calendarView,photoRecall} from './life-calendar-view.mjs';
import {dailyFeeling,DAILY_EMOJIS,DAILY_PRESETS} from './life-calendar.mjs';
import {journeyState} from './record-journey.mjs';
import {ASSISTANT_CONFIG,assistantContext} from './life-assistant.mjs';
import {syncLabel,syncDetail,isSyncable} from './moment-review.mjs';
import { icon, esc, button, markdown } from "./ui.mjs";
import {
  localDate,
  addDays,
  periodRange,
  inRange,
  summary,
  MOODS,
  PERIOD_LABELS,
  makeReport,
  signature,
} from "./core.mjs";
export const NAV = [
  ["dashboard", "生活总览", "grid"],
  ["library", "相册素材", "image"],
  ["categories", "生活分类", "layers"],
  ["reports", "复盘报告", "book"],
  ["plans", "未来规划", "plan"],
  ["friends", "好友", "heart"],
];
const dateLabel = (d) =>
  new Date(`${d}T12:00:00`).toLocaleDateString("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
  });
const cat = (s, id) =>
  s.data.categories.find((c) => c.id === id) ||
  s.data.categories.find((c) => c.id === "other");
const catOptions = (s, value, all = false) =>
  `${all ? '<option value="all">所有生活分类</option>' : ""}${s.data.categories.map((c) => `<option value="${esc(c.id)}" ${value === c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}`;
export { catOptions };
const tag = (c) =>
  `<span class="badge" style="color:${c.color}">${esc(c.name)}</span>`;
export function chrome(s) {
  const nav = NAV.map(
    ([id, label, i]) =>
      `<a href="#${id}" class="nav-link ${s.view === id ? "active" : ""}" ${s.view === id ? 'aria-current="page"' : ""}>${icon(i)}<span>${label}</span></a>`,
  ).join("");
  return {
    sidebar: `<a class="brand" href="#dashboard"><img src="favicon.svg" alt=""><div><div class="brand-name">拾日</div><div class="brand-subtitle">SHIRI · LIFE JOURNAL</div></div></a><div class="nav-caption">我的生活空间</div><nav class="nav-list" aria-label="主导航">${nav}</nav><div class="side-bottom"><a href="#settings" class="nav-link ${s.view === "settings" ? "active" : ""}" ${s.view === "settings" ? 'aria-current="page"' : ""}>${icon("settings")}设置与隐私</a><div class="private-note"><div class="row gap8">${icon("shield", 16)}<strong>只在此刻，只在本机</strong></div><p>照片与文字保存在你的浏览器。<br>登录后可离线记录；好友查看需授权。</p><p style="margin-top:20px">私人生活日志 · 0.6.0</p></div></div>`,
    topbar: `<div class="crumb">我的生活空间 ${icon("right", 12)}<span>${NAV.find((x) => x[0] === s.view)?.[1] || "设置与隐私"}</span></div><a class="mobile-brand" href="#dashboard"><img src="favicon.svg" alt="">拾日</a><div class="row"><a href="install.html" class="button ghost">安装到手机</a><span class="top-date">${dateLabel(localDate())}</span><span class="badge green"><span class="dot"></span>本机优先</span><a href="#settings" aria-label="设置与隐私" class="button ghost icon-only">${icon("settings", 18)}</a><span class="avatar" aria-hidden="true">我</span></div>`,
    mobile: NAV.map(
      ([id, label, i]) =>
        `<a href="#${id}" class="${s.view === id ? "active" : ""}" ${s.view === id ? 'aria-current="page"' : ""}>${icon(i, 20)}${label.replace("生活总览", "总览").replace("相册素材", "素材").replace("生活分类", "分类").replace("复盘报告", "复盘").replace("未来规划", "规划")}</a>`,
    ).join(""),
  };
}
function heading(title, subtitle, actions = "", eyebrow = "") {
  return `<div class="page-heading"><div>${eyebrow ? `<div class="eyebrow">${eyebrow}</div>` : ""}<h1>${title}</h1><p>${subtitle}</p></div><div class="row actions">${actions}</div></div>`;
}
function empty(
  title,
  description,
  action = "import",
  label = "添加照片",
  i = "image",
) {
  return `<div class="empty-page">${icon(i, 34)}<h3>${title}</h3><p>${description}</p>${action ? button(action, label, "plus", "button primary") : ""}</div>`;
}
function donut(s, records) {
  const stats = summary(records, s.data.categories),
    total = stats.count;
  let offset = 0;
  const circles = stats.categories
    .map((c) => {
      const length = (c.count / (total || 1)) * 251.33;
      const out = `<circle cx="50" cy="50" r="40" fill="none" stroke="${c.color}" stroke-width="9" stroke-dasharray="${length} ${251.33 - length}" stroke-dashoffset="${-offset}"/>`;
      offset += length;
      return out;
    })
    .join("");
  return `<div class="composition"><div class="donut"><svg viewBox="0 0 100 100" role="img" aria-label="${total ? "各分类记录占比" : "尚无记录占比"}"><circle cx="50" cy="50" r="40" fill="none" stroke="var(--line)" stroke-width="9"/>${circles}</svg><div class="donut-center"><strong>${stats.categories.length}</strong><span>生活分类</span></div></div><div class="legend">${stats.categories.length ? stats.categories.map((c) => `<div class="legend-row"><span><i class="dot" style="color:${c.color}"></i>${esc(c.name)}</span><span>${Math.round((c.count / total) * 100)}%</span></div>`).join("") : `<p class="muted">生活有很多切面。<br>记录后，在这里看见。</p>`}</div></div>`;
}
function trend(s) {
  const mode = s.trendMode || "records",
    days = Array.from({ length: 7 }, (_, i) => addDays(s.date, i - 6));
  const values = days.map((date) => {
    const rows = s.data.records.filter(
      (r) => r.date === date && r.status === "confirmed",
    );
    if (mode === "records") return rows.length;
    const selected = rows.filter((r) => r[mode] != null);
    return selected.length
      ? selected.reduce((n, r) => n + r[mode], 0) / selected.length
      : null;
  });
  const known = values.filter((v) => v != null),
    max = mode === "mood" ? 5 : Math.max(mode === "weight" ? 1 : 3, ...known),
    min =
      mode === "weight" && known.length
        ? Math.max(0, Math.min(...known) - 2)
        : 0,
    span = Math.max(1, max - min);
  let path = "",
    connected = false;
  values.forEach((v, i) => {
    if (v == null) {
      connected = false;
      return;
    }
    path +=
      (connected ? " L" : " M") +
      (10 + i * 45) +
      " " +
      (76 - ((v - min) / span) * 60);
    connected = true;
  });
  const labels = { records: "记录数", mood: "心情自评", weight: "体重 / kg" };
  return (
    '<label class="field trend-select">观察维度<select id="trend-mode"><option value="records" ' +
    (mode === "records" ? "selected" : "") +
    '>记录习惯</option><option value="mood" ' +
    (mode === "mood" ? "selected" : "") +
    '>心情趋势</option><option value="weight" ' +
    (mode === "weight" ? "selected" : "") +
    '>体重记录</option></select></label><svg class="trend-chart" viewBox="0 0 290 90" role="img" aria-label="近七日' +
    labels[mode] +
    "：" +
    values.map((v) => (v == null ? "未记录" : v.toFixed(1))).join("、") +
    '"><path d="M10 16h270 M10 46h270 M10 76h270" stroke="var(--line)" stroke-dasharray="3 5" fill="none"/><path d="' +
    path +
    '" fill="none" stroke="var(--accent)" stroke-width="2"/>' +
    values
      .map((v, i) =>
        v == null
          ? ""
          : '<circle cx="' +
            (10 + i * 45) +
            '" cy="' +
            (76 - ((v - min) / span) * 60) +
            '" r="3" fill="var(--surface)" stroke="var(--accent)"/><text x="' +
            (10 + i * 45) +
            '" y="' +
            (67 - ((v - min) / span) * 60) +
            '" text-anchor="middle" fill="var(--muted)" font-size="9">' +
            (mode === "records" ? v : v.toFixed(1)) +
            "</text>",
      )
      .join("") +
    '</svg><div class="chart-labels">' +
    days
      .map((d) => "<span>" + d.slice(5).replace("-", "/") + "</span>")
      .join("") +
    '</div><p class="trend-note">' +
    (mode === "records"
      ? "每天的确认记录数 · 不给生活打分"
      : "仅显示已填写数据的日均值 · 空白为未记录") +
    "</p>"
  );
}
function yearTimeline(s) {
  const rows = inRange(s.data.records, periodRange("year", s.reportDate)),
    counts = Array.from(
      { length: 12 },
      (_, i) => rows.filter((r) => Number(r.date.slice(5, 7)) === i + 1).length,
    ),
    max = Math.max(1, ...counts);
  return (
    '<section class="panel year-overview"><div class="section-head"><h2>这一年的生活印记</h2><span class="small muted">每月确认记录数</span></div><div class="year-bars">' +
    counts
      .map(
        (n, i) =>
          '<div class="year-column"><span>' +
          n +
          '</span><div class="year-track"><i style="height:' +
          (n / max) * 100 +
          '%"></i></div><small>' +
          (i + 1) +
          "月</small></div>",
      )
      .join("") +
    "</div></section>"
  );
}
/** Progress reflects saved records only; importing photos never earns completion. */
export function dailySteps(s) {
 const j=journeyState(s.data.records,s.data.reports,s.date);
 const nodes=[['image','发现生活',j.discovered?j.discovered+' 份已收集':'从照片或文字开始',j.discovered>0,'import'],['edit','留下片刻',j.pending?j.pending+' 份待核对':j.saved?j.saved+' 条已保存':'挑选值得留下的',j.saved>0,j.pending?'review-today':'note'],['book','回看自己',j.reviewed?'已保存个人复盘':j.saved?'随时回看':'随时回看',j.reviewed,'journey-report']];
 return '<section class="daily-actions record-route" aria-label="今日记录旅程"><div class="section-head"><h2>今天的记录旅程</h2></div><ol>'+nodes.map(([i,title,detail,done,action],index)=>'<li class="'+(done?'route-done':'')+'"><button data-action="'+action+'" class="route-node"><span class="route-symbol">'+icon(done?'check':i,20)+'</span><span><strong>'+title+'</strong><small>'+detail+'</small></span>'+icon('right',15)+'</button></li>').join('')+'</ol></section>';
}
export function dashboard(s) {
  const rows = s.data.records
      .filter((r) => r.date === s.date&&!r.excluded)
      .sort((a, b) => a.time.localeCompare(b.time)),
    confirmed = rows.filter((r) => r.status === "confirmed"),
    stats = summary(confirmed, s.data.categories),
    week = periodRange("week", s.date),
    weekly = inRange(s.data.records, week),
    today = s.date === localDate();
  const timeline = rows.length
    ? `<div class="timeline">${rows
        .map((r) => {
          const c = cat(s, r.categoryId);
          return `<article class="timeline-item"><span class="timeline-time">${esc(r.time)}</span><div class="timeline-stem"><span class="dot" style="color:${c.color}"></span></div><div class="event-content"><button class="event-title" data-action="edit-record" data-id="${esc(r.id)}">${esc(r.title)}</button>${r.note ? `<p>${esc(r.note.slice(0, 160))}</p>` : ""}${r.assetId && s.urls[r.assetId] ? `<button class="button ghost" data-action="edit-record" data-id="${esc(r.id)}" aria-label="查看照片 ${esc(r.title)}"><img class="event-thumb" src="${s.urls[r.assetId]}" alt="${esc(r.title)}"></button>` : ""}<div class="event-meta">${tag(c)}${r.status === "review" ? '<span class="badge amber">待核对</span>' : ""}${feelingLabel(r) ? `<span class="badge">${esc(feelingLabel(r))}</span>` : ""}${r.tags
            .slice(0, 3)
            .map((t) => `<span class="small muted">#${esc(t)}</span>`)
            .join("")}</div></div></article>`;
        })
        .join("")}</div>`
    : `<div class="timeline-empty"><div class="empty-art">${icon("note", 31)}</div><h3>${today?"今天的故事，等你写下":"这一天还没有记录"}</h3><p>添加一张照片，核对后保存；也可以先写一句话。</p>${button("note", "记下第一件小事", "plus", "button")}</div>`;
  const recent = s.data.records.filter(r=>r.status==='confirmed'&&!r.excluded)
    .sort((a,b)=>(b.date+(b.time||'')).localeCompare(a.date+(a.time||''))).slice(0,4);
  const recentPanel = recent.length ? `<section class="panel panel-padding recent-moments"><div class="section-head"><h2>最近片刻</h2><a href="#library" class="small muted">查看全部</a></div><div class="recent-list">${recent.map(r=>`<button class="recent-moment" data-action="edit-record" data-id="${esc(r.id)}">${r.assetId&&s.urls[r.assetId]?`<img src="${s.urls[r.assetId]}" alt="" loading="lazy" decoding="async">`:`<span class="recent-note">${icon('note',22)}</span>`}<span><strong>${esc(r.title)}</strong><small class="muted">${esc(r.date)} · ${esc(cat(s,r.categoryId).name)}</small></span>${icon('right',16)}</button>`).join('')}</div></section>` : '';
  const j=journeyState(s.data.records,s.data.reports,s.date);
  const headline=j.pending?'留住今天的小事。':j.saved?'这一页，已经有了故事。':'从一件小事开始。';
  const cta=j.pending?'整理 '+j.pending+' 份素材':j.saved?'回看这一天':'开始记录';
  const weekDays=Array.from({length:7},(_,i)=>{const d=addDays(week.start,i),count=s.data.records.filter(r=>r.date===d&&!r.excluded&&r.status==='confirmed').length;return '<button class="footprint-day '+(count?'has-footprint':'')+' '+(d===s.date?'selected':'')+'" data-action="select-day" data-date="'+d+'" aria-label="'+d+'，'+count+' 条已保存" aria-pressed="'+(d===s.date)+'"><small>'+['一','二','三','四','五','六','日'][i]+'</small><span>'+Number(d.slice(-2))+'</span><i aria-hidden="true">'+(count?'●':'·')+'</i></button>';}).join('');
  return '<div class="home-experience"><header class="home-welcome"><span>'+dateLabel(s.date)+' · '+(today?'今天':'生活回放')+'</span><a href="#settings" class="small muted">使用指南</a></header>'+
    '<section class="journey-hero"><div class="journey-copy"><h1>'+headline+'</h1><p>'+(j.pending?'先挑选想留下的，其余可以稍后整理。':j.saved?'已经保存 '+j.saved+' 条记录，也可以继续写下新的片刻。':'一张照片，或者一句话，就能开始。')+'</p></div><svg class="shiri-keepsake" viewBox="0 0 96 108" aria-hidden="true"><path d="M20 26 66 15 83 85 37 96Z" fill="var(--surface2)" stroke="var(--line)" stroke-width="2"/><rect x="14" y="22" width="58" height="72" rx="13" fill="var(--accent)"/><path d="M27 42h30M27 51h22M27 60h15" stroke="var(--accent-ink)" stroke-width="3" stroke-linecap="round"/><path d="M53 74c0-13 18-19 18-19s3 19-10 24" fill="var(--surface)"/><path d="m52 84 12-18" stroke="var(--accent-ink)" stroke-width="2" stroke-linecap="round"/></svg>'+
    button(j.action,cta,'arrow','button primary journey-primary')+'<div class="hero-shortcuts">'+button('note','写一句话','edit','button ghost')+button('import','添加照片','image','button photo-add')+'</div><p class="small muted hero-privacy">原始素材留在本机 · 保存后按好友授权同步</p></section>'+
    dailySteps(s)+recentPanel+(s.calendarOpen?calendarView(s):'')+
    '<section class="life-footprints"><div class="section-head"><h2>生活，慢慢有了形状</h2>'+button('calendar-toggle',s.calendarOpen?'收起月历':'生活日历','calendar','button ghost small-button','aria-expanded="'+!!s.calendarOpen+'"')+'</div><div class="footprint-totals"><span><strong>'+j.days+'</strong> 天生活足迹</span><span><strong>'+j.total+'</strong> 条已保存</span><span><strong>'+j.reviews+'</strong> 份复盘</span></div><div class="footprint-week" aria-label="所选周生活足迹">'+weekDays+'</div><div class="date-nav">'+button('prev-day','','left','button ghost icon-only','aria-label="前一天"')+'<input type="date" id="dashboard-date" value="'+s.date+'" aria-label="总览日期">'+button('next-day','','right','button ghost icon-only','aria-label="后一天"')+(!today?button('today','今天','','button ghost'):'')+'</div></section>'+
    '<details class="home-details"><summary>'+ (today?'今天':'这一天')+'的全部记录 · '+rows.length+' 条</summary><section class="panel panel-padding timeline-panel">'+timeline+'</section><div class="dashboard-side stack"><section class="panel panel-padding"><h2>本周生活切面</h2>'+donut(s,weekly)+'</section><section class="panel panel-padding"><h2>记录的节奏</h2>'+trend(s)+'</section></div><a class="button ghost" href="#settings">设置晚间采集</a></details></div>';
}

export function reviewCandidates(s){
  return s.data.records.filter(r=>r.assetId&&r.status==='review'&&(!s.reviewDate||r.date===s.reviewDate)&&!!r.excluded===!!s.showExcluded&&(s.filterCategory==='all'||r.categoryId===s.filterCategory)&&(!s.search||[r.title,r.note,...(r.tags||[])].join(' ').toLowerCase().includes(s.search.toLowerCase())));
}
function assetGrid(s,records){
  const cards=records.slice().sort((a,b)=>(b.date+b.time).localeCompare(a.date+a.time)).slice(0,s.libraryLimit||80);
  return `<div class="library-grid">${cards.map(r=>{
    const selectable=s.batchMode&&r.assetId&&r.status==='review',selected=s.batchSelected?.has(r.id);
    return `<article class="asset-item"><button class="asset-card ${selected?'selected':''}" data-action="${selectable?'batch-select':'edit-record'}" data-id="${esc(r.id)}" ${selectable?'aria-pressed="'+!!selected+'"':''}>${selectable?`<span class="selection-mark" aria-hidden="true">${selected?icon('check',16):''}</span>`:''}${r.assetId?`<img class="asset-photo" src="${s.urls[r.assetId]}" alt="${esc(r.title)}" loading="lazy" decoding="async">`:`<div class="asset-note"><p>${esc(r.note||r.title)}</p></div>`}<div class="asset-body"><h3>${esc(r.title)}</h3><div class="row">${tag(cat(s,r.categoryId))}<span class="badge">${esc(syncLabel(r))}</span><span class="date">${r.date.slice(5)}</span></div></div></button>${selectable?button('edit-record','预览与修改','','button ghost small-button','data-id="'+esc(r.id)+'"'):''}</article>`;
  }).join('')}</div>${records.length>cards.length?button('library-more','继续加载 '+Math.min(80,records.length-cards.length)+' 份','','button') : ''}`;
}
export function library(s){
  const base=s.data.records.filter(r=>(!s.reviewDate||r.date===s.reviewDate)&&!!r.excluded===!!s.showExcluded&&(s.filterCategory==='all'||r.categoryId===s.filterCategory)&&(!s.search||[r.title,r.note,...(r.tags||[]),r.location].join(' ').toLowerCase().includes(s.search.toLowerCase())));
  const records=s.showExcluded?base:base.filter(r=>s.filterStatus==='all'||r.status===s.filterStatus);
  const pending=s.data.records.filter(r=>r.status==='review'&&!r.excluded&&(!s.reviewDate||r.date===s.reviewDate)).length;
  const queued=s.data.records.filter(r=>isSyncable(r)&&r.cloudSync?.state==='pending');
  const syncNotice=queued.length?`<div class="notice"><p>${queued.length} 条片刻尚未同步。${queued.some(r=>r.cloudSync.error)?'点开片刻可查看失败原因。':'满足好友授权后会自动继续。'}</p>${button('retry-cloud-sync','重试同步','','button small-button')}</div>`:'';
  const batch=s.batchMode?`<div class="batch-toolbar panel" role="region" aria-label="批量审核"><strong id="batch-count">已选 ${s.batchSelected?.size||0} 张</strong>${button('batch-all','全选 / 取消全选')}${s.showExcluded?button('batch-restore','恢复选中'):button('batch-exclude','移除选中')+button('batch-confirm','保存 '+(s.batchSelected?.size||0)+' 个片刻','','button primary',s.batchSelected?.size?'':'disabled')}<p class="small muted">默认只从拾日排除；删除原图需要另外选择并经系统确认。</p></div>`:'';
  return heading('挑选想留下的生活','',button('import','添加照片','plus','button primary photo-add'))+
    `<section class="material-inbox panel"><div><h2>${pending?'有 '+pending+' 份素材等你核对':'收集箱已整理好'}</h2>${pending?'':'<p class="muted">今天可以先到这里。</p>'}</div><div class="material-actions" aria-label="素材管理">${button('batch-mode',s.batchMode?'退出批量管理':'批量管理','','button '+(s.batchMode?'ghost':'primary'))}${button('excluded-view',s.showExcluded?'返回待审核':'已排除 · '+s.data.records.filter(r=>r.excluded).length)}${s.excludedUndo?.length?button('batch-undo','撤销排除'):''}</div></section>`+syncNotice+batch+
    (s.reviewDate?'<div class="review-date-scope">'+esc(s.reviewDate)+' 的素材 '+button('review-all-dates','查看所有日期','','button ghost small-button')+'</div>':'')+'<div class="chips material-status" aria-label="素材整理状态">'+[['review','待核对'],['confirmed','已确认'],['all','全部素材']].map(([id,label])=>'<button class="chip '+(s.filterStatus===id?'active':'')+'" data-action="library-status" data-id="'+id+'" aria-pressed="'+(s.filterStatus===id)+'">'+label+' · '+base.filter(r=>id==='all'||r.status===id).length+'</button>').join('')+'</div>'+
    '<div class="filters"><div class="search-field">'+icon('search',18)+'<input id="library-search" placeholder="搜索素材、笔记或标签…" aria-label="搜索素材" value="'+esc(s.search)+'"></div><select id="category-filter" aria-label="筛选生活分类">'+catOptions(s,s.filterCategory,true)+'</select><span class="small muted">'+records.length+' 份素材</span></div>'+
    (records.length?assetGrid(s,records):empty(s.showExcluded?'没有已排除照片':'当前没有匹配素材','可以切换状态或添加照片。'));
}
// Categories are a confirmed-life index, independent of the material inbox filters.
export function categories(s) {
  const confirmed=s.data.records.filter(r=>r.status==='confirmed'&&!r.excluded);
  const selected=s.data.categories.find(c=>c.id===s.categoryFocus);
  const chronological=rows=>rows.slice().sort((a,b)=>(b.date+(b.time||'')).localeCompare(a.date+(a.time||'')));
  if(!selected){
    const pending=s.data.records.filter(r=>r.status==='review'&&!r.excluded).length;
    return heading('生活分类','')+
      '<div class="category-overview"><h2>主题目录</h2>'+(confirmed.length?'<p class="muted">'+confirmed.length+' 个片刻 · '+new Set(confirmed.map(r=>r.date)).size+' 个记录日</p>':'')+'</div><div class="topic-directory">'+s.data.categories.map(c=>{
        const rows=chronological(confirmed.filter(r=>r.categoryId===c.id));
        const waiting=s.data.records.filter(r=>r.categoryId===c.id&&r.status==='review'&&!r.excluded).length;
        return '<button class="topic-row" data-action="open-category" data-id="'+esc(c.id)+'"><span class="category-icon" style="color:'+c.color+'">'+icon(c.icon,24)+'</span><span class="topic-copy"><strong>'+esc(c.name)+'</strong><span class="muted">'+(rows.length?'最近记录：'+esc(dateLabel(rows[0].date)):'记录第一个片刻')+'</span></span>'+(rows.length?'<span class="topic-count">'+rows.length+' 个片刻</span>':'')+icon('right',18)+'</button>';
      }).join('')+'</div><div class="category-add">'+button('new-category','新建分类','plus')+'</div>';
  }
  const rows=chronological(confirmed.filter(r=>r.categoryId===selected.id));
  const pending=s.data.records.filter(r=>r.categoryId===selected.id&&r.status==='review'&&!r.excluded).length;
  const groups=new Map();for(const r of rows){if(!groups.has(r.date))groups.set(r.date,[]);groups.get(r.date).push(r);}
  return '<div class="category-back">'+button('open-category','所有主题','left','button ghost','data-id="all"')+(selected.builtIn===false?button('edit-category','编辑分类','edit','button ghost','data-id="'+esc(selected.id)+'"'):'')+'</div>'+heading(esc(selected.name),'',rows.length?button('note','记一笔','edit'):'')+
    (rows.length?'<div class="category-overview"><p>'+rows.length+' 个片刻 · '+groups.size+' 个记录日'+(selected.id==='fitness'?' · 已记录运动 '+rows.reduce((n,r)=>n+(r.duration||0),0)+' 分钟 · '+rows.filter(r=>r.weight!=null).length+' 条体重记录':'')+'</p></div>':'')+
    (pending?'<div class="category-review notice"><span>这个主题还有 '+pending+' 份素材待核对，确认后会出现在这里。</span>'+button('review-category','去素材核对','right','button small-button','data-id="'+esc(selected.id)+'"')+'</div>':'')+
    (rows.length?'<div class="category-history">'+[...groups].map(([date,items])=>'<section class="history-day"><h2>'+esc(dateLabel(date))+'<small class="muted">'+esc(date.slice(0,4))+' · '+items.length+' 条</small></h2><div>'+items.map(r=>'<button class="history-record" data-action="edit-record" data-id="'+esc(r.id)+'"><span class="history-time muted">'+esc(r.time||'随记')+'</span><span class="history-copy"><strong>'+esc(r.title)+'</strong><span class="muted">'+esc(r.note||'点开查看这条记录')+'</span></span>'+(r.assetId&&s.urls[r.assetId]?'<img src="'+esc(s.urls[r.assetId])+'" alt="" loading="lazy">':'')+icon('right',16)+'</button>').join('')+'</div></section>').join('')+'</div>':empty('留一个值得记住的片刻','','note','记录第一个片刻','layers'));
}
export function categoryForm(category){
 return `<form id="category-form" data-id="${esc(category?.id||'')}"><div class="dialog-head"><h2 id="dialog-title">${category?'编辑分类':'新建分类'}</h2>${button('close-editor','','close','button ghost icon-only','aria-label="关闭"')}</div><div class="dialog-body"><label class="field">分类名称<input name="name" required maxlength="30" value="${esc(category?.name||'')}" placeholder="例如：阅读、家人、旅行" autocomplete="off"></label><p class="form-error" role="alert"></p></div><div class="dialog-foot">${category?button('delete-category','删除分类','trash','button ghost','data-id="'+esc(category.id)+'"'):''}${button('close-editor','取消')}<button type="submit" class="button primary">${category?'保存':'创建分类'}</button></div></form>`;
}
export function emotionWordOptions(group,word=''){
 return '<option value="">选择具体感受</option>'+(EMOTION_GROUPS.find(g=>g.id===group)?.words||[]).map(w=>`<option value="${esc(w)}" ${w===word?'selected':''}>${esc(w)}</option>`).join('');
}
export const lifeCalendar=s=>calendarView(s);
export function dailyFeelingForm(s){
 const feeling=dailyFeeling(s.data.settings,s.date),r=feeling||{emotion:''};
 return `<form id="daily-feeling-form"><div class="dialog-head"><h2 id="dialog-title">${esc(s.date)} 的感受</h2>${button('close-editor','','close','button ghost icon-only','aria-label="关闭"')}</div><div class="dialog-body"><div class="daily-presets">${DAILY_PRESETS.map(([word,emoji])=>button('daily-preset',`<span aria-hidden="true">${emoji}</span>${word}`,'','button ghost',`data-word="${word}" data-emoji="${emoji}" aria-pressed="${feeling?.emotion===word}"`)).join('')}</div><details class="daily-custom"><summary>更多感受，或自己写一个词</summary>${feelingFields({...s,data:{...s.data,records:[...s.data.records,...s.data.settings.filter(x=>x.id.startsWith('daily-feeling:'))]}},r)}<label class="field">日历表情<select name="dailyEmoji">${DAILY_EMOJIS.map(emoji=>`<option ${(feeling?.emoji||'💭')===emoji?'selected':''}>${emoji}</option>`).join('')}</select></label></details><p class="small muted">只代表你对这一天的感受，仅自己可见；不会改变任何片刻的心情。</p><p class="form-error" role="alert"></p></div><div class="dialog-foot">${feeling?button('clear-daily-feeling','清除心情','','button ghost'):''}${button('close-editor','取消')}<button type="submit" class="button primary">保存感受</button></div></form>`;
}
export function feelingFields(s,r){
 const selected=feelingSelection(r),custom=[...new Set(s.data.records.map(x=>x.emotion).filter(Boolean))].filter(word=>!EMOTION_GROUPS.some(g=>g.words.includes(word))).slice(0,20);
 return `<div class="field full feeling-picker"><label>当时的感受<select name="emotionGroup"><option value="none" ${selected.group==='none'?'selected':''}>暂不记录</option>${selected.group==='legacy'?`<option value="legacy" selected>原有自评 · ${esc(feelingLabel(r))}</option>`:''}${EMOTION_GROUPS.map(g=>`<option value="${g.id}" ${g.id===selected.group?'selected':''}>${g.name}</option>`).join('')}<option value="custom" ${selected.group==='custom'?'selected':''}>自己写一个词</option></select></label><label data-feeling-words ${['none','legacy','custom'].includes(selected.group)?'hidden':''}>具体感受<select name="emotion">${emotionWordOptions(selected.group,selected.word)}</select></label><label data-feeling-custom ${selected.group==='custom'?'':'hidden'}>我的情绪词<input name="customEmotion" maxlength="40" value="${selected.group==='custom'?esc(selected.word):''}" placeholder="如：emo、摸鱼" list="recent-emotions"></label><datalist id="recent-emotions">${custom.map(word=>`<option value="${esc(word)}"></option>`).join('')}</datalist></div>`;
}
export function reportData(s) {
  const range=periodRange(s.period,s.reportDate),id=`${s.period}:${range.start}:${s.reportStyle}`,
    saved=s.data.reports.find(r=>r.id===id),rows=inRange(s.data.records,range),
    current=makeReport(s.data.records,s.data.categories,s.period,s.reportDate,s.reportStyle),
    manual=saved?.source==='manual';
  // Legacy reports did not record whether text was edited. Keep their original verbatim.
  const preservedText=saved?.preservedText||(!saved?.source&&saved?.text!==current?saved?.text:'');
  return {range,id,saved,signature:signature(rows),count:rows.length,days:new Set(rows.map(r=>r.date)).size,
    manual,preservedText,text:manual?saved.text:current};
}
export function reports(s) {
  if(s.assistantOpen)return assistantPanel(s);
  const r = reportData(s);
  const version=r.manual?'手写内容已保留'+(r.signature!==r.saved.recordSignature?' · 记录已变化，可重新生成':''):
    '按最新已确认记录自动整理'+(r.preservedText?' · 旧版原文已保留':'');
  return (
    heading(
      "回看自己的生活",
      "",
      button("assistant-toggle","问问拾日","spark","button ghost"),
    ) +
    assistantPanel(s)+`<div class="report-toolbar"><div class="tabs" role="tablist" aria-label="报告周期">${Object.entries(
      PERIOD_LABELS,
    )
      .map(
        ([id, label]) =>
          `<button class="tab ${s.period === id ? "active" : ""}" role="tab" aria-selected="${s.period === id}" data-action="period" data-id="${id}">${label}</button>`,
      )
      .join(
        "",
      )}</div><input type="date" id="report-date" value="${s.reportDate}" aria-label="报告基准日期"><select id="report-style" aria-label="报告风格"><option value="brief" ${s.reportStyle === "brief" ? "selected" : ""}>简洁精简版</option><option value="deep" ${s.reportStyle === "deep" ? "selected" : ""}>深度复盘版</option></select></div>${s.period === "year" ? yearTimeline(s) : ""}${photoRecall(s,r.range)}<div class="review-footprint"><strong>${r.days}<small>天生活</small></strong><strong>${r.count}<small>条记录</small></strong><span>${r.range.start} — ${r.range.end}</span></div><details class="report-version"><summary>报告来源与更新</summary>${esc(version)}</details><div class="report-layout"><article class="panel report-paper">${s.reportEditing ? `<label class="field">编辑报告内容（Markdown）<textarea id="report-editor">${esc(r.text)}</textarea></label>` : markdown(r.text)}${r.preservedText?`<details class="report-original"><summary>查看保留的原文</summary>${markdown(r.preservedText)}</details>`:""}</article><aside class="report-aside"><h3 class="full">这份回顾，只属于你</h3>${button("save-report", "保存报告", "check", "button primary")}${button("edit-report", s.reportEditing ? "返回预览" : "编辑内容", "edit")}${button("regenerate-report", "重新生成", "refresh")}${button("copy-report", "复制全文", "copy")}${button("download-report", "导出 Markdown", "download")}<p>基于已确认记录，在本机用规则整理。深度版提供更完整的结构与反思提示。</p><p>修改不会上传；重新生成前会确认是否替换已有文字。</p></aside></div>`
  );
}
export function plans(s) {
  if(s.assistantOpen)return assistantPanel(s);
  const rows = s.data.plans
    .filter((p) => p.horizon === s.horizon)
    .sort((a, b) => a.order - b.order);
  return (
    heading(
      "接下来，想做些什么？",
      "",
      button("suggest-plans", "生活建议", "spark") +
        button("new-plan", "添加计划", "plus", "button primary")+button("assistant-plan","AI 自我规划","spark","button ghost")+button("assistant-toggle","问问拾日","spark","button ghost"),
    ) +
    assistantPanel(s)+planningPanel(s)+`<div class="row between wrap"><div class="tabs" role="tablist" aria-label="规划范围"><button class="tab ${s.horizon === "week" ? "active" : ""}" role="tab" aria-selected="${s.horizon === "week"}" data-action="horizon" data-id="week">下一周</button><button class="tab ${s.horizon === "month" ? "active" : ""}" role="tab" aria-selected="${s.horizon === "month"}" data-action="horizon" data-id="month">下个月</button></div><span class="small muted">${rows.filter((r) => r.done).length} / ${rows.length} 已完成</span></div><p class="plan-tip">拖动或用箭头排序。建议只有采纳后才成为计划。</p><div class="plan-list">${rows.length ? rows.map((p) => `<article class="plan-row ${p.done ? "done" : ""}" draggable="true" data-plan-id="${esc(p.id)}"><span class="grip muted" aria-hidden="true">${icon("grip", 18)}</span><label class="plan-check"><input type="checkbox" data-plan-check="${esc(p.id)}" ${p.done ? "checked" : ""} aria-label="完成 ${esc(p.title)}"></label><div class="plan-body"><h3>${esc(p.title)}</h3><p>${esc(p.reason || "按照自己的节奏来。")}</p><div class="row gap8" style="margin-top:6px">${tag(cat(s, p.categoryId))}<span class="small muted">${p.date}</span></div></div><div class="plan-actions">${button("plan-up", "", "up", "button ghost icon-only", `data-id="${esc(p.id)}" aria-label="上移 ${esc(p.title)}"`)}${button("plan-down", "", "down", "button ghost icon-only", `data-id="${esc(p.id)}" aria-label="下移 ${esc(p.title)}"`)}${button("edit-plan", "", "edit", "button ghost icon-only", `data-id="${esc(p.id)}" aria-label="编辑 ${esc(p.title)}"`)}${button("delete-plan", "", "trash", "button ghost icon-only", `data-id="${esc(p.id)}" aria-label="删除 ${esc(p.title)}"`)}</div></article>`).join("") : empty("为想做的事，留一个位置", "根据过往记录获取小建议，或者直接写下自己的计划。", "new-plan", "添加第一个计划", "plan")}</div>`
  );
}
const switchControl = (key, checked, label) =>
  `<label class="toggle"><input type="checkbox" data-setting="${key}" ${checked ? "checked" : ""} aria-label="${label}"><span class="toggle-track"></span></label>`;
const settingRow = (title, desc, control) =>
  `<div class="setting-row"><div><h3>${title}</h3><p>${desc}</p></div>${control}</div>`;
export function settings(s) {
  const usage = s.storage?.usage || 0,
    quota = s.storage?.quota || 0,
    mb = (n) => (n / 1024 / 1024).toFixed(1);
  return (
    heading(
      "一个安心的，私人空间。",
      "按自己的节奏记录。你的照片、感受和计划，始终由你掌握。",
    ) +
    usageGuide(s)+`<div class="panel privacy-box">${icon("shield", 28)}<div><h2>数据留在设备，生活留给自己</h2><p>所有生活素材都保存在当前浏览器的 IndexedDB。登录后可离线记录。内测统计默认关闭，可在下方单独选择。审核并保存生活片刻后，按已授权好友的范围自动同步压缩副本；私人日记、未审核素材和复盘报告不上传。请定期导出备份；更换浏览器、清理站点数据或使用无痕模式，可能丢失记录。</p></div></div><div class="settings-grid"><section class="panel settings-section"><h2 class="row">${icon("moon", 20)}晚间提醒</h2>${settingRow("每天给自己一点时间", "网页保持打开且可见时，到点显示提醒。", switchControl("reminderEnabled", s.settings.reminderEnabled, "开启每日提醒"))}${settingRow("提醒时间", "按设备当前时区计算。", `<input type="time" id="reminder-time" value="${esc(s.settings.reminderTime)}" aria-label="提醒时间" required>`)}${settingRow("浏览器通知", "需要主动授权；不能保证后台或锁屏准时。", button("notification", "启用通知", "", "button small-button"))}<div class="notice">手机浏览器无法自动唤起相册或读取“今日新增照片”。到点后请点击“添加照片”主动选择；错过提醒会在重新打开页面时补提醒。</div>${button("test-reminder", "预览网页提醒", "clock", "button ghost small-button", 'style="margin-top:12px"')}</section><section class="panel settings-section"><h2 class="row">${icon("spark", 20)}本地智能整理</h2>${settingRow("本地视觉分类", "仅从同源本地文件加载模型；从不自动下载公网模型。", switchControl("aiEnabled", s.settings.aiEnabled, "启用本地视觉分类"))}${settingRow("本地文字识别（OCR）", "识别账单、截图中的文字，作为待确认的素材。", switchControl("ocrEnabled", s.settings.ocrEnabled, "启用本地文字识别"))}<div class="notice" id="model-status">${esc(s.modelStatus || "模型尚未检测。未部署时照片会标为“待整理”，不会伪装成已识别。")}</div><div class="settings-buttons">${button("check-models", "检测本地模型", "refresh")}<a class="button" href="docs/local-ai.md" target="_blank" rel="noopener">部署说明 ${icon("arrow", 15)}</a></div><p class="small muted" style="margin-top:16px">已保存 ${s.data.learning.length} 条人工纠正。纠正记忆用于后续文字/视觉候选匹配，不会重训基础模型。</p></section><section class="panel settings-section"><h2 class="row">${icon("book", 20)}阅读与复盘</h2>${settingRow("默认报告风格", "随时可在报告页切换。", `<select id="default-style" aria-label="默认报告风格"><option value="brief" ${s.settings.reportStyle === "brief" ? "selected" : ""}>简洁精简</option><option value="deep" ${s.settings.reportStyle === "deep" ? "selected" : ""}>深度复盘</option></select>`)}${settingRow("自动保存复盘草稿", "保存记录后，补齐日/周/月/年草稿；已有快照不覆盖。", switchControl("autoReport", s.settings.autoReport, "自动保存复盘草稿"))}${settingRow("界面外观", "适合夜间回顾，也支持浅色阅读。", `<select id="theme-select" aria-label="界面外观"><option value="dark" ${s.settings.theme === "dark" ? "selected" : ""}>深色</option><option value="light" ${s.settings.theme === "light" ? "selected" : ""}>浅色</option></select>`)}</section><section class="panel settings-section"><h2 class="row">${icon("lock", 20)}本地存储与备份</h2><p class="small muted">${s.data.records.length} 条记录 · ${s.data.assets.length} 张原图 · ${s.data.reports.length} 份报告</p><div class="storage-bar"><span style="width:${quota ? Math.max(0.5, Math.min(100, (usage / quota) * 100)) : 0}%"></span></div><div class="storage-caption"><span>本站点已用 ${mb(usage)} MiB</span><span>${quota ? `配额 ${(quota / 1024 / 1024 / 1024).toFixed(1)} GiB` : "浏览器未提供配额"}</span></div><div class="settings-buttons">${button("export-backup", "完整备份", "download", "button primary")}${button("restore-backup", "恢复备份", "upload")}${button("persist", "申请持久存储", "shield")}</div><p class="small muted" style="margin-top:14px">ZIP 包含 JSON、原图和缩略图，单次上限 200 MiB。恢复会合并新数据，同 ID 保留本机内容；备份未加密，请妥善保管。</p>${settingRow("旧版健身日志", "原始记录保留；可选择将它们导入生活分类。", button("import-legacy", "导入旧记录", "", "button small-button"))}</section><section class="panel settings-section danger-zone"><h2>清空这个生活空间</h2><p class="small muted">删除本应用的照片、笔记、报告、规划与设置。操作不可撤销，请先完成备份；不会删除旧版健身日志。</p><div class="settings-buttons">${button("clear-data", "清空全部数据", "trash", "button danger")}</div></section><section class="panel settings-section"><h2>关于拾日</h2><p class="small muted">个人生活自动复盘日志系统<br>收集片刻，理解自己，慢慢向前。</p><a class="docs-link" href="README.md" target="_blank" rel="noopener">使用说明与浏览器限制 →</a><a class="docs-link" href="docs/life-product.md" target="_blank" rel="noopener">产品架构、流程图与原型 →</a><a class="docs-link" href="docs/life-storage.md" target="_blank" rel="noopener">本地数据库结构 →</a><a class="docs-link" href="fitness.html" target="_blank" rel="noopener">打开原有健身日记 →</a></section></div>`
  );
}
export function recordForm(s, r, fullURL) {
  const legacy=r.id&&r.status==='confirmed'&&r.kind!=='moment';
  const sharing=`<details class="notice record-sharing"><summary>保存范围 · ${legacy||r.visibility==='self'?'仅自己':'已授权好友'}</summary><strong>${esc(syncLabel(r))}</strong>${syncDetail(r)?`<p class="small danger-text" role="status">${esc(syncDetail(r))}</p>`:''}<label class="field">记录用途<select name="recordKind"><option value="moment" ${!legacy?'selected':''}>生活片刻</option><option value="diary" ${legacy?'selected':''}>私人日记（仅本机）</option></select></label><label class="field">片刻可见范围<select name="visibility"><option value="friends" ${r.visibility!=='self'&&!legacy?'selected':''}>已授权好友</option><option value="self" ${r.visibility==='self'||legacy?'selected':''}>仅自己</option></select></label><p class="small muted">保存后自动按好友授权同步，无需再次发布。私人日记、未审核素材与个人复盘不上传；离线撤销需联网完成后生效。</p></details>`;
  return `<form id="record-form"><div class="dialog-head"><h2 id="dialog-title">${r.id ? "整理这个片刻" : "记下一个生活片刻"}</h2>${button("close-editor", "", "close", "button ghost icon-only", 'aria-label="关闭编辑"')}</div><div class="dialog-body">${fullURL ? `<img class="preview-image" src="${fullURL}" alt="所选原图">` : ""}${r.assetId ? `<div class="model-result">${esc(r.analysis?.method || "未识别")} · 保存后确认分类${r.analysis?.ocr ? `<details><summary>查看识别文字</summary><p class="pre-wrap">${esc(r.analysis.ocr.slice(0,2000))}</p></details>` : "<p>未检测到清晰文字</p>"}</div>${button("analyze-record", "重新进行本地识别", "spark", "button small-button", 'style="margin-bottom:16px"')}` : ""}<div class="form-grid"><label class="field full">给这个片刻起个名字<input name="title" required maxlength="200" value="${esc(r.title)}" placeholder="今天，发生了什么？"></label><label class="field">日期<input type="date" name="date" required min="1900-01-01" max="2200-12-31" value="${r.date}"></label><label class="field">时间<input type="time" name="time" required value="${r.time}"></label><label class="field">生活分类<select name="categoryId">${catOptions(s, r.categoryId)}</select></label>${feelingFields(s,r)}<label class="field full">想留下的话<textarea name="note" rows="4" maxlength="20000" placeholder="记一点经过，也可以写下自己的感受。">${esc(r.note)}</textarea></label></div><details class="record-more"><summary>更多细节 · 标签、地点与数据</summary><div class="form-grid"><div class="full">${button("extract-fields", "从文字提取分类与字段", "spark", "button small-button")}<p class="small muted">只提取明确写出的地点、金额、时长与体重；不会猜测心情。</p></div><label class="field">地点<input name="location" maxlength="200" value="${esc(r.location)}" placeholder="如：家附近的公园">${r.source==='native-auto'&&globalThis.window?.shiriNative?.photos?.location?button("photo-location","读取原图地点","","button ghost small-button"):""}<span class="small muted">地点仅用于本机记录，不随片刻同步。</span></label><label class="field">标签（逗号分隔）<input name="tags" maxlength="800" value="${esc(r.tags.join("，"))}" placeholder="散步，独处，秋天"></label><label class="field">活动时长 / 分钟<input type="number" name="duration" min="0" max="1440" step="0.1" value="${r.duration ?? ""}" placeholder="选填"></label><label class="field">金额 / 元<input type="number" name="amount" min="0" max="100000000" step="0.01" value="${r.amount ?? ""}" placeholder="选填"></label><label class="field">体重 / kg<input type="number" name="weight" min="1" max="1000" step="0.1" value="${r.weight ?? ""}" placeholder="选填"></label><label class="field">回顾标记<select name="reflection"><option value="">普通片刻</option><option value="highlight" ${r.reflection === "highlight" ? "selected" : ""}>值得留住的亮点</option><option value="regret" ${r.reflection === "regret" ? "selected" : ""}>下次想做得更好</option></select></label></div></details>${sharing}<p class="editor-hint">图片日期默认取导入时选择的日期，请按实际拍摄时间调整。心情由你填写，系统不会从照片猜测。</p><p class="form-error" id="editor-error" role="alert"></p></div><div class="dialog-foot">${r.id ? button("delete-record", "删除", "trash", "button ghost delete-record") : ""}${button("close-editor", "取消")}<button class="button primary" type="submit">${icon("check", 17)}保存片刻</button></div></form>`;
}
export function planForm(s, p) {
  return `<form id="plan-form"><div class="dialog-head"><h2 id="dialog-title">${p.id ? "编辑计划" : "给未来留一点期待"}</h2>${button("close-editor", "", "close", "button ghost icon-only", 'aria-label="关闭编辑"')}</div><div class="dialog-body"><div class="form-grid"><label class="field full">想做的事<input name="title" required maxlength="200" value="${esc(p.title)}" placeholder="从一个小行动开始"></label><label class="field">安排日期<input type="date" name="date" required value="${p.date}" min="1900-01-01" max="2200-12-31"></label><label class="field">分类<select name="categoryId">${catOptions(s, p.categoryId)}</select></label><label class="field full">为什么想做<textarea name="reason" maxlength="2000" rows="3">${esc(p.reason)}</textarea></label></div><p class="form-error" id="editor-error" role="alert"></p></div><div class="dialog-foot">${button("close-editor", "取消")}<button class="button primary" type="submit">保存计划</button></div></form>`;
}

function usageGuide(s){
  const topics=[
    ['整理照片','在素材页选择或批量核对照片。安卓自动采集需主动授权，任务可能受省电策略延迟；网页需要手动选图。排除只移除拾日候选项，不删除系统相册原图，可撤销或主动恢复。'],
    ['保存片刻','核对日期、分类和文字后，点击一次“保存片刻”。它立即进入本机生活记录；已授权分享的片刻联网后自动同步，不需要再次发布。特别私密的片刻可设为仅自己。'],
    ['个人复盘与规划','日报、周报、月报和年报只统计已确认记录。首页复盘计数从本次更新后主动保存报告开始，自动生成不计入。建议根据记录、计划和主动填写的心情在本机整理；先查看依据，再编辑、采纳或忽略，不自动改变计划。'],
    ['亲密好友查看','通过昵称或账号查找、发送申请。好友关系建立后双方分别授权可见范围；成为好友不会自动获得所有内容。可在好友设置限制历史范围、撤销权限、删除或屏蔽。'],
    ['隐私与同步','未审核素材、私人日记、个人复盘及仅自己可见片刻不自动上传。好友只查看授权范围内的已同步片刻。离线删除或撤销需联网完成后，服务器才拒绝后续访问；已经看过或另存的内容无法远程收回。'],
    ['备份与问问拾日','更换设备或卸载前导出完整备份。“问问拾日”当前未接通服务；未来启用时需单独同意，并明确选择摘要，个人分析不会自动同步给好友。登录后可离线记录，联网再验证和同步。']
  ];
  return `<details id="usage-guide" class="panel usage-guide" ${s.guideOpen?'open':''}><summary>${icon('book',20)}使用指南<span class="small muted">按需展开</span></summary><div class="guide-topics">${topics.map(([title,text],i)=>`<section><span class="guide-number">0${i+1}</span><div><h3>${title}</h3><p>${text}</p></div></section>`).join('')}</div></details>`;
}
function planningPanel(s){
  if(!s.planning)return '';
  const ignored=s.data.settings.find(r=>r.id==='planning-dismissed')?.keys||[];
  const suggestions=s.planning.suggestions.filter(p=>!ignored.includes(p.key)&&!s.data.plans.some(old=>old.suggestionKey===p.key||(old.title===p.title&&old.date===p.date)));
  return `<section class="panel planning-review"><div class="section-head"><h2>从生活里找到下一步</h2><span class="badge">本机规则 · 非 AI</span></div><div class="insight-facts"><section><h3>最近生活观察</h3>${s.planning.observations.map(t=>`<p>${esc(t)}</p>`).join('')}</section><section><h3>值得关注的变化</h3>${s.planning.changes.map(t=>`<p>${esc(t)}</p>`).join('')}</section></div><h3>接下来可以试试</h3>${suggestions.length?suggestions.map(p=>`<article class="suggestion-row"><h3>${esc(p.title)}</h3><p>${esc(p.reason)}</p><span class="small muted">可安排在 ${p.date} · 时间可编辑</span><div class="settings-buttons">${button('adopt-suggestion','采纳','','button primary small-button',`data-key="${esc(p.key)}"`)}${button('edit-suggestion','编辑后采纳','edit','button small-button',`data-key="${esc(p.key)}"`)}${button('ignore-suggestion','忽略','','button ghost small-button',`data-key="${esc(p.key)}"`)}</div></article>`).join(''):'<p class="muted">本轮建议已处理。你的计划仍由你决定。</p>'}</section>`;
}
export function assistantPanel(s){
  if(!s.assistantOpen)return '';
  const candidates=s.data.records.filter(r=>r.kind==='moment'&&r.status==='confirmed'&&!r.excluded&&r.date>=addDays(localDate(),-13)&&r.date<=localDate()).sort((a,b)=>b.date.localeCompare(a.date));
  const selected=s.assistantSelected||[],context=assistantContext(s.data.records,selected,localDate());
  const history=s.assistantHistory||[];
  return `<section class="assistant-panel chat-page" aria-label="问问拾日">
    <header class="chat-header"><h1>问问拾日</h1><div>${button('assistant-clear','清空','','button ghost small-button',s.assistantBusy?'disabled':'')}${button('assistant-toggle','','close','button ghost icon-only','aria-label="返回上一页"')}</div></header>
    <div class="chat-messages" role="log" aria-label="对话内容" aria-live="polite">${history.length?history.map(m=>`<article data-message-id="${esc(m.id||'')}" class="chat-message ${m.role==='user'?'from-user':'from-assistant'}"><span class="sr-only">${m.role==='user'?'我':'拾日'}：</span><p>${esc(m.content)}</p>${m.status==='failed'?'<small class="assistant-status">未获得回复，请重新发送。</small>':''}</article>`).join(''):`<div class="chat-empty">${icon('spark',30)}<h2>最近，有什么想聊的？</h2><p>可以聊聊生活，也可以一起想想接下来的计划。</p></div>`}${s.assistantBusy?'<p class="chat-wait" role="status">正在回复…</p>':''}</div>
    <form id="assistant-form" class="chat-composer">
      <div class="chat-options">
      <details class="chat-context"><summary>附带片刻${context.length?' · '+context.length:''} / 目标</summary>
        <label class="field">目标（可选）<textarea name="goals" maxlength="600" rows="2">${esc(s.assistantGoals||'')}</textarea></label>
        <details class="assistant-records"><summary>选择近 14 天片刻 · ${context.length} / 20</summary>${candidates.length?candidates.map(r=>`<label class="assistant-choice"><input type="checkbox" data-assistant-record="${esc(r.id)}" ${selected.includes(r.id)?'checked':''} ${s.assistantBusy?'disabled':''}><span>${r.date} · ${esc(r.title)}</span></label>`).join(''):'<p class="small muted">暂无可选片刻。未审核素材和私人日记不会提供给模型。</p>'}</details>
        <details class="assistant-preview"><summary>查看所选摘要</summary><div class="assistant-summary">${context.length?context.map(r=>`<article><strong>${r.date} · ${esc(r.title)}</strong><p>${esc(r.note||'')}</p><p class="small muted">${esc(r.category)}${r.mood?' · 心情 '+r.mood+'/5':''}${r.reflection?' · '+esc(r.reflection):''}</p></article>`).join(''):'<p>未附带生活记录。</p>'}</div></details>
      </details>
      <details class="chat-privacy"><summary>数据处理说明</summary><p>处理方：${esc(ASSISTANT_CONFIG.provider)}。经拾日云函数发送本次问题、目标、你选择的摘要及最近三轮对话。不发送原图、位置、好友记录或账号资料。对话只在本次打开期间保留，切换页面不会清空，重启不会恢复。不自动加入计划或分享；清空会移除本机会话，服务方按其规则处理数据。</p><p>每分钟最多一次；相同请求缓存 10 分钟。模型可能出错，请核对事实。</p></details>
      ${!s.assistantReady?'<p role="status">AI 服务未接通，暂时无法发送。</p>':''}
      <label class="assistant-choice chat-consent"><input type="checkbox" name="consent" ${s.assistantConsent?'checked':''} ${!s.assistantReady||s.assistantBusy?'disabled':''}>同意本次由上述模型服务处理问题与所选内容</label>
      </div>
      <div class="chat-input-row"><textarea name="question" aria-label="消息" maxlength="600" rows="2" placeholder="和拾日聊聊…" required ${s.assistantBusy?'readonly':''}>${esc(s.assistantQuestion||'')}</textarea><button class="button primary" type="submit" ${!s.assistantReady||s.assistantBusy?'disabled':''}>${s.assistantBusy?'回复中':'发送'}</button></div>
      <p role="status" class="assistant-status">${esc(s.assistantError||'')}</p>
    </form></section>`;
}
