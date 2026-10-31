import test from "node:test";
import assert from "node:assert/strict";
import {
  policy,
  priceRoom,
  rankCleaners,
  validateDraft,
  normalizePhone,
  expectedDeparture,
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
test("Qua nhiều đêm tính theo đêm, phụ thu lẻ không vượt giá một đêm", () => {
  const begin = "2026-10-28T15:00:00Z";
  const two = priceRoom(policy, begin, "2026-10-30T05:15:00Z", "NIGHT");
  assert.equal(two.units, 2);
  assert.equal(two.total, 500000);
  const late = priceRoom(policy, begin, "2026-10-30T05:16:00Z", "NIGHT");
  assert.equal(late.units, 2);
  assert.equal(late.surcharge, 50000);
  const capped = priceRoom(policy, begin, "2026-10-29T15:00:00Z", "NIGHT");
  assert.equal(capped.units, 2);
  assert.equal(capped.surcharge, 0);
  assert.equal(capped.total, 500000);
});
test("Giá qua đêm tăng liên tục qua mốc trưa và giới hạn phụ thu", () => {
  let previous = 0;
  for (let minutes = 0; minutes <= 5 * 1440; minutes += 15) {
    const total = priceRoom(
      policy,
      start,
      new Date(new Date(start).getTime() + minutes * 60000),
      "NIGHT",
    ).total;
    assert(total >= previous);
    previous = total;
  }
});
test("Giờ dự kiến tự suy ra từ hình thức thuê và múi giờ Việt Nam", () => {
  assert.equal(expectedDeparture(start, "HOUR").toISOString(), "2026-10-29T01:00:00.000Z");
  assert.equal(expectedDeparture(start, "NIGHT").toISOString(), "2026-10-29T05:00:00.000Z");
  assert.equal(
    expectedDeparture("2026-10-29T05:00:00Z", "NIGHT").toISOString(),
    "2026-10-30T05:00:00.000Z",
  );
});
test("Số điện thoại Việt Nam có định dạng khác nhau dùng cùng một hồ sơ", () => {
  for (const phone of ["0912 345 678", "+84 (912) 345-678", "0084912345678"])
    assert.equal(normalizePhone(phone), "0912345678");
  assert.equal(normalizePhone("+1 (415) 555-2671"), "+14155552671");
  for (const phone of ["", "1234", "0912abc345", "0\n12345678"])
    assert.throws(() => normalizePhone(phone));
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
