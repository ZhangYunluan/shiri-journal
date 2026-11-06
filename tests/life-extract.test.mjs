import test from "node:test";
import assert from "node:assert/strict";
const core = await import("../src/core.mjs");
test("text extraction only reads explicit fields and handles yuan, time and weight", () => {
  assert.equal(typeof core.extractFields, "function");
  assert.deepEqual(
    core.extractFields(
      "地点：公园\n金额：¥28.50\n活动：散步\n时长：25分钟\n体重：65.2kg",
    ),
    { location: "公园", amount: 28.5, duration: 25, weight: 65.2 },
  );
});
test("text extraction never infers mood from appearance", () => {
  assert.deepEqual(core.extractFields("a smiling person at the gym"), {});
});
