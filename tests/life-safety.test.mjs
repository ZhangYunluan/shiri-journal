import test from "node:test";
import assert from "node:assert/strict";
import { validateBackupTables } from "../src/db.mjs";
import { DEFAULT_CATEGORIES, DEFAULT_SETTINGS } from "../src/core.mjs";
import { esc, markdown } from "../src/ui.mjs";
function backup() {
  return {
    records: [],
    assets: [],
    categories: structuredClone(DEFAULT_CATEGORIES),
    reports: [],
    plans: [],
    learning: [],
    settings: [{ ...DEFAULT_SETTINGS }],
  };
}
test("invalid backup references reject before database transaction", () => {
  const data = backup();
  data.records = [
    {
      id: "r1",
      date: "2026-10-04",
      time: "12:00",
      title: "test",
      note: "",
      tags: [],
      categoryId: "missing",
      status: "confirmed",
      reflection: "",
      location: "",
    },
  ];
  assert.throws(() => validateBackupTables(data), /分类/);
});
test("backup rejects style injection and malformed plan numbers", () => {
  const a = backup();
  a.categories[0].color = "red;display:none";
  assert.throws(() => validateBackupTables(a), /分类/);
  const b = backup();
  b.plans = [
    {
      id: "p",
      title: "x",
      date: "2026-10-05",
      categoryId: "daily",
      order: NaN,
      done: false,
      reason: "",
      horizon: "week",
    },
  ];
  assert.throws(() => validateBackupTables(b), /规划/);
});
test("notes and markdown cannot execute html", () => {
  const content = "<img src=x onerror=alert(1)>";
  assert.equal(esc(content), "&lt;img src=x onerror=alert(1)&gt;");
  assert.ok(!markdown("# " + content).includes("<img"));
});
test("valid empty backup retains custom and built-in categories", () => {
  const data = backup();
  assert.equal(validateBackupTables(data), data);
});
test('manual shared text survives backup validation, malformed shares are rejected',()=>{
 const data=backup();
 const record={id:'share:11111111-1111-4111-8111-111111111111',kind:'shared',status:'confirmed',date:'2026-10-10',categoryId:'daily',title:'A day',note:'hello'};
 data.settings.push({id:'social-shares',records:[record]});
 assert.equal(validateBackupTables(data),data);
 record.categoryId='missing';assert.throws(()=>validateBackupTables(data),/手动近况/);
});
