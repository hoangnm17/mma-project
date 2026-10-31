import test from "node:test";
import assert from "node:assert/strict";
import { reportRange, revenueSources } from "../src/services/reporting.js";

const line = (category, total, name = "Dịch vụ") => ({ category, total, name });
const totalOf = (values) => Object.values(values).reduce((sum, value) => sum + value, 0);

test("Revenue by source follows immutable invoice line amounts after price changes", () => {
  const lines = [
    line("ROOM", 200000),
    line("SERVICE", 50000),
    line("FOOD", 30000),
    line("SPECIAL", 20000),
  ];
  assert.deepEqual(revenueSources(lines, 300000), {
    ROOM: 200000, SERVICE: 50000, FOOD: 30000, SPECIAL: 20000,
  });
  // A final discount or a later refund reduces each source proportionately.
  assert.deepEqual(revenueSources(lines, 240000), {
    ROOM: 160000, SERVICE: 40000, FOOD: 24000, SPECIAL: 16000,
  });
  // A final surcharge increases the existing sources; no catalogue lookup occurs.
  assert.deepEqual(revenueSources(lines, 330000), {
    ROOM: 220000, SERVICE: 55000, FOOD: 33000, SPECIAL: 22000,
  });
  assert.equal(totalOf(revenueSources(lines, 0)), 0);
});

test("Whole-VND allocation remains exact for large amounts and near-tied fractions", () => {
  const amounts = [250000001, 250000000, 249999999, 249999998];
  const lines = ["ROOM", "SERVICE", "FOOD", "SPECIAL"].map((category, index) => line(category, amounts[index]));
  // A one-VND discount goes to the largest category. Floating-point fractions
  // here are too close to rank reliably after multiplying billion-VND values.
  const allocated = revenueSources(lines, 999999997);
  assert.deepEqual(allocated, {
    ROOM: 250000000, SERVICE: 250000000, FOOD: 249999999, SPECIAL: 249999998,
  });
  assert.equal(totalOf(allocated), 999999997);
  assert(Object.values(allocated).every(Number.isSafeInteger));
});

test("Tied remainders have stable allocation and absent categories remain zero", () => {
  assert.deepEqual(revenueSources([line("ROOM", 1), line("FOOD", 1)], 1), {
    ROOM: 1, SERVICE: 0, FOOD: 0, SPECIAL: 0,
  });
  const lines = [line("ROOM", 1), line("SERVICE", 1), line("FOOD", 1), line("SPECIAL", 1)];
  for (const netTotal of [1, 2, 3, 5, 7, 999999999]) {
    const shares = revenueSources(lines, netTotal);
    assert.equal(totalOf(shares), netTotal);
    assert(Object.values(shares).every((amount) => Number.isInteger(amount) && amount >= 0));
  }
});

test("Historical room lines without category and empty invoices are classified consistently", () => {
  assert.deepEqual(revenueSources([
    { name: "Tiền phòng qua đêm", total: 250000 },
    { name: "Nước uống", total: 10000 },
    { category: "LEGACY", name: "Giặt ủi", total: 40000 },
  ], 300000), { ROOM: 250000, SERVICE: 50000, FOOD: 0, SPECIAL: 0 });
  assert.deepEqual(revenueSources([], 50000), { ROOM: 50000, SERVICE: 0, FOOD: 0, SPECIAL: 0 });
  assert.deepEqual(revenueSources([line("ROOM", 0)], 0), { ROOM: 0, SERVICE: 0, FOOD: 0, SPECIAL: 0 });
  assert.throws(() => revenueSources([line("ROOM", -1)], 10));
  assert.throws(() => revenueSources([line("ROOM", 1)], -10));
  assert.throws(() => revenueSources([line("ROOM", 1)], 0.5));
});

test("Report ranges accept explicit timezone offsets and reject incomplete or reversed intervals", () => {
  assert.deepEqual(reportRange(), {});
  const range = reportRange({ from: "2026-10-01T00:00:00+07:00", to: "2026-11-01T00:00:00+07:00" });
  assert.equal(range.from.toISOString(), "2026-09-30T17:00:00.000Z");
  assert.equal(range.to.toISOString(), "2026-10-31T17:00:00.000Z");
  for (const invalid of [
    { from: "2026-10-01T00:00:00Z" },
    { to: "2026-11-01T00:00:00Z" },
    { from: "2026-10-01T00:00:00Z", to: "2026-10-01T00:00:00Z" },
    { from: "2026-11-01T00:00:00Z", to: "2026-10-01T00:00:00Z" },
    { from: "2026-10-01", to: "2026-11-01" },
    { from: "2026-10-01T00:00:00", to: "2026-11-01T00:00:00" },
    { from: "invalid", to: "2026-11-01T00:00:00Z" },
  ]) assert.throws(() => reportRange(invalid));
});
