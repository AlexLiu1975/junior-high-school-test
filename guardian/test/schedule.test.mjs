import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_POLICY,
  activeWindow,
  bedtimeEnd,
  bedtimeStartAfter,
  isBedtime,
  nextWindowStart,
  normalizePolicy,
  scheduledMinutes,
  windowsForWeekday,
} from "../domain/schedule.js";

/** The schedule the parent described: one hour every weekday morning. */
const WEEKDAY_MORNING = {
  timeZone: "Asia/Taipei",
  dailyQuotaMinutes: 60,
  windows: {
    1: [{ start: "06:00", end: "07:00" }],
    2: [{ start: "06:00", end: "07:00" }],
    3: [{ start: "06:00", end: "07:00" }],
    4: [{ start: "06:00", end: "07:00" }],
    5: [{ start: "06:00", end: "07:00" }],
    6: [{ start: "09:00", end: "11:00" }],
  },
  bedtime: { start: "22:00", end: "06:00" },
  allowlist: ["phone", "emergency-sos"],
};

test("normalizePolicy resolves windows to minutes and sorts them", () => {
  const policy = normalizePolicy({
    ...WEEKDAY_MORNING,
    windows: { 1: [{ start: "19:00", end: "20:00" }, { start: "06:00", end: "07:00" }] },
  });
  assert.deepEqual(
    policy.windows[1].map((window) => [window.start, window.startMinutes, window.endMinutes]),
    [["06:00", 360, 420], ["19:00", 1140, 1200]],
  );
  assert.deepEqual(policy.windows[0], []);
  assert.equal(policy.paused, false);
});

test("the shipped default policy is itself valid", () => {
  const policy = normalizePolicy(structuredClone(DEFAULT_POLICY));
  assert.equal(policy.dailyQuotaMinutes, 60);
  assert.equal(policy.windows[1][0].start, "06:00");
});

test("normalizePolicy rejects malformed schedules", () => {
  const cases = {
    "overlapping windows": { 1: [{ start: "06:00", end: "08:00" }, { start: "07:00", end: "09:00" }] },
    "zero-length window": { 1: [{ start: "06:00", end: "06:00" }] },
    "window crossing midnight": { 1: [{ start: "23:00", end: "01:00" }] },
    "unknown weekday": { 9: [{ start: "06:00", end: "07:00" }] },
    "extra window field": { 1: [{ start: "06:00", end: "07:00", label: "morning" }] },
  };
  for (const [name, windows] of Object.entries(cases)) {
    assert.throws(
      () => normalizePolicy({ ...WEEKDAY_MORNING, windows }),
      /invalid-policy/,
      name,
    );
  }
});

test("normalizePolicy rejects bad quota, zone, and allowlist values", () => {
  assert.throws(() => normalizePolicy({ ...WEEKDAY_MORNING, dailyQuotaMinutes: -1 }), /invalid-policy/);
  assert.throws(() => normalizePolicy({ ...WEEKDAY_MORNING, dailyQuotaMinutes: 1441 }), /invalid-policy/);
  assert.throws(() => normalizePolicy({ ...WEEKDAY_MORNING, dailyQuotaMinutes: 30.5 }), /invalid-policy/);
  assert.throws(() => normalizePolicy({ ...WEEKDAY_MORNING, timeZone: "Nowhere" }), /invalid-policy/);
  assert.throws(() => normalizePolicy({ ...WEEKDAY_MORNING, allowlist: ["a", "a"] }), /invalid-policy/);
  assert.throws(() => normalizePolicy({ ...WEEKDAY_MORNING, surprise: true }), /invalid-policy/);
});

test("a zero-minute quota is allowed as a full block", () => {
  const policy = normalizePolicy({ ...WEEKDAY_MORNING, dailyQuotaMinutes: 0 });
  assert.equal(policy.dailyQuotaMinutes, 0);
});

test("activeWindow treats the window as half-open", () => {
  const policy = normalizePolicy(WEEKDAY_MORNING);
  assert.equal(activeWindow(policy, 1, 6 * 60), policy.windows[1][0]);
  assert.equal(activeWindow(policy, 1, 6 * 60 + 59), policy.windows[1][0]);
  assert.equal(activeWindow(policy, 1, 7 * 60), null);
  assert.equal(activeWindow(policy, 0, 6 * 60 + 30), null);
});

test("nextWindowStart searches forward across the week", () => {
  const policy = normalizePolicy(WEEKDAY_MORNING);
  assert.deepEqual({ ...nextWindowStart(policy, 1, 5 * 60) }, { dayOffset: 0, minutes: 360 });
  assert.deepEqual({ ...nextWindowStart(policy, 1, 7 * 60) }, { dayOffset: 1, minutes: 360 });
  // Saturday 12:00 -> nothing left today, Sunday has no window, so Monday 06:00.
  assert.deepEqual({ ...nextWindowStart(policy, 6, 12 * 60) }, { dayOffset: 2, minutes: 360 });
  assert.equal(nextWindowStart(normalizePolicy({ ...WEEKDAY_MORNING, windows: {} }), 1, 0), null);
});

test("bedtime spanning midnight blocks both sides of the boundary", () => {
  const policy = normalizePolicy(WEEKDAY_MORNING);
  assert.ok(isBedtime(policy, 23 * 60));
  assert.ok(isBedtime(policy, 2 * 60));
  assert.ok(!isBedtime(policy, 6 * 60));
  assert.ok(!isBedtime(policy, 21 * 60 + 59));
  assert.equal(bedtimeEnd(policy, 23 * 60), 6 * 60 + 1440);
  assert.equal(bedtimeEnd(policy, 2 * 60), 6 * 60);
  assert.equal(bedtimeEnd(policy, 12 * 60), null);
});

test("bedtimeStartAfter rolls into tomorrow once bedtime has begun", () => {
  const policy = normalizePolicy(WEEKDAY_MORNING);
  assert.equal(bedtimeStartAfter(policy, 6 * 60), 22 * 60);
  assert.equal(bedtimeStartAfter(policy, 23 * 60), 22 * 60 + 1440);
  assert.equal(bedtimeStartAfter(normalizePolicy({ ...WEEKDAY_MORNING, bedtime: null }), 60), null);
});

test("scheduledMinutes reports the schedule ceiling per weekday", () => {
  const policy = normalizePolicy(WEEKDAY_MORNING);
  assert.equal(scheduledMinutes(policy, 1), 60);
  assert.equal(scheduledMinutes(policy, 6), 120);
  assert.equal(scheduledMinutes(policy, 0), 0);
  assert.deepEqual(windowsForWeekday(policy, 0), []);
});
