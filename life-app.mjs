import {removalPlan,removeCandidates,chooseRemoval} from './src/review-removal.mjs';
import {coordinateLabel,resolveCaptureLocation} from './src/photo-metadata.mjs';
import {createPhotoOnboarding} from './src/photo-onboarding.mjs';
import {readFeeling,categoryCanDelete} from './src/life-expression.mjs';
import {DAILY_PREFIX,makeDailyFeeling,shiftMonth,emotionEmoji} from './src/life-calendar.mjs';
import {EMOTION_GROUPS} from './src/life-expression.mjs';
import {mountLocalPhotos} from './src/local-photo-gallery.mjs';
import {saveFeedback} from './src/record-journey.mjs';
import {beginTurn,finishTurn,changeContext} from './src/chat-session.mjs';
import {createChatLayout} from './src/chat-layout.mjs';
import {installDialogLayout} from './src/dialog-layout.mjs';
import {spaceId} from './src/space.mjs';
import {
  localDate,
  addDays,
  uid,
  DEFAULT_SETTINGS,
  DEFAULT_CATEGORIES,
  periodRange,
  signature,
  inRange,
  makeReport,
  suggestCategory,
  planningReview,
  reminderDue,
  validDate,
  extractFields,
} from "./src/core.mjs";
import * as db from "./src/db.mjs";
import * as views from "./src/views.mjs";
import { icon, esc, button } from "./src/ui.mjs";
import { prepareImage } from "./src/images.mjs";
import { exportBackup, parseBackup } from "./src/backup.mjs";
import { analyzeImage, checkModels } from "./src/local-ai.mjs";
import {createCollector} from './src/auto-collect.mjs';
import {createSocial} from './src/cloudbase-panel.mjs';
import {createPrivateCloud} from './src/private-cloud.mjs';
import {savedMoment,reviewBatch} from './src/moment-review.mjs';
import {ASSISTANT_CONFIG,assistantContext,createAssistantClient} from './src/life-assistant.mjs';
import {MEDIA_API} from './src/cloudbase-social-config.mjs';
import {BETA_ID,createBetaAnalytics} from "./src/beta-analytics.mjs";
const $ = (s) => document.querySelector(s);
const state = {
  data: {
    records: [],
    assets: [],
    categories: DEFAULT_CATEGORIES,
    reports: [],
    plans: [],
    learning: [],
    settings: [],
  },
  settings: { ...DEFAULT_SETTINGS },
  view: "dashboard",
  date: localDate(),
  calendarOpen:false,calendarMonth:localDate().slice(0,7),calendarLimit:20,recallLimit:24,
  reportDate: localDate(),
  period: "day",
  reportStyle: "brief",
  horizon: "week",
  planning:null,guideOpen:false,assistantOpen:false,assistantSelected:[],assistantQuestion:"",assistantConsent:false,assistantAnswer:"",assistantHistory:[],assistantMode:"chat",assistantGoals:"",assistantError:"",assistantBusy:false,assistantReady:false,
  categoryFocus: "all",
  filterCategory: "all",
  filterStatus: "all",
  search: "",
  batchMode:false,
  batchSelected:new Set(),
  showExcluded:false,
  libraryLimit:80,
  excludedUndo:[],
  urls: {},
  reportEditing: false,
  storage: null,
  modelStatus: "",
  busy: false,
};
let toastTimer,
  editing = null,
  editorDirty = false,
  editorURL = "",
  reportDirty = false,
  dragId = "",
  reminderRunning = false,
  searchTimer;
let workspaceReady=false,workspaceOpening=null,backgroundStarted=false;
let photoGuide;
let releaseLocalPhotos=()=>{};
const validViews = [...views.NAV.map((v) => v[0]), "settings"];
const collector=createCollector({changed,toast,confirm:confirmAction,onDiscard:record=>privateCloud.remove(record),isBusy:()=>state.busy||!workspaceReady||!social.canUseLocal,setBusy:value=>{state.busy=value;}});
const privateCloud=createPrivateCloud({getData:()=>state.data,changed,toast,confirm:confirmAction,revokeRemote:id=>social.revokeLocal(id),reviewed:()=>closeEditor(true),redraw:()=>{if(state.view==='settings')render();}});
const social=createSocial({getData:()=>state.data,isBusy:()=>state.busy,changed:async()=>{await refresh();render();},toast,confirm:confirmAction,redraw:accessChanged});
const serviceOrigin=MEDIA_API?new URL(MEDIA_API).origin:'';
const assistant=createAssistantClient({config:ASSISTANT_CONFIG,allowedOrigin:serviceOrigin,token:()=>social.assistantToken()});
const chatLayout=createChatLayout();
installDialogLayout();
photoGuide=createPhotoOnboarding({canShow:()=>workspaceReady&&social.canUseLocal&&!state.busy,enable:()=>collector.enable(),onGranted:()=>collector.start(),toast});
state.assistantReady=assistant.configured;
const beta=createBetaAnalytics({read:()=>db.get('settings',BETA_ID),write:row=>db.put('settings',row),token:()=>social.assistantToken(),allowedOrigin:serviceOrigin});
function betaPanel(){const b=beta.snapshot;return `<section class="panel settings-section" id="beta-privacy"><h2>帮助改善内测体验</h2><p class="small muted">默认关闭。开启后，仅统计首次保存、后续保存、复盘查看、好友近况查看及同步错误的次数与日期；不记录照片、日记、心情正文、好友 ID 或错误详情。首次保存指本账号在本机首次保存，不代表全平台新用户。</p><p class="small muted">${b.configured?'统计发送到拾日腾讯云服务，以当前登录会话验证身份；统计正文不含账号标识。网络服务可能保留访问日志。仅管理员可通过云控制台查看，统计保留不超过 30 天。':'统计后端尚未部署：本版本仅在本机保留最近 30 天计数，不上传。接通云端前将重新征求同意。'}</p><label class="field"><span><input type="checkbox" id="beta-consent" ${b.enabled?'checked':''}> 自愿参与内测统计</span></label><p class="small muted">本机待处理 ${b.count} 次操作。关闭即清除本机计数并停止采集；不会影响任何生活记录。</p><button class="button ghost small-button" data-action="beta-clear">清除本机统计</button></section>`;}

