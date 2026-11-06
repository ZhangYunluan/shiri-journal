import test from "node:test";
import assert from "node:assert/strict";
const core = await import("../src/core.mjs").catch(() => ({}));
const backup = await import("../src/backup.mjs").catch(() => ({}));
test("week crosses year using Monday and local calendar days", () => {
  assert.equal(typeof core.periodRange, "function");
  assert.deepEqual(core.periodRange("week", "2026-01-01"), {
    start: "2025-12-29",
    end: "2026-01-04",
  });
});
test("leap month bounds and year bounds", () => {
  assert.deepEqual(core.periodRange("month", "2024-02-18"), {
    start: "2024-02-01",
    end: "2024-02-29",
  });
  assert.deepEqual(core.periodRange("year", "2026-10-04"), {
    start: "2026-01-01",
    end: "2026-12-31",
  });
});
test("empty reports do not invent sentiment or training", () => {
  const text = core.makeReport(
    [],
    core.DEFAULT_CATEGORIES,
    "week",
    "2026-10-04",
    "deep",
  );
  assert.match(text, /没有记录/);
  assert.doesNotMatch(text, /训练了|情绪稳定|完成了/);
});
test("reports include confirmed events only within selected range; zero amount remains valid", () => {
  const records = [
    {
      id: "a",
      date: "2026-10-04",
      title: "免费公园",
      categoryId: "travel",
      status: "confirmed",
      duration: 20,
      amount: 0,
      mood: null,
      tags: [],
      note: "",
    },
    {
      id: "b",
      date: "2026-10-05",
      title: "不应出现",
      categoryId: "fitness",
      status: "confirmed",
    },
    { id: "c", date: "2026-10-04", title: "待核对不入报告", status: "review" },
  ];
  const text = core.makeReport(
    records,
    core.DEFAULT_CATEGORIES,
    "day",
    "2026-10-04",
    "brief",
  );
  assert.match(text, /免费公园/);
  assert.doesNotMatch(text, /不应出现|待核对不入报告/);
  assert.match(text, /未记录/);
});
test("rules disclose source and corrected labels can guide future classification", () => {
  assert.equal(core.suggestCategory("记录咖啡账单", []).categoryId, "spending");
  assert.equal(
    core.suggestCategory("银河课程", [
      { categoryId: "custom", text: "银河课程", labels: [] },
    ]).categoryId,
    "custom",
  );
});
test("reminder checks local time and does not repeat same day", () => {
  const settings = {
    reminderEnabled: true,
    reminderTime: "22:00",
    lastReminderDate: "",
  };
  assert.equal(core.reminderDue(settings, new Date(2026, 9, 4, 21, 59)), false);
  assert.equal(core.reminderDue(settings, new Date(2026, 9, 4, 22, 1)), true);
  assert.equal(
    core.reminderDue(
      { ...settings, lastReminderDate: "2026-10-04" },
      new Date(2026, 9, 4, 23),
    ),
    false,
  );
});
test("plan generation uses next period and does not diagnose from absent data", () => {
  const plans = core.suggestPlans(
    [],
    core.DEFAULT_CATEGORIES,
    "week",
    "2026-10-04",
  );
  assert.equal(plans[0].date, "2026-10-05");
  assert.match(plans[0].reason, /记录不足/);
});
test("ZIP round trip preserves UTF8 names and exact bytes", async () => {
  const files = [
    { name: "manifest.json", data: new TextEncoder().encode('{"version":1}') },
    { name: "images/测试.jpg", data: new Uint8Array([0, 128, 255, 10]) },
  ];
  const zip = await backup.createZip(files);
  const read = await backup.readZip(zip);
  assert.deepEqual(Array.from(read.get("images/测试.jpg")), [0, 128, 255, 10]);
});
test("corrupt archive is rejected before restore", async () => {
  const zip = await backup.createZip([
    { name: "a", data: new Uint8Array([1, 2, 3]) },
  ]);
  const bytes = new Uint8Array(await zip.arrayBuffer());
  bytes[31] ^= 1;
  await assert.rejects(() => backup.readZip(new Blob([bytes])), /损坏|校验/);
});

test("GIF backup preserves its actual file extension", async () => {
  const id = "a".repeat(64),
    blob = new Blob([new Uint8Array([71, 73, 70])], { type: "image/gif" });
  const zip = await backup.exportBackup({
    assets: [
      {
        id,
        blob,
        thumbnail: new Blob(["thumb"]),
        name: "test.gif",
        type: "image/gif",
        size: 3,
        lastModified: 0,
      },
    ],
    records: [],
  });
  const files = await backup.readZip(zip);
  assert.ok(files.has("images/" + id + ".gif"));
});
