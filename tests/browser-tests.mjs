import * as db from "../src/db.mjs";
import { prepareImage } from "../src/images.mjs";
import { exportBackup, parseBackup } from "../src/backup.mjs";
import { DEFAULT_CATEGORIES, extractFields } from "../src/core.mjs";
import { analyzeImage } from "../src/local-ai.mjs";
const output = document.querySelector("#results");
function log(s) {
  output.textContent += s + "\n";
}
function assert(value, message) {
  if (!value) throw Error(message);
  log("PASS · " + message);
}
let external = [];
const nativeFetch = window.fetch;
window.fetch = (input, options) => {
  const url = new URL(
    typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
    location.href,
  );
  if (![location.origin, "null"].includes(url.origin)) {
    external.push(url.href);
    throw Error("Blocked external request " + url.origin);
  }
  return nativeFetch(input, options);
};
const fixture = async () => {
  const response = await fetch("./tests/fixtures/test-receipt.png");
  return prepareImage(
    new File([await response.blob()], "test-receipt.png", {
      type: "image/png",
      lastModified: Date.now(),
    }),
  );
};
document.querySelector('#run-pwa').onclick = async () => {
  try {
    assert(window.isSecureContext, '安全上下文可用');
    const manifest = await (await fetch('./manifest.webmanifest')).json();
    for (const icon of manifest.icons) {
      const bitmap = await createImageBitmap(await (await fetch(icon.src)).blob());
      assert(icon.sizes === `${bitmap.width}x${bitmap.height}`, 'PNG 安装图标实际尺寸正确：' + icon.sizes);
      bitmap.close();
    }
    const registration = await navigator.serviceWorker.register('./sw.js');
    const active = await Promise.race([navigator.serviceWorker.ready, new Promise((_, reject)=>setTimeout(()=>reject(Error('离线缓存安装超时')),30000))]);
    assert(Boolean(active.active), 'Service Worker 已激活');
    const cache = await caches.open('shiri-shell-v4');
    assert(Boolean(await cache.match(new URL('./index.html',location.href))), '离线应用入口已缓存');
    assert(Boolean(await cache.match(new URL('./src/model-cache.mjs',location.href))), '分片模型加载代码已缓存');
    log('PWA SUITE COMPLETE');
  } catch(e) { log('FAIL · ' + e.message); }
};
document.querySelector("#run-storage").onclick = async () => {
  if (!["4176", "4178"].includes(location.port)) {
    log("拒绝：请使用隔离端口 4176 或 4178");
    return;
  }
  output.textContent = "";
  try {
    const before = await db.readAll();
    if (
      before.records.length ||
      before.assets.length ||
      before.plans.length ||
      before.reports.length
    )
      throw Error("隔离库非空，拒绝覆盖");
    const asset = await fixture(),
      same = await fixture();
    assert(asset.id === same.id, "同内容照片 SHA-256 相同");
    const record = {
      id: "test-record",
      date: "2026-10-04",
      time: "12:00",
      title: "测试收据",
      note: "total: 28.50",
      categoryId: "spending",
      tags: ["测试"],
      location: "",
      mood: null,
      duration: null,
      amount: 28.5,
      weight: null,
      reflection: "",
      assetId: asset.id,
      status: "confirmed",
      source: "photo",
      analysis: { method: "manual", labels: [], ocr: "" },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await db.saveRecord(record, DEFAULT_CATEGORIES, asset);
    let current = await db.readAll();
    assert(
      current.records.length === 1 &&
        current.assets.length === 1 &&
        current.learning.length === 1,
      "图片、记录和纠正记忆原子写入",
    );
    assert(
      current.assets[0].blob instanceof Blob &&
        current.assets[0].thumbnail.size > 0,
      "原图与缩略图可从 IndexedDB 读取",
    );
    await db.putMany("plans", [
      {
        id: "test-plan",
        title: "测试计划",
        date: "2026-10-05",
        categoryId: "daily",
        order: 0,
        done: true,
        reason: "test",
        horizon: "week",
      },
    ]);
    await db.put("reports", {
      id: "test-report",
      text: "# 测试报告",
      period: "day",
      style: "brief",
      start: "2026-10-04",
      end: "2026-10-04",
      recordSignature: "test",
    });
    const zip = await exportBackup(await db.readAll()),
      tables = await parseBackup(zip);
    db.validateBackupTables(tables);
    assert(
      tables.records[0].amount === 28.5 &&
        tables.plans[0].done &&
        tables.reports[0].text === "# 测试报告",
      "ZIP 备份包含文本、规划、报告",
    );
    assert(tables.assets[0].size === asset.size, "ZIP 原图大小一致");
    await db.clearEverything();
    assert((await db.readAll()).records.length === 0, "清空七张表并恢复默认值");
    await db.restoreBackup(tables);
    current = await db.readAll();
    assert(
      current.records.length === 1 &&
        current.assets.length === 1 &&
        current.plans[0].done,
      "ZIP 完整恢复",
    );
    await db.restoreBackup(tables);
    assert(
      (await db.readAll()).records.length === 1,
      "重复恢复不会重复创建记录",
    );
    const bad = structuredClone(tables);
    bad.records[0].categoryId = "missing";
    let rejected = false;
    try {
      await db.restoreBackup(bad);
    } catch {
      rejected = true;
    }
    assert(
      rejected && (await db.readAll()).records.length === 1,
      "非法备份不更改当前数据",
    );
    await db.deleteRecord(record);
    current = await db.readAll();
    assert(
      !current.records.length &&
        !current.assets.length &&
        !current.learning.length,
      "删除记录会清理原图与纠正记忆",
    );
    await db.clearEverything();
    assert(external.length === 0, "数据流程没有外部网络请求");
    log("STORAGE SUITE COMPLETE");
  } catch (e) {
    log("FAIL · " + e.message);
    console.error(e);
  }
};
document.querySelector("#run-models").onclick = async () => {
  const btn = document.querySelector("#run-models");
  btn.disabled = true;
  try {
    const asset = await fixture(),
      result = await analyzeImage(
        asset,
        { aiEnabled: true, ocrEnabled: true },
        [],
        log,
      );
    log(JSON.stringify(result, null, 2));
    assert(result.labels.length === 3, "本地视觉模型返回真实候选");
    assert(/28[.,]50/.test(result.ocr), "本地 OCR 识别测试收据金额");
    assert(extractFields(result.ocr).amount === 28.5, "OCR 明确金额可结构化");
    assert(external.length === 0, "推理未请求外部服务器");
    log("MODEL SUITE COMPLETE");
  } catch (e) {
    log("FAIL · " + e.message);
    console.error(e);
  } finally {
    btn.disabled = false;
  }
};
