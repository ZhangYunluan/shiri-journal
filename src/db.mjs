import {
  DEFAULT_CATEGORIES,
  DEFAULT_SETTINGS,
  validateRecord,
  validDate,
} from "./core.mjs";
import {databaseName} from './space.mjs';
import {displayCategory,categoryCanDelete} from './life-expression.mjs';
import {validatePrivateSetting} from './life-calendar.mjs';
export const STORE_NAMES = [
  "records",
  "assets",
  "categories",
  "reports",
  "plans",
  "learning",
  "settings",
];
let connection;
let connectedName;
export async function openDB() {
  const requestedName=databaseName();
  if(connection&&connectedName!==requestedName)throw Error('账号空间已改变，请刷新后继续');
  if (connection) return connection;
  connectedName=requestedName;
  connection = await new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName(), 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of STORE_NAMES) {
        const store = db.createObjectStore(name, { keyPath: "id" });
        if (name === "records")
          for (const index of ["date", "categoryId", "assetId"])
            store.createIndex(index, index);
        if (name === "plans") store.createIndex("date", "date");
        if (name === "learning") store.createIndex("categoryId", "categoryId");
      }
      for (const c of DEFAULT_CATEGORIES)
        request.transaction.objectStore("categories").put(c);
      request.transaction.objectStore("settings").put(DEFAULT_SETTINGS);
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => {
        request.result.close();
        connection = null;
        window.dispatchEvent(new Event("database-version-change"));
      };
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(Error("数据库被其他标签页占用，请关闭其他拾日页面后重试"));
  });
  return connection;
}
export async function readAll() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAMES, "readonly"),
      result = {};
    for (const name of STORE_NAMES) {
      const r = tx.objectStore(name).getAll();
      r.onsuccess = () => {
        result[name] = r.result;
      };
    }
    tx.oncomplete = () => {result.categories=result.categories.map(displayCategory);resolve(result);};
    tx.onabort = () => reject(tx.error || Error("读取失败"));
  });
}
// Queue all requests synchronously: awaiting unrelated work inside a transaction can close it.
export async function transaction(names, work) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(names, "readwrite");
    tx.oncomplete = resolve;
    tx.onabort = () => reject(tx.error || Error("本地保存失败"));
    tx.onerror = () => {};
    try {
      work(tx);
    } catch (e) {
      tx.abort();
      reject(e);
    }
  });
}
export const put = (name, value) =>
  transaction([name], (tx) => tx.objectStore(name).put(value));
export const putMany = (name, values) =>
  transaction([name], (tx) =>
    values.forEach((value) => tx.objectStore(name).put(value)),
  );
export const remove = (name, id) =>
  transaction([name], (tx) => tx.objectStore(name).delete(id));