// Open local data only after the existing account session has been restored.
function accessChanged(){
  if(!social.canUseLocal){workspaceReady=false;photoGuide?.stop();assistant.clear();chatLayout.reset();state.assistantPendingId=null;state.assistantContextStart=0;state.assistantBusy=false;state.assistantHistory=[];state.assistantAnswer='';state.assistantSelected=[];state.assistantQuestion='';state.assistantGoals='';state.assistantConsent=false;render();return;}
  if(workspaceReady){if(state.view==='friends')render();return;}
  if(workspaceOpening)return;
  workspaceOpening=(async()=>{
    await refresh();if(!social.canUseLocal)return;
    state.reportStyle=state.settings.reportStyle;workspaceReady=true;render();
    if(!backgroundStarted){backgroundStarted=true;setInterval(tick,30000);}
    tick();collector.start().finally(()=>photoGuide?.start());privateCloud.start().catch(error=>toast(error.message));
  })().catch(error=>toast(errorText(error))).finally(()=>{workspaceOpening=null;});
}
function toast(message) {
  $("#toast").classList.remove("save-feedback");
  $("#toast").textContent = message;
  $("#toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($("#toast").hidden = true), 5000);
}
function savedFeedback(before,rows) {
 const f=saveFeedback(before,state.data.records,rows,localDate());
 toast(f.title+'。'+f.detail);const el=$('#toast');el.classList.add('save-feedback');
 el.innerHTML='<span class="save-seal" aria-hidden="true">'+icon('check',22)+'</span><span><strong>'+esc(f.title)+'</strong><small>'+esc(f.detail)+'</small></span>';
 clearTimeout(toastTimer);toastTimer=setTimeout(()=>{el.hidden=true;el.classList.remove('save-feedback');},4000);
}
function errorText(error) {
  return error?.name === "QuotaExceededError"
    ? "本机存储空间不足，保存未完成。请先导出备份并释放空间。"
    : error?.message || "操作未完成，请重试。";
}
function render() {
  releaseLocalPhotos();
  const chatPosition=chatLayout.capture();
  document.documentElement.dataset.theme = state.settings.theme;
  const locked=!workspaceReady||!social.canUseLocal;
  document.documentElement.classList.toggle('login-gated',locked);
  document.documentElement.classList.toggle('chat-active',!locked&&state.assistantOpen&&['reports','plans'].includes(state.view));
  if(locked){
    for(const id of ['#sidebar','#topbar','#mobile-nav'])$(id).innerHTML='';
    // Closed dialogs cannot leave private content exposed after a revoked session.
    document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());
    $('#main').innerHTML=social.canUseLocal?'<p role="status">正在打开你的本机生活记录…</p>':social.loginPanel();
    document.title='登录 · 拾日';return;
  }
  const c = views.chrome(state);
  const recallKey=state.period+'|'+state.reportDate;if(state.recallKey!==recallKey){state.recallKey=recallKey;state.recallLimit=24;}
  $("#sidebar").innerHTML = c.sidebar;
  $("#topbar").innerHTML = c.topbar;
  $("#mobile-nav").innerHTML = c.mobile;
  const renderers = {
    dashboard: views.dashboard,
    library: views.library,
    categories: views.categories,
    reports: views.reports,
    plans: views.plans,
    settings: s => views.settings(s)+betaPanel()+collector.panel()+privateCloud.panel(),
    friends: () => social.panel(),
  };
  $("#main").innerHTML = renderers[state.view](state);
  const gallery=$('#main');releaseLocalPhotos=mountLocalPhotos(gallery,{getAsset:id=>db.get('assets',id),isCurrent:()=>workspaceReady&&social.canUseLocal&&gallery.isConnected});
  document.documentElement.classList.toggle('batch-active',!!document.querySelector('.batch-toolbar'));
  document.querySelector('.page-heading .photo-add')?.closest('.page-heading')?.classList.add('photo-heading');
  chatLayout.restore(chatPosition);
  if(!document.hidden)beta.page(state.view,social.showingFeed,{assistantOpen:state.assistantOpen}).catch(()=>{});
  document.title = `${views.NAV.find((v) => v[0] === state.view)?.[1] || "设置与隐私"} · 拾日`;
}
async function refresh() {
  state.data = await db.readAll();
  await beta.load().catch(()=>{});beta.errors(state.data.records).then(()=>beta.flush()).catch(()=>{});
  state.data.categories.sort((a, b) => {
    const rank = (id) => {
      const i = DEFAULT_CATEGORIES.findIndex((c) => c.id === id);
      return i < 0 ? 100 : i;
    };
    return rank(a.id) - rank(b.id);
  });
  state.settings = {
    ...DEFAULT_SETTINGS,
    ...state.data.settings.find((x) => x.id === "main"),
  };
  const assets = new Set(state.data.assets.map((a) => a.id));
  for (const [id, url] of Object.entries(state.urls))
    if (!assets.has(id)) {
      URL.revokeObjectURL(url);
      delete state.urls[id];
    }
  for (const asset of state.data.assets)
    if (!state.urls[asset.id])
      state.urls[asset.id] = URL.createObjectURL(asset.thumbnail);
  if (navigator.storage?.estimate)
    state.storage = await navigator.storage.estimate().catch(() => null);
}
async function changed(message) {
  await refresh();
  render();
  if (message) toast(message);
  privateCloud.sync().then(()=>social.scheduleSync());
}
function confirmAction(
  title,
  description,
  { danger = false, typed = false } = {},
) {
  return new Promise((resolve) => {
    const dialog = $("#confirm-dialog");
    dialog.innerHTML = `<form id="confirmation"><div class="dialog-head"><h2 id="confirm-title">${esc(title)}</h2></div><div class="dialog-body"><p class="muted">${esc(description)}</p>${typed ? '<label class="field" style="margin-top:18px">输入“清空”确认<input name="confirmation" autocomplete="off" required pattern="清空" placeholder="清空"></label>' : ""}</div><div class="dialog-foot"><button class="button" type="button" id="confirm-cancel">取消</button><button class="button ${danger ? "danger" : "primary"}" type="submit">${danger ? "确认删除" : "确认"}</button></div></form>`;
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      dialog.close();
      resolve(result);
    };
    $("#confirm-cancel").onclick = () => finish(false);
    $("#confirmation").onsubmit = (e) => {
      e.preventDefault();
      finish(true);
    };
    dialog.oncancel = (e) => {
      e.preventDefault();
      finish(false);
    };
    dialog.showModal();
    $("#confirm-cancel").focus();
  });
}
function releaseEditor() {
  if (editorURL) {
    URL.revokeObjectURL(editorURL);
    editorURL = "";
  }
  editing = null;
  editorDirty = false;
}
async function closeEditor(force = false) {
  if (
    !force &&
    editorDirty &&
    !(await confirmAction("放弃未保存的修改？", "本次修改还没有写入本地记录。"))
  )
    return;
  $("#editor-dialog").close();
  releaseEditor();
}
function blankRecord() {
  const now = new Date();
  return {
    date: state.date,
    time: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
    title: "",
    note: "",
    categoryId: state.view === "categories" && state.categoryFocus !== "all" ? state.categoryFocus : state.filterCategory !== "all" ? state.filterCategory : "daily",
    tags: [],
    location: "",
    mood: null,
    duration: null,
    amount: null,
    weight: null,
    reflection: "",
    assetId: null,
    status: "confirmed",
    source: "manual",
    analysis: { method: "手动记录", labels: [], ocr: "" },
  };
}
async function openRecord(id) {
  releaseEditor();
  editing = id
    ? structuredClone(state.data.records.find((r) => r.id === id))
    : blankRecord();
  if (!editing) return;
  const asset = state.data.assets.find((a) => a.id === editing.assetId);
  if (asset) editorURL = URL.createObjectURL(asset.blob);
  $("#editor-dialog").innerHTML = views.recordForm(state, editing, editorURL);
  $("#editor-dialog").showModal();
  // Also support candidates imported before EXIF extraction was introduced.
  const current=editing;
  if(asset&&current.status==='review'&&!current.location){
    try{
      const location=await resolveCaptureLocation(current,asset,window.shiriNative?.photos);
      const field=$('#record-form [name="location"]');
      if(location&&editing===current&&field?.isConnected&&!field.value&&!editorDirty){field.value=location;current.location=location;}
    }catch{/* Metadata failure cannot prevent editing/saving. */}
  }
}
function openPlan(id,draft) {
  releaseEditor();
  const next = periodRange(
    state.horizon,
    addDays(periodRange(state.horizon, localDate()).end, 1),
  );
  editing = id
    ? structuredClone(state.data.plans.find((p) => p.id === id))
    : {
        title: "",
        date: next.start,
        categoryId: "daily",
        reason: "",
        done: false,
        horizon: state.horizon,
        source: "manual",
      };
  if(draft)editing={...draft,suggestionKey:draft.key};
  $("#editor-dialog").innerHTML = views.planForm(state, editing);
  $("#editor-dialog").showModal();
}
function openCategoryForm(id){
 const category=id?state.data.categories.find(c=>c.id===id&&c.builtIn===false):null;
 if(id&&!category)return;
 releaseEditor();
 $('#editor-dialog').innerHTML=views.categoryForm(category);
 $('#editor-dialog').showModal();
 $('#category-form [name="name"]').focus();
}
async function autoReports(date) {
  if (!state.settings.autoReport) return;
  const data = await db.readAll(),
    newReports = [];
  for (const period of ["day", "week", "month", "year"]) {
    const range = periodRange(period, date),
      style = state.settings.reportStyle,
      id = `${period}:${range.start}:${style}`;
    const existing=data.reports.find(r=>r.id===id),recordSignature=signature(inRange(data.records,range));
    if (!existing || existing.source==='auto' && existing.recordSignature!==recordSignature)
      newReports.push({
        ...existing,
        id,
        source:'auto',
        period,
        ...range,
        style,
        text: makeReport(data.records, data.categories, period, date, style),
        generatedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        recordSignature: signature(inRange(data.records, range)),
      });
  }
  if (newReports.length) await db.putMany("reports", newReports);
}
async function protectOriginals(records){
 const ids=records.filter(r=>r.status==='confirmed'&&r.id.startsWith('native:')).map(r=>r.id.slice(7));
 if(!ids.length||!window.shiriNative?.photos?.protect)return;
 try{for(let i=0;i<ids.length;i+=300)await window.shiriNative.photos.protect({ids:ids.slice(i,i+300)});}
 catch{toast('片刻已保存在本机，原图保护状态暂未更新；系统删除前会再次检查。');}
}
async function saveRecord(form) {
  const before=state.data.records.slice();
  const f = new FormData(form),
    number = (key) => (f.get(key) === "" ? null : Number(f.get(key))),
    now = new Date().toISOString();
  let record = {
    ...editing,
    id: editing.id || uid(),
    createdAt: editing.createdAt || now,
    updatedAt: now,
    title: f.get("title").trim(),
    note: f.get("note").trim(),
    date: f.get("date"),
    time: f.get("time"),
    categoryId: f.get("categoryId"),
    location: f.get("location").trim(),
    tags: [
      ...new Set(
        f
          .get("tags")
          .split(/[,，]/)
          .map((x) => x.trim())
          .filter(Boolean),
      ),
    ],
    ...readFeeling(f,editing),
    duration: number("duration"),
    amount: number("amount"),
    weight: number("weight"),
    reflection: f.get("reflection"),
    status: "confirmed",
  };
  const visibility=f.get('visibility')||'self',kind=f.get('recordKind')||'diary';
  if(editing.id&& (visibility==='self'||kind==='diary'))await social.revokeLocal(record.id);
  record=savedMoment(record,kind==='diary'?'self':visibility);
  record.kind=kind;
  await db.saveRecord(record, state.data.categories);
  await protectOriginals([record]);
  if(!editing.id||editing.status!=="confirmed")beta.saved().catch(()=>{});
  await closeEditor(true);
  await autoReports(record.date);
  await changed();
  savedFeedback(before,[record]);
}
async function savePlan(form) {
  const f = new FormData(form),
    p = {
      ...editing,
      id: editing.id || uid(),
      title: f.get("title").trim(),
      date: f.get("date"),
      categoryId: f.get("categoryId"),
      reason: f.get("reason").trim(),
      order: editing.order ?? state.data.plans.length,
      createdAt: editing.createdAt || new Date().toISOString(),
    };
  if (!p.title || !validDate(p.date)) throw Error("请填写有效标题与日期");
  await db.put("plans", p);
  await closeEditor(true);
  await changed("计划已保存。");
}
function openImport() {
  const dialog = $("#import-dialog");
  dialog.innerHTML = `<div class="dialog-head"><h2 id="import-title">收集今天的片刻</h2>${button("close-import", "", "close", "button ghost icon-only", 'aria-label="关闭导入"')}</div><div class="dialog-body"><label class="field">这些照片属于哪一天？<input id="import-date" type="date" value="${state.date}" min="1900-01-01" max="2200-12-31" required></label><div class="import-zone" id="drop-zone">${icon("image", 37)}<h3>从相册选几张照片</h3><p>或把照片拖到这里<br>JPEG / PNG / WebP / GIF · 每张最多 20 MiB</p>${button("choose-photos", "选择照片", "plus", "button primary", 'style="margin-top:18px"')}</div><label class="row small muted"><input id="today-files" type="checkbox">仅导入文件修改日期为今天的照片</label><p class="small muted" style="margin-top:14px">文件修改日期不一定是拍摄日期。原图仅保存在浏览器；每批最多 300 张，相同文件内容自动去重。导入后请核对类别与日期。</p><div id="import-progress" role="status" aria-live="polite"></div></div>`;
  dialog.showModal();
}
async function importPhotos(files,{readFile=async file=>file,captureDates=false}={}) {
  if (state.busy) return;
  state.busy = true;
  const date = $("#import-date")?.value || state.date,
    todayOnly = $("#today-files")?.checked;
  const output = $("#import-progress");
  let success = 0,
    duplicates = 0;
  const messages = [];
  try {
    if (!validDate(date)) throw Error("请选择有效的记录日期");
    if (files.length > 300) throw Error("每批最多选择 300 张照片");
    const known = new Set(state.data.assets.map((a) => a.id));
    for (let i = 0; i < files.length; i++) {
      output.textContent = `正在本机处理 ${i + 1} / ${files.length}…`;
      try {
        const file = await readFile(files[i]);
        if (
          todayOnly &&
          localDate(new Date(file.lastModified)) !== localDate()
        ) {
          messages.push(`${file.name}：文件修改日期不是今天，已跳过`);
          continue;
        }
        const asset = await prepareImage(file);
        if (known.has(asset.id)) {
          duplicates++;
          continue;
        }
        let analysis = {
          method: "未识别 · 请手动整理",
          labels: [],
          ocr: "",
          categoryId: "other",
          note: "",
        };
        const now = new Date().toISOString(),
          record = {
            ...blankRecord(),
            id: uid(),
            date:captureDates&&file.captureTime?localDate(new Date(file.captureTime)):date,
            ...(captureDates&&file.captureTime?{time:new Date(file.captureTime).toTimeString().slice(0,5)}:{}),
            title:
              asset.name.replace(/\.[^.]+$/, "").slice(0, 200) || "未命名片刻",
            note: "",
            categoryId: state.data.categories.some(
              (c) => c.id === analysis.categoryId,
            )
              ? analysis.categoryId
              : "other",
            status: "review",
            source: "photo",
            assetId: asset.id,
            ...extractFields(analysis.ocr),
            location: asset.captureLocation || '',
            analysis,
            createdAt: now,
            updatedAt: now,
          };
        await db.saveRecord(record, state.data.categories, asset);
        known.add(asset.id);
        success++;
      } catch (e) {
        messages.push(errorText(e));
      }
    }
    await changed();
    output.innerHTML = `<div class="notice">已导入 ${success} 张，待审核 · 跳过重复 ${duplicates} 张${messages.length ? `<div class="import-log">${esc(messages.join("\n"))}</div>` : ""}</div>${button("finish-import", "查看素材库", "arrow", "button primary", 'style="margin-top:16px"')}`;
  } catch (e) {
    output.textContent = errorText(e);
  } finally {
    state.busy = false;
    $("#photo-input").value = "";
  }
}
async function saveSettings(patch) {
  await db.put("settings", { ...state.settings, ...patch });
  await refresh();
  render();
}
async function saveReport({ regenerate = false } = {}) {
  const r = views.reportData(state),
    text = regenerate
      ? makeReport(
          state.data.records,
          state.data.categories,
          state.period,
          state.reportDate,
          state.reportStyle,
        )
      : ($("#report-editor")?.value ?? r.text);
  if (!text.trim()) throw Error("报告不能为空");
  await db.put("reports", {
    id: r.id,
    userReviewedAt:new Date().toISOString(),
    source:regenerate?'auto':state.reportEditing||r.manual?'manual':'auto',
    preservedText:r.preservedText||'',
    period: state.period,
    ...r.range,
    style: state.reportStyle,
    text,
    generatedAt: regenerate
      ? new Date().toISOString()
      : r.saved?.generatedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    recordSignature:
      regenerate || !r.manual ? r.signature : r.saved.recordSignature,
  });
  reportDirty = false;
  state.reportEditing = false;
  await changed("报告已保存到本机。");
}
async function discardReport() {
  if (
    reportDirty &&
    !(await confirmAction("放弃报告修改？", "这些文字尚未保存，切换后会丢失。"))
  )
    return false;
  reportDirty = false;
  state.reportEditing = false;
  return true;
}
function download(blob, name) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
async function reorder(id, delta, target) {
  const list = state.data.plans
      .filter((p) => p.horizon === state.horizon)
      .sort((a, b) => a.order - b.order),
    index = list.findIndex((p) => p.id === id),
    to = target ? list.findIndex((p) => p.id === target) : index + delta;
  if (index < 0 || to < 0 || to >= list.length || to === index) return;
  list.splice(to, 0, list.splice(index, 1)[0]);
  await db.putMany(
    "plans",
    list.map((p, i) => ({ ...p, order: i })),
  );
  await changed();
}
function showReminder() {
  const b = $("#reminder-banner");
  b.innerHTML = `<div class="row between"><h3>${icon("moon", 18)} 给今天留一点记录</h3>${button("dismiss-reminder", "", "close", "button ghost icon-only", 'aria-label="关闭提醒"')}</div><p>挑几张照片，写一句今天的感受。你的生活，值得被记住。</p>${button("reminder-import", "选择今天的照片", "image", "button primary")}`;
  b.hidden = false;
}
async function tick() {
  if(!workspaceReady||!social.canUseLocal)return;
  if (
    reminderRunning ||
    document.visibilityState !== "visible" ||
    state.busy ||
    !reminderDue(state.settings)
  )
    return;
  reminderRunning = true;
  try {
    const latest =
      (await db.readAll()).settings.find((s) => s.id === "main") ||
      DEFAULT_SETTINGS;
    if (!reminderDue(latest)) return;
    state.settings = { ...latest, lastReminderDate: localDate() };
    await db.put("settings", state.settings);
    showReminder();
    if ("Notification" in window && Notification.permission === "granted") {
      try {
        new Notification("拾日 · 晚间收集", {
          body: "给今天留一点记录，打开拾日选择照片。",
        });
      } catch {
        /* Mobile may only support service-worker notifications. In-page reminder remains. */
      }
    }
  } catch (e) {
    toast(errorText(e));
  } finally {
    reminderRunning = false;
  }
}
async function importLegacy() {
  let payload;
  try {
    payload = JSON.parse(localStorage.getItem("fitness-diary:v1") || "null");
  } catch {
    throw Error("旧版数据无法解析，原数据未改动");
  }
  if (!payload?.days?.length) {
    toast("这个浏览器里没有找到旧版健身记录。");
    return;
  }
  if (
    !(await confirmAction(
      "导入旧版健身记录？",
      `发现 ${payload.days.length} 天记录。将转换为健身分类，原始数据保留。`,
    ))
  )
    return;
  const records = [];
  for (const day of payload.days) {
    if (!validDate(day.date)) continue;
    for (const session of day.sessions || []) {
      const id = `legacy-${day.date}-${session.id}`,
        record = {
          ...blankRecord(),
          id,
          date: day.date,
          time: "12:00",
          title: `健身记录 · ${{ strength: "力量训练", cardio: "有氧", sport: "运动", rest: "休息", other: "其他活动" }[session.kind] || "活动"}`,
          note: [day.note, day.foodNote, session.note]
            .filter(Boolean)
            .join("\n"),
          categoryId: "fitness",
          duration: session.minutes ?? null,
          weight: day.weightKg ?? null,
          source: "legacy",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      if (!state.data.records.some((r) => r.id === id)) records.push(record);
    }
  }
  for (const record of records) {
    const { validateRecord } = await import("./src/core.mjs");
    validateRecord(record, state.data.categories);
  }
  await db.putMany("records", records);
  await changed(`导入 ${records.length} 条旧记录；原数据仍然保留。`);
}
const actions = {
  'calendar-toggle':()=>{state.calendarOpen=!state.calendarOpen;state.calendarMonth=state.date.slice(0,7);render();if(state.calendarOpen)document.querySelector('.life-calendar')?.scrollIntoView({block:'start'});},
  'calendar-shift':el=>{state.calendarMonth=shiftMonth(state.calendarMonth,Number(el.dataset.offset));state.date=state.calendarMonth+'-01';state.calendarLimit=20;render();},
  'calendar-day':el=>{state.date=el.dataset.date;state.calendarLimit=20;render();},
  'calendar-more':()=>{state.calendarLimit+=20;render();},
  'recall-more':()=>{state.recallLimit+=24;render();},
  'daily-feeling':()=>{releaseEditor();$('#editor-dialog').innerHTML=views.dailyFeelingForm(state);$('#editor-dialog').showModal();},
  'daily-preset':el=>{
    const form=el.form||el.closest('form'),word=el.dataset.word,group=EMOTION_GROUPS.find(g=>g.words.includes(word)).id;
    form.elements.emotionGroup.value=group;form.elements.emotion.innerHTML=views.emotionWordOptions(group,word);
    form.querySelector('[data-feeling-words]').hidden=false;form.querySelector('[data-feeling-custom]').hidden=true;
    form.elements.dailyEmoji.value=el.dataset.emoji;for(const b of form.querySelectorAll('[data-word]'))b.setAttribute('aria-pressed',String(b===el));editorDirty=true;
  },
  'clear-daily-feeling':async()=>{await db.remove('settings',DAILY_PREFIX+state.date);await closeEditor(true);await refresh();render();toast('这一天的感受已清除，片刻心情保留。');},
  'batch-mode':()=>{state.batchMode=!state.batchMode;state.batchSelected.clear();render();},
  'excluded-view':()=>{state.showExcluded=!state.showExcluded;state.batchSelected.clear();state.libraryLimit=80;render();},
  'library-more':()=>{state.libraryLimit+=80;render();},
  'batch-select':el=>{
    const id=el.dataset.id;state.batchSelected.has(id)?state.batchSelected.delete(id):state.batchSelected.add(id);
    el.setAttribute('aria-pressed',String(state.batchSelected.has(id)));el.classList.toggle('selected',state.batchSelected.has(id));
    const counter=$('#batch-count');if(counter)counter.textContent=`已选 ${state.batchSelected.size} 张`;
    const save=document.querySelector('[data-action="batch-confirm"]');if(save){save.disabled=!state.batchSelected.size;save.textContent=`保存 ${state.batchSelected.size} 个片刻`;}
    const mark=el.querySelector('.selection-mark');if(mark)mark.innerHTML=state.batchSelected.has(id)?icon('check',16):'';
  },
  'batch-all':()=>{const rows=views.reviewCandidates(state);const ids=rows.map(r=>r.id);const all=ids.every(id=>state.batchSelected.has(id));state.batchSelected=all?new Set():new Set(ids);render();},
  'batch-exclude':async()=>{
    if(state.busy)return;const ids=[...state.batchSelected];if(!ids.length)return toast('请先选择照片');
    const data=await db.readAll(),plan=removalPlan(data.records,ids);
    if(!plan.candidates.length)return toast('所选照片已不在待审核列表。');
    const native=window.shiriNative?.photos;
    const supported=await native?.originalsCapabilities?.().catch(()=>({supported:false}));
    const mode=await chooseRemoval(plan.candidates.length,!!supported?.supported&&!plan.blocked.length);if(!mode)return;
    state.busy=true;if(mode==='originals')toast('正在核验所选原图，请稍后在 Android 系统窗口确认。');
    try{
      const fresh=await db.readAll(),result=await removeCandidates({records:fresh.records,ids,mode,native,persist:rows=>db.saveReviewBatch(rows,fresh.categories)});
      if(result.cancelled){toast('已取消系统删除，待审核照片保留。');return;}
      state.excludedUndo=result.rows.map(r=>r.id);for(const r of result.rows)state.batchSelected.delete(r.id);
      await changed(mode==='exclude'?`已排除 ${result.rows.length} 张，系统原图保留，可撤销。`:`系统确认删除 ${result.rows.length} 张原图；${result.failed.length?result.failed.length+' 张未完成，仍保留待审核，可重试或仅排除。':'本机候选副本保留，可恢复审核；原图无法通过撤销恢复。'}`);
    }finally{state.busy=false;}
  },
  'batch-undo':async()=>{
    if(state.busy)return;
    const ids=state.excludedUndo;await db.saveReviewBatch(reviewBatch(state.data.records,ids,'restore').filter(r=>ids.includes(r.id)),state.data.categories);state.excludedUndo=[];await changed('已撤销排除。');
  },
  'batch-restore':async()=>{
    if(state.busy)return;
    const ids=[...state.batchSelected];if(!ids.length)return toast('请先选择照片');
    await db.saveReviewBatch(reviewBatch(state.data.records,ids,'restore').filter(r=>ids.includes(r.id)),state.data.categories);state.batchSelected.clear();await changed('已恢复到待审核列表。');
  },
  'review-today':()=>{state.search='';state.filterCategory='all';state.libraryLimit=80;state.reviewDate=state.date;state.filterStatus='review';state.showExcluded=false;state.batchMode=true;state.batchSelected.clear();location.hash='library';render();},
  'review-all-dates':()=>{state.reviewDate=null;state.batchSelected.clear();render();},
  'journey-report':()=>{state.reportDate=state.date;state.period='day';location.hash='reports';render();},
  'batch-confirm':async()=>{
    if(state.busy)return;
    const before=state.data.records.slice();
    const ids=[...state.batchSelected];if(!ids.length)return toast('请先选择照片');
    const rows=reviewBatch(state.data.records,ids,'confirm').filter(r=>ids.includes(r.id)&&r.status==='confirmed'&&!r.excluded);
    await db.saveReviewBatch(rows,state.data.categories);await protectOriginals(rows);beta.saved(rows.length).catch(()=>{});state.batchSelected.clear();
    for(const date of new Set(rows.map(r=>r.date)))await autoReports(date);
    await changed();if(rows.length)savedFeedback(before,rows);
  },
  'beta-clear':async()=>{await beta.clear();render();toast('本机统计已清除。');},
  'photo-location':async()=>{
    const current=editing,field=$('#record-form [name="location"]');if(!current?.id?.startsWith('native:')||!field)return;
    const before=field.value;
    const gps=await window.shiriNative?.photos?.location({id:current.id.slice(7),requestPermission:true});
    if(editing!==current||!field.isConnected||field.value!==before)return;
    const location=coordinateLabel(gps);if(location){field.value=location;editing.location=location;editorDirty=true;toast('已读取照片拍摄坐标，仅用于本机记录。');}
    else toast(gps?.denied?'未授权媒体位置，仍可手动填写并保存。':'照片没有可读取的 GPS；可手动填写地点。');
  },
  note: () => openRecord(),
  'new-category':()=>openCategoryForm(),
  'edit-category':el=>openCategoryForm(el.dataset.id),
  'delete-category':async el=>{
    const category=state.data.categories.find(c=>c.id===el.dataset.id);
    if(!categoryCanDelete(category,state.data))return toast('这个分类仍有关联记录或计划，请先调整分类；原记录会保留。');
    if(!await confirmAction('删除分类？','只删除这个空分类，不删除任何片刻或照片。'))return;
    await db.deleteCategory(category.id);await closeEditor(true);state.categoryFocus='all';await changed('分类已删除。');
  },
  import: openImport,
  "edit-record": (el) => openRecord(el.dataset.id),
  "close-editor": () => closeEditor(),
  "prev-day": () => {
    state.date = addDays(state.date, -1);
    state.calendarMonth=state.date.slice(0,7);state.calendarLimit=20;
    render();
  },
  "next-day": () => {
    state.date = addDays(state.date, 1);
    state.calendarMonth=state.date.slice(0,7);state.calendarLimit=20;
    render();
  },
  today: () => {
    state.date = localDate();
    state.calendarMonth=state.date.slice(0,7);state.calendarLimit=20;
    render();
  },
  'retry-cloud-sync':async()=>{
    await social.syncNow();await refresh();render();
    const queued=state.data.records.filter(r=>r.kind==='moment'&&r.visibility==='friends'&&r.cloudSync?.state==='pending');
    toast(queued.length?'仍有 '+queued.length+' 条待同步，点开片刻查看原因；也可在好友页确认登录状态。':'重试完成，可查看片刻同步状态。');
  },
  "select-day": (el) => {
    state.date = el.dataset.date;
    state.calendarMonth=state.date.slice(0,7);state.calendarLimit=20;
    render();
  },
  "open-category": (el) => { state.categoryFocus = el.dataset.id; render(); },
  "library-status": (el) => { state.filterStatus = el.dataset.id;state.batchSelected.clear();state.libraryLimit=80; render(); },
  "review-category": (el) => {
    state.reviewDate=null;
    state.filterCategory=el.dataset.id; state.filterStatus='review'; state.search='';
    location.hash='library'; if(state.view==='library')render();
  },
  "filter-cat": (el) => {
    state.filterCategory = el.dataset.id;
    render();
  },
  "choose-photos": async () => {
    if(state.busy)return;
    const native=window.shiriNative;
    if(!native?.pickPhotos){$("#photo-input").click();return;}
    let picked;const selectedSpace=spaceId();
    state.busy=true;
    try{
      picked=await native.pickPhotos();
      state.busy=false;
      if(picked.cancelled)return;
      if(!social.canUseLocal||spaceId()!==selectedSpace)throw Error('账号已改变，请在当前账号重新选择照片。');
      // A deliberately changed date wins; otherwise use actual PhotoKit capture
      // dates when available, never the phone's current location or a guessed date.
      await importPhotos(picked.photos||[],{readFile:native.readPickedPhoto,captureDates:$('#import-date').value===state.date});
      if(picked.failedCount)toast(`${picked.failedCount} 张照片未能读取，请在相册下载原件后重试；其余照片请在素材库审核。`);
      else if(picked.photos?.some(p=>p.converted))toast('部分照片已生成 JPEG 导入副本，系统相册原图保持不变。');
    }finally{
      state.busy=false;
      if(picked?.selectionId)await native.releasePickedPhotos(picked.selectionId).catch(()=>{});
    }
  },
  "close-import": () => {
    if (state.busy) {
      toast("照片仍在本机处理中，请稍候。");
      return;
    }
    $("#import-dialog").close();
  },
  "finish-import": () => {
    state.reviewDate=null;
    $("#import-dialog").close();
    state.filterCategory = "all";
    state.filterStatus = "all";
    state.search = "";
    location.hash = "library";
    if (state.view === "library") render();
  },
  "extract-fields": () => {
    const form = $("#record-form"),
      text = form.elements.note.value,
      fields = extractFields(text),
      suggestion = suggestCategory(
        form.elements.title.value + " " + text,
        state.data.learning,
      );
    let n = 0;
    for (const [key, value] of Object.entries(fields)) {
      if (!form.elements[key].value) {
        form.elements[key].value = String(value);
        n++;
      }
    }
    if (suggestion.categoryId !== "other") {
      form.elements.categoryId.value = suggestion.categoryId;
      n++;
    }
    editorDirty = true;
    toast(
      n
        ? "已填入文字中的明确字段与分类建议，请核对后保存。"
        : "没有找到明确字段，可直接填写。",
    );
  },
  "delete-record": async () => {
    if (
      !(await confirmAction(
        "删除这个片刻？",
        "删除拾日内的记录和副本，手机系统相册原图保留。云端同步内容将撤销；离线时撤销任务等待联网完成。",
        { danger: true },
      ))
    )
      return;
    await privateCloud.remove(editing);
    await db.deleteRecord(editing);
    await closeEditor(true);
    await changed("片刻已删除。");
  },
  "analyze-record": async () => {
    if (
      editorDirty &&
      !(await confirmAction(
        "重新识别这张照片？",
        "当前未保存的编辑将被替换，请先保存重要修改。",
      ))
    )
      return;
    const asset = state.data.assets.find((a) => a.id === editing.assetId);
    if (!state.settings.aiEnabled && !state.settings.ocrEnabled)
      throw Error("请先在设置中启用本地模型并完成部署");
    const result = await analyzeImage(
      asset,
      state.settings,
      state.data.learning,
      toast,
    );
    editing = {
      ...editing,
      analysis: result,
      categoryId: state.data.categories.some((c) => c.id === result.categoryId)
        ? result.categoryId
        : editing.categoryId,
      note: editing.note,
    };
    $("#editor-dialog").innerHTML = views.recordForm(state, editing, editorURL);
    editorDirty = true;
  },
  period: async (el) => {
    if (!(await discardReport())) return;
    state.period = el.dataset.id;
    render();
  },
  "save-report": () => saveReport(),
  "edit-report": async () => {
    if (state.reportEditing) {
      if (!(await discardReport())) return;
    } else state.reportEditing = true;
    render();
  },
  "regenerate-report": async () => {
    if (
      (views.reportData(state).saved || reportDirty) &&
      !(await confirmAction(
        "重新生成这份报告？",
        "会用当前记录替换此周期、此风格的已保存报告与未保存修改。",
      ))
    )
      return;
    await saveReport({ regenerate: true });
  },
  "copy-report": async () => {
    const text = $("#report-editor")?.value ?? views.reportData(state).text;
    try {
      await navigator.clipboard.writeText(text);
      toast("报告全文已复制。");
    } catch {
      state.reportEditing = true;
      render();
      $("#report-editor").value = text;
      $("#report-editor").select();
      toast("浏览器未开放剪贴板权限，已选中文字，请手动复制。");
    }
  },
  "download-report": () => {
    const r = views.reportData(state);
    download(
      new Blob([$("#report-editor")?.value ?? r.text], {
        type: "text/markdown;charset=utf-8",
      }),
      `拾日-${state.period}-${r.range.start}.md`,
    );
    toast("Markdown 文件已准备下载。");
  },
  horizon: (el) => {
    state.horizon = el.dataset.id;
    state.planning=null;
    render();
  },
  "new-plan": () => openPlan(),
  "edit-plan": (el) => openPlan(el.dataset.id),
  "suggest-plans": () => {
    state.planning=planningReview(state.data.records,state.data.categories,state.horizon,localDate(),state.data.plans);render();
  },
  "adopt-suggestion": async el=>{
    const p=state.planning?.suggestions.find(p=>p.key===el.dataset.key);if(!p)return;
    if(state.data.plans.some(old=>old.suggestionKey===p.key))return;
    await db.put('plans',{...p,suggestionKey:p.key,id:uid(),order:state.data.plans.length,createdAt:new Date().toISOString()});await changed('已加入计划，随时可以编辑。');
  },
  "edit-suggestion": el=>{const p=state.planning?.suggestions.find(p=>p.key===el.dataset.key);if(p)openPlan(null,p);},
  "ignore-suggestion": async el=>{
    const old=state.data.settings.find(r=>r.id==='planning-dismissed')?.keys||[];
    await db.put('settings',{id:'planning-dismissed',keys:[...new Set([...old,el.dataset.key])].slice(-100)});await changed('已忽略，不会加入计划。');
  },
  guide:()=>{state.guideOpen=true;if(state.view!=='settings')location.hash='settings';else render();requestAnimationFrame(()=>document.querySelector('#usage-guide')?.scrollIntoView({block:'start'}));},
  "assistant-toggle":()=>{state.assistantMode="chat";state.assistantOpen=!state.assistantOpen;render();},
  "assistant-plan":()=>{state.assistantOpen=true;state.assistantMode="plan";state.assistantQuestion="请根据我授权的记录和目标给出下一周的具体建议";state.assistantConsent=false;render();},
  "assistant-clear":()=>{chatLayout.reset();state.assistantPendingId=null;state.assistantContextStart=0;state.assistantBusy=false;state.assistantHistory=[];state.assistantSelected=[];state.assistantQuestion='';state.assistantGoals='';state.assistantConsent=false;state.assistantAnswer='';state.assistantError='';assistant.clear();render();},
  "delete-plan": async (el) => {
    if (
      !(await confirmAction("删除这条计划？", "不影响其他计划和生活记录。", {
        danger: true,
      }))
    )
      return;
    await db.remove("plans", el.dataset.id);
    await changed("计划已删除。");
  },
  "plan-up": (el) => reorder(el.dataset.id, -1),
  "plan-down": (el) => reorder(el.dataset.id, 1),
  "test-reminder": showReminder,
  "dismiss-reminder": () => ($("#reminder-banner").hidden = true),
  "reminder-import": () => {
    $("#reminder-banner").hidden = true;
    openImport();
  },
  notification: async () => {
    if (!("Notification" in window))
      throw Error("此浏览器不支持系统通知，网页内提醒仍可使用");
    const permission = await Notification.requestPermission();
    toast(
      permission === "granted"
        ? "通知已授权；后台执行仍由浏览器决定。"
        : "通知未授权，保留网页内提醒。",
    );
  },
  "check-models": async () => {
    state.modelStatus = await checkModels();
    render();
  },
  "export-backup": async () => {
    const blob = await exportBackup(await db.readAll());
    download(blob, `拾日-完整备份-${localDate()}.zip`);
    toast("完整备份已准备下载，请保存在安全位置。");
  },
  "restore-backup": () => $("#backup-input").click(),
  persist: async () => {
    if (!navigator.storage?.persist)
      throw Error("浏览器不支持持久存储申请，请定期备份");
    toast(
      (await navigator.storage.persist())
        ? "浏览器已授予持久存储，仍建议定期备份。"
        : "浏览器尚未授予持久存储，请定期导出备份。",
    );
  },
  "clear-data": async () => {
    if (
      !(await confirmAction(
        "清空全部生活数据？",
        "原图、笔记、报告、规划和设置将永久删除。请先导出完整备份。",
        { danger: true, typed: true },
      ))
    )
      return;
    await collector.clear();
    await privateCloud.clear();
    await social.clearRemote();
    await beta.consent(false);
    await db.clearEverything();
    $("#reminder-banner").hidden = true;
    await changed("已清空生活空间并恢复默认设置。");
  },
  "import-legacy": importLegacy,
};
document.addEventListener("click", async (e) => {
  if (e.target.closest(".skip-link")) {
    e.preventDefault();
    $("#main").focus();
    return;
  }
  const el = e.target.closest("[data-action]");
  if (!el || !actions[el.dataset.action]) return;
  e.preventDefault();
  if(state.busy&&['batch-confirm','batch-exclude','batch-restore','batch-undo','edit-record','note'].includes(el.dataset.action))return;
  if (el.disabled || (!workspaceReady||!social.canUseLocal)&&el.dataset.action!=="reload") return;
  el.disabled = true;
  try {
    await actions[el.dataset.action](el);
  } catch (error) {
    const target = $("#editor-dialog").open ? $("#editor-error") : null;
    if (target) target.textContent = errorText(error);
    else toast(errorText(error));
  } finally {
    el.disabled = false;
  }
});
document.addEventListener('submit',async e=>{
  if(e.target.id!=='assistant-form')return;e.preventDefault();if(!workspaceReady||!social.canUseLocal||state.assistantBusy)return;
  const f=new FormData(e.target),question=String(f.get('question')||'').trim();
  state.assistantGoals=String(f.get('goals')||'');state.assistantConsent=f.get('consent')==='on';
  if(!state.assistantConsent||!question){state.assistantError=!state.assistantConsent?'请先阅读并同意本次数据处理方式。':'请先输入问题。';render();return;}
  const turn=beginTurn(state,question),payload={question,records:assistantContext(state.data.records,state.assistantSelected,localDate()),consent:true,history:turn.history,mode:state.assistantMode,goals:state.assistantGoals};
  render();chatLayout.forceLatest();
  try{const answer=await assistant.ask(payload);if(finishTurn(state,turn.id,{answer})){state.assistantConsent=false;render();}}
  catch(error){if(finishTurn(state,turn.id,{error:error?.message||'AI 回复未完成，请稍后重试。'})){state.assistantConsent=false;render();}}
});
document.addEventListener("submit", async (e) => {
  if (!["record-form", "plan-form", "category-form", "daily-feeling-form"].includes(e.target.id))
    return;
  e.preventDefault();
  if(!workspaceReady||!social.canUseLocal)return;
  const form = e.target,
    submit = form.querySelector("[type=submit]");
  submit.disabled = true;
  try {
    if (form.id === "record-form") await saveRecord(form);
    if (form.id === "plan-form") await savePlan(form);
    if(form.id==='daily-feeling-form'){
      const values=new FormData(form),feeling=readFeeling(values),row=makeDailyFeeling(state.date,feeling.emotion,values.get('dailyEmoji'));
      if(row)await db.put('settings',row);else await db.remove('settings',DAILY_PREFIX+state.date);
      await closeEditor(true);await refresh();render();toast(row?'这一天的感受已留在本机。':'这一天的感受已清除。');
    }
    if (form.id === "category-form") {
      const name = new FormData(form).get("name").trim(),id=form.dataset.id;
      const existing=id?state.data.categories.find(c=>c.id===id&&c.builtIn===false):null;
      if(id&&!existing)throw Error('这个分类不能修改');
      if (!name || name.length>30 || /[\x00-\x1f\x7f]/.test(name) || state.data.categories.some((c) => c.id!==id&&c.name === name))
        throw Error("请输入新的分类名称");
      await db.put("categories", {
        ...existing,
        id: existing?.id||uid(),
        name,
        color: existing?.color||"#a6b8a0",
        icon: existing?.icon||"layers",
        builtIn: false,
      });
      await closeEditor(true);await changed(existing?'分类名称已更新。':"新分类已添加。");
    }
  } catch (error) {
    const target = form.querySelector(".form-error");
    if (target) target.textContent = errorText(error);
    else toast(errorText(error));
  } finally {
    submit.disabled = false;
  }
});
document.addEventListener("input", (e) => {
  if(e.target.closest("#assistant-form")&&e.target.name==="goals")state.assistantGoals=e.target.value;
  if(e.target.closest("#assistant-form")&&e.target.name==="question")state.assistantQuestion=e.target.value;
  if (e.target.closest("#editor-dialog")) editorDirty = true;
  if (e.target.id === "report-editor") reportDirty = true;
  if (e.target.id === "library-search") {
    state.search = e.target.value;
    const position = e.target.selectionStart;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      render();
      const input = $("#library-search");
      if (input) {
        input.focus();
        input.setSelectionRange(position, position);
      }
    }, 180);
  }
});
document.addEventListener("change", async (e) => {
  if(!workspaceReady||!social.canUseLocal)return;
  const el = e.target;
  if(el.name==='emotionGroup'&&el.closest('#record-form,#daily-feeling-form')){
    const form=el.form,group=el.value,words=form.querySelector('[data-feeling-words]'),custom=form.querySelector('[data-feeling-custom]');
    editorDirty=true;words.hidden=['none','legacy','custom'].includes(group);custom.hidden=group!=='custom';
    form.elements.emotion.innerHTML=views.emotionWordOptions(group);
    form.elements.emotion.required=!words.hidden;form.elements.customEmotion.required=!custom.hidden;
    if(!words.hidden)form.elements.emotion.focus();if(!custom.hidden)form.elements.customEmotion.focus();return;
  }
  if(el.name==='emotion'&&el.closest('#daily-feeling-form')){el.form.elements.dailyEmoji.value=emotionEmoji(el.value);return;}
  if(['calendar-year','calendar-month'].includes(el.id)){
    const month=String($('#calendar-year').value).padStart(4,'0')+'-'+$('#calendar-month').value;
    if(!validDate(month+'-01'))return toast('请选择 1900–2200 年的有效月份');
    state.calendarMonth=month;state.date=month+'-01';state.calendarLimit=20;render();return;
  }
  if(el.name==="consent"&&el.closest("#assistant-form")){state.assistantConsent=el.checked;return;}
  if(el.dataset.assistantRecord){
    if(state.assistantBusy)return;
    const selected=new Set(state.assistantSelected);if(el.checked)selected.add(el.dataset.assistantRecord);else selected.delete(el.dataset.assistantRecord);
    if(selected.size>20){el.checked=false;toast("每次最多选择 20 条片刻。");return;}
    changeContext(state);assistant.clear();
    state.assistantSelected=[...selected];state.assistantConsent=false;render();document.querySelector(".chat-context")?.setAttribute("open","");document.querySelector(".assistant-records")?.setAttribute("open","");return;
  }
  try {
    if(el.id==='beta-consent'){
      const enabled=el.checked;
      if(enabled&&!await confirmAction('参与内测统计',beta.snapshot.configured?'仅发送上述操作次数与日期到拾日腾讯云服务，不包含生活内容。可随时关闭。':'当前仅在本机保存上述操作次数与日期，不上传。可随时关闭，云端接通前另行征求同意。')){el.checked=false;return;}
      await beta.consent(enabled,state.data.records.some(r=>r.status==='confirmed'));render();return;
    }
    if (el.dataset.setting) {
      await saveSettings({ [el.dataset.setting]: el.checked });
      return;
    }
    if (el.dataset.planCheck) {
      await db.put("plans", {
        ...state.data.plans.find((p) => p.id === el.dataset.planCheck),
        done: el.checked,
      });
      await changed();
      return;
    }
    switch (el.id) {
      case "trend-mode":
        state.trendMode = el.value;
        render();
        break;
      case "dashboard-date":
        if (validDate(el.value)) {
          state.date = el.value;
          state.calendarMonth=state.date.slice(0,7);state.calendarOpen=true;state.calendarLimit=20;
          render();
        }
        break;
      case "category-filter":
        state.filterCategory = el.value;
        render();
        break;
      case "status-filter":
        state.filterStatus = el.value;
        render();
        break;
      case "report-date":
        if (validDate(el.value) && (await discardReport())) {
          state.reportDate = el.value;
          render();
        } else el.value = state.reportDate;
        break;
      case "report-style":
        if (await discardReport()) {
          state.reportStyle = el.value;
          render();
        } else el.value = state.reportStyle;
        break;
      case "reminder-time":
        if (el.validity.valid && el.value)
          await saveSettings({ reminderTime: el.value });
        break;
      case "default-style":
        state.reportStyle = el.value;
        await saveSettings({ reportStyle: el.value });
        break;
      case "theme-select":
        await saveSettings({ theme: el.value });
        break;
      case "photo-input":
        await importPhotos(Array.from(el.files));
        break;
      case "backup-input":
        if (el.files[0]) {
          const tables = await parseBackup(el.files[0]);
          db.validateBackupTables(tables);
          if (
            await confirmAction(
              "恢复本地备份？",
              `将合并 ${tables.records.length} 条记录、${tables.assets.length} 张图片及报告规划。同 ID 保留本机内容，本机设置不覆盖。`,
            )
          ) {
            await db.restoreBackup(tables);
            await changed("备份已成功合并。");
          }
        }
        el.value = "";
        break;
    }
  } catch (error) {
    toast(errorText(error));
    if (el.id === "backup-input") el.value = "";
    if (el.dataset.setting) {
      await refresh();
      render();
    }
  }
});
$("#editor-dialog").addEventListener("cancel", (e) => {
  e.preventDefault();
  closeEditor();
});
$("#import-dialog").addEventListener("cancel", (e) => {
  if (state.busy) {
    e.preventDefault();
    toast("照片仍在本机处理中。");
  }
});
window.addEventListener("beforeunload", (e) => {
  if (editorDirty || reportDirty || state.busy) {
    e.preventDefault();
    e.returnValue = "";
  }
});
window.addEventListener("hashchange", async () => {
  const next = location.hash.slice(1) || "dashboard";
  if (!validViews.includes(next)) {
    location.replace("#dashboard");
    return;
  }
  if (state.view === next) return;
  if (!(await discardReport())) {
    history.replaceState(null, "", `#${state.view}`);
    return;
  }
  if(state.view==='friends')social.leave();
  if(next!=="library")state.reviewDate=null;
  state.view = next;
  render();
  if(next==='friends')social.scheduleSync();
  window.scrollTo(0, 0);
  $("#main").focus({ preventScroll: true });
});
document.addEventListener("dragstart", (e) => {
  const item = e.target.closest("[data-plan-id]");
  if (item) {
    dragId = item.dataset.planId;
    e.dataTransfer.setData("text/plain", dragId);
    e.dataTransfer.effectAllowed = "move";
    item.classList.add("dragging");
  }
});
document.addEventListener("dragend", () => {
  dragId = "";
  document
    .querySelectorAll(".dragging,.drop-target")
    .forEach((el) => el.classList.remove("dragging", "drop-target"));
});
document.addEventListener("dragover", (e) => {
  const drop = e.target.closest("#drop-zone,[data-plan-id]");
  if (drop) {
    e.preventDefault();
    drop.classList.add(drop.id === "drop-zone" ? "drag-over" : "drop-target");
  }
});
document.addEventListener("dragleave", (e) => {
  const drop = e.target.closest("#drop-zone,[data-plan-id]");
  if (drop) drop.classList.remove("drag-over", "drop-target");
});
document.addEventListener("drop", async (e) => {
  if(!workspaceReady||!social.canUseLocal)return;
  const drop = e.target.closest("#drop-zone,[data-plan-id]");
  if (!drop) return;
  e.preventDefault();
  drop.classList.remove("drag-over", "drop-target");
  try {
    if (drop.id === "drop-zone")
      await importPhotos(Array.from(e.dataTransfer.files));
    else if (dragId) await reorder(dragId, 0, drop.dataset.planId);
  } catch (error) {
    toast(errorText(error));
  }
});
window.addEventListener("database-version-change", () =>
  toast("数据库版本已更新，请刷新页面后继续。"),
);
document.addEventListener("visibilitychange", tick);
window.addEventListener('storage',event=>{if(['shiri-space-owner','shiri-social-session'].includes(event.key))location.reload();});
async function start() {
  try {
    const route = location.hash.slice(1);
    state.view = validViews.includes(route) ? route : "dashboard";
    render();
    await social.start();
    if ("serviceWorker" in navigator && window.isSecureContext)
      navigator.serviceWorker.register("./sw.js").catch(() => {});
  } catch (error) {
    $("#main").innerHTML =
      `<div class="empty-page"><h1>暂时无法打开本地存储</h1><p>${esc(errorText(error))}</p><p>请使用正常浏览模式，允许站点存储，然后刷新页面。</p><button class="button" data-action="reload">重新加载</button></div>`;
    actions.reload = () => location.reload();
  }
}
start();
