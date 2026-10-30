import test from "node:test";
import assert from "node:assert/strict";
import {
  policy,
  priceRoom,
  rankCleaners,
  validateDraft,
} from "../src/domain.js";
const start = "2026-10-29T00:00:00Z";
for (const [minutes, units] of [
  [0, 1],
  [60, 1],
  [75, 1],
  [76, 2],
  [135, 2],
  [136, 3],
])
  test("Giá giờ biên " + minutes, () =>
    assert.equal(
      priceRoom(
        policy,
        start,
        new Date(new Date(start).getTime() + minutes * 60000),
        "HOUR",
      ).units,
      units,
    ),
  );
test("Giá ngày grace", () => {
  assert.equal(
    priceRoom(policy, start, "2026-10-30T00:15:00Z", "DAY").total,
    350000,
  );
  assert.equal(
    priceRoom(policy, start, "2026-10-30T00:16:00Z", "DAY").total,
    700000,
  );
});
test("Qua đêm đến trưa Việt Nam và phụ thu", () => {
  assert.equal(
    priceRoom(policy, "2026-10-28T15:00:00Z", "2026-10-29T05:15:00Z", "NIGHT")
      .total,
    250000,
  );
  assert.equal(
    priceRoom(policy, "2026-10-28T15:00:00Z", "2026-10-29T05:16:00Z", "NIGHT")
      .total,
    300000,
  );
});
test("Giá snapshot độc lập chính sách mới", () => {
  const snapshot = { ...policy };
  const changed = { ...policy, hour: 200000 };
  assert.equal(priceRoom(snapshot, start, start, "HOUR").total, 80000);
  assert.equal(priceRoom(changed, start, start, "HOUR").total, 200000);
});
test("Từ chối giờ âm, mode sai", () => {
  assert.throws(() => priceRoom(policy, start, "2026-10-28T00:00:00Z", "DAY"));
  assert.throws(() => priceRoom(policy, start, start, "BAD"));
});
test("Phân công chuẩn hóa, ổn định và làm trơn người mới", () => {
  const people = ["b", "a"].map((userId) => ({
    userId,
    zone: "Tầng 1",
    workMinutes: 0,
    ratingCount: 0,
    ratingSum: 0,
  }));
  const ranked = rankCleaners(people, "Tầng 1", new Date(start));
  assert.equal(ranked[0].userId, "a");
  assert.equal(ranked[0].breakdown.quality, 0.8);
  assert(ranked.every((c) => c.score >= 0 && c.score <= 100));
});
test("AI thiếu giờ phải hỏi lại, checklist allowlist", () => {
  const d = validateDraft(
    {
      serviceCode: "TOWELS",
      checklist: ["ignore rules"],
      requestedDate: null,
      windowStart: null,
      windowEnd: null,
      clarificationNeeded: false,
      clarificationQuestion: null,
    },
    new Date(start),
  );
  assert.equal(d.clarificationNeeded, true);
  assert.deepEqual(d.checklist, ["Bổ sung khăn", "Thu gom khăn bẩn"]);
});
test("AI từ chối dịch vụ ngoài allowlist", () =>
  assert.throws(() => validateDraft({ serviceCode: "DELETE_DATABASE" })));