// One transaction prevents another tab inserting a reference during a deletion check.
export async function deleteCategory(id){
 const database=await openDB();
 return new Promise((resolve,reject)=>{
  const tx=database.transaction(['categories','records','plans','learning'],'readwrite'),data={};let pending=4,reason='';
  tx.oncomplete=resolve;tx.onerror=()=>{};tx.onabort=()=>reject(Error(reason||'分类未删除，请重试'));
  for(const name of ['categories','records','plans','learning']){
   const request=tx.objectStore(name).getAll();request.onsuccess=()=>{
    data[name]=request.result;if(--pending)return;
    if(!categoryCanDelete(data.categories.find(c=>c.id===id),data)){reason='分类仍有关联记录或计划，请先调整分类；原记录已保留。';tx.abort();return;}
    tx.objectStore('categories').delete(id);
   };
  }
 });
}
export async function get(name,id){
  const db=await openDB();return new Promise((resolve,reject)=>{const r=db.transaction(name).objectStore(name).get(id);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
}
export async function patchSync(id,revision,patch){
  await transaction(['records'],tx=>{const store=tx.objectStore('records'),r=store.get(id);r.onsuccess=()=>{if(r.result?.cloudSync?.revision===revision)store.put({...r.result,cloudSync:{...r.result.cloudSync,...patch}});};});
}
export async function editRevocations(id,add=true){
  await transaction(['settings'],tx=>{const store=tx.objectStore('settings'),r=store.get('moment-revocations');r.onsuccess=()=>{const ids=new Set(r.result?.ids||[]);add?ids.add(id):ids.delete(id);store.put({id:'moment-revocations',ids:[...ids]});};});
}
export async function saveReviewBatch(records,categories){
  records.forEach(r=>validateRecord(r,categories));
  await transaction(['records','learning'],tx=>{for(const r of records){tx.objectStore('records').put(r);if(r.status==='confirmed')tx.objectStore('learning').put({id:r.id,categoryId:r.categoryId,text:r.title.trim().toLowerCase(),labels:r.analysis?.labels||[],updatedAt:r.updatedAt});}});
}
export async function saveRecord(record, categories, asset = null) {
  validateRecord(record, categories);
  await transaction(["records", "learning", "assets"], (tx) => {
    tx.objectStore("records").put(record);
    if (asset) tx.objectStore("assets").put(asset);
    if (record.status === "confirmed")
      tx.objectStore("learning").put({
        id: record.id,
        categoryId: record.categoryId,
        text: record.title.trim().toLowerCase(),
        labels: record.analysis?.labels || [],
        updatedAt: record.updatedAt,
      });
  });
}
export async function deleteRecord(record) {
  await transaction(["records", "learning", "assets"], (tx) => {
    tx.objectStore("records").delete(record.id);
    tx.objectStore("learning").delete(record.id);
    if (record.assetId) {
      const count = tx
        .objectStore("records")
        .index("assetId")
        .count(record.assetId);
      count.onsuccess = () => {
        if (count.result === 0) tx.objectStore("assets").delete(record.assetId);
      };
    }
  });
}
export async function clearEverything() {
  await transaction(STORE_NAMES, (tx) => {
    for (const name of STORE_NAMES) tx.objectStore(name).clear();
    for (const c of DEFAULT_CATEGORIES) tx.objectStore("categories").put(c);
    tx.objectStore("settings").put(DEFAULT_SETTINGS);
  });
}
function text(value, max = 20000) {
  return typeof value === "string" && value.length <= max;
}
export function validateBackupTables(tables) {
  for (const name of STORE_NAMES) {
    if (!Array.isArray(tables[name]) || tables[name].length > 100000)
      throw Error(`备份表不完整：${name}`);
    const ids = new Set();
    for (const row of tables[name]) {
      if (!row || !text(row.id, 200) || !row.id || ids.has(row.id))
        throw Error("备份 ID 重复或无效");
      ids.add(row.id);
    }
  }
  for (const c of tables.categories)
    if (
      !text(c.name, 30) ||
      !c.name.trim() ||
      !/^#[a-f0-9]{6}$/i.test(c.color) ||
      !text(c.icon, 30)
    )
      throw Error("分类格式不正确");
  const cats = new Set(tables.categories.map((c) => c.id)),
    assets = new Set(tables.assets.map((a) => a.id)),
    records = new Set(tables.records.map((r) => r.id));
  for(const setting of tables.settings)validatePrivateSetting(setting);
  const shared=tables.settings.find(row=>row.id==='social-shares');
  if(shared){
    if(!Array.isArray(shared.records)||shared.records.length>100000)throw Error('手动近况备份无效');
    const ids=new Set();
    for(const r of shared.records){
      if(!r||!text(r.id,100)||!/^share:[a-f0-9-]{36}$/.test(r.id)||ids.has(r.id)||r.kind!=='shared'||r.status!=='confirmed'||!validDate(r.date)||!cats.has(r.categoryId)||!text(r.title,200)||!r.title.trim()||!text(r.note,20000))throw Error('手动近况备份无效');
      ids.add(r.id);
    }
  }
  for (const r of tables.records) {
    validateRecord(r, tables.categories);
    if (r.assetId && !assets.has(r.assetId)) throw Error("备份缺少关联图片");
    if (!text(r.createdAt, 40) || !text(r.updatedAt, 40))
      throw Error("记录时间戳格式无效");
    if (
      r.analysis &&
      (!text(r.analysis.method, 100) ||
        !text(r.analysis.ocr || "", 20000) ||
        !Array.isArray(r.analysis.labels) ||
        r.analysis.labels.some((l) => !text(l, 200)))
    )
      throw Error("识别数据无效");
  }
  for (const p of tables.plans)
    if (
      !text(p.title, 200) ||
      !p.title.trim() ||
      !validDate(p.date) ||
      !cats.has(p.categoryId) ||
      !Number.isFinite(p.order) ||
      typeof p.done !== "boolean" ||
      !text(p.reason, 2000) ||
      !["week", "month"].includes(p.horizon)
    )
      throw Error("规划格式无效");
  for (const r of tables.reports)
    if (
      !text(r.text, 1000000) ||
      !validDate(r.start) ||
      !validDate(r.end) ||
      !["day", "week", "month", "year"].includes(r.period) ||
      !["brief", "deep"].includes(r.style) ||
      !text(r.recordSignature, 10000000)
    )
      throw Error("报告格式无效");
  for (const l of tables.learning)
    if (
      !records.has(l.id) ||
      !cats.has(l.categoryId) ||
      !text(l.text, 200) ||
      !Array.isArray(l.labels) ||
      l.labels.some((v) => !text(v, 200))
    )
      throw Error("学习样本无效");
  return tables;
}
export async function restoreBackup(tables) {
  validateBackupTables(tables);
  // Preserve local settings and all local IDs. Validation completes before the atomic merge.
  await transaction(STORE_NAMES, (tx) => {
    // Explicitly restore only these validated private settings; never transfer login/consent.
    for(const row of tables.settings.filter(validatePrivateSetting)){
      const store=tx.objectStore('settings'),request=store.get(row.id);
      request.onsuccess=()=>{if(!request.result)store.put(row);};
    }
    // Published text is user content, even though kept apart from private journal statistics.
    const incoming=tables.settings.find(row=>row.id==='social-shares');
    if(incoming){
      const settings=tx.objectStore('settings'),request=settings.get('social-shares');
      request.onsuccess=()=>{const records=request.result?.records||[],ids=new Set(records.map(r=>r.id));settings.put({id:'social-shares',records:[...records,...incoming.records.filter(r=>!ids.has(r.id)).map(r=>({...r,shareApproved:false}))]});};
    }
    for (const name of STORE_NAMES.filter((n) => n !== "settings"))
      for (const row of tables[name]) {
        const store = tx.objectStore(name),
          request = store.get(row.id);
        request.onsuccess = () => {
          if (!request.result) store.put(name==='records'?{...row,shareApproved:false,cloudSync:undefined,visibility:'self'}:row);
        };
      }
  });
}
