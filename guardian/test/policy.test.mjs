import assert from "node:assert/strict";
import test from "node:test";
import { applyCommand, createCommand } from "../domain/commands.js";
import { dayTimeline, evaluateDeviceState, remainingMinutesToday } from "../domain/policy.js";
import { normalizePolicy } from "../domain/schedule.js";

const TAIPEI = "Asia/Taipei";

/** Exactly the rule the parent asked for: 06:00-07:00, one hour a day. */
const MORNING_HOUR = normalizePolicy({
  timeZone: TAIPEI,
  dailyQuotaMinutes: 60,
  windows: {
    1: [{ start: "06:00", end: "07:00" }],
    2: [{ start: "06:00", end: "07:00" }],
    3: [{ start: "06:00", end: "07:00" }],
    4: [{ start: "06:00", end: "07:00" }],
    5: [{ start: "06:00", end: "07:00" }],
    6: [{ start: "09:00", end: "11:00" }],
  },
  bedtime: { start: "22:00", end: "05:30" },
  allowlist: ["phone", "emergency-sos"],
});

/** Monday 2026-08-17, given as Taipei wall-clock minutes. */
function mondayAt(hour, minute = 0) {
  return Date.UTC(2026, 7, 17, hour - 8, minute);
}

test("inside the window the device is unlocked until the window closes", () => {
  const state = evaluateDeviceState({ policy: MORNING_HOUR, usedMinutes: 0, nowMs: mondayAt(6, 0) });
  assert.equal(state.locked, false);
  assert.equal(state.reason, "allowed");
  assert.equal(state.lockAtMs, mondayAt(7, 0));
  assert.equal(state.remainingMinutes, 60);
  assert.equal(state.quotaMinutes, 60);
});

test("the countdown shrinks as the hour is consumed", () => {
  const state = evaluateDeviceState({
    policy: MORNING_HOUR,
    usedMinutes: 45,
    nowMs: mondayAt(6, 45),
  });
  assert.equal(state.locked, false);
  assert.equal(state.remainingMinutes, 15);
  assert.equal(state.lockAtMs, mondayAt(7, 0));
});

test("the device locks the moment the window ends", () => {
  const state = evaluateDeviceState({ policy: MORNING_HOUR, usedMinutes: 60, nowMs: mondayAt(7, 0) });
  assert.equal(state.locked, true);
  assert.equal(state.reason, "outside-window");
  assert.equal(state.remainingMinutes, 0);
  // Next chance is tomorrow morning.
  assert.equal(state.nextUnlockAtMs, Date.UTC(2026, 7, 18, 6 - 8, 0));
});

test("quota exhausted mid-window locks early and resets next day", () => {
  // Child burned the hour before 06:30 (e.g. an approved late-night unlock).
  const state = evaluateDeviceState({
    policy: MORNING_HOUR,
    usedMinutes: 60,
    nowMs: mondayAt(6, 30),
  });
  assert.equal(state.locked, true);
  assert.equal(state.reason, "quota-exhausted");
  assert.equal(state.nextUnlockAtMs, Date.UTC(2026, 7, 18, 6 - 8, 0));
  assert.equal(state.quotaResetAtMs, Date.UTC(2026, 7, 17, 16, 0));
});

test("a quota smaller than the window ends the session early", () => {
  const halfHour = normalizePolicy({
    timeZone: TAIPEI,
    dailyQuotaMinutes: 30,
    windows: { 1: [{ start: "06:00", end: "07:00" }] },
    bedtime: null,
    allowlist: [],
  });
  const state = evaluateDeviceState({ policy: halfHour, usedMinutes: 10, nowMs: mondayAt(6, 10) });
  assert.equal(state.lockAtMs, mondayAt(6, 30));
  assert.equal(state.remainingMinutes, 20);
});

test("approved extension minutes lengthen the same day only", () => {
  const state = evaluateDeviceState({
    policy: MORNING_HOUR,
    usedMinutes: 60,
    bonusMinutes: 30,
    nowMs: mondayAt(6, 40),
  });
  assert.equal(state.locked, false);
  assert.equal(state.quotaMinutes, 90);
  assert.equal(state.remainingMinutes, 20); // window still closes at 07:00
  assert.equal(state.lockAtMs, mondayAt(7, 0));
});

test("bedtime outranks an open window", () => {
  const nightPolicy = normalizePolicy({
    timeZone: TAIPEI,
    dailyQuotaMinutes: 120,
    windows: { 1: [{ start: "21:00", end: "23:00" }] },
    bedtime: { start: "22:00", end: "06:00" },
    allowlist: [],
  });
  const beforeBed = evaluateDeviceState({ policy: nightPolicy, usedMinutes: 0, nowMs: mondayAt(21, 30) });
  assert.equal(beforeBed.locked, false);
  assert.equal(beforeBed.lockAtMs, mondayAt(22, 0), "locks at bedtime, not at window end");

  const afterBed = evaluateDeviceState({ policy: nightPolicy, usedMinutes: 0, nowMs: mondayAt(22, 30) });
  assert.equal(afterBed.locked, true);
  assert.equal(afterBed.reason, "bedtime");
  assert.equal(afterBed.nextUnlockAtMs, Date.UTC(2026, 7, 18, 6 - 8, 0));
});

test("a parent's one-tap lock beats an open window", () => {
  const command = createCommand({
    commandId: "cmd-1",
    type: "lock",
    deviceId: "device-1",
    childId: "child-1",
    issuedByUid: "parent-1",
    issuedAtMs: mondayAt(6, 10),
  });
  const state = evaluateDeviceState({
    policy: MORNING_HOUR,
    usedMinutes: 10,
    override: applyCommand(null, command),
    nowMs: mondayAt(6, 20),
  });
  assert.equal(state.locked, true);
  assert.equal(state.reason, "manual-lock");
  assert.equal(state.remainingMinutes, 0);
  assert.equal(state.nextUnlockAtMs, null, "only the parent can lift a manual lock");
  assert.equal(state.overrideCommandId, "cmd-1");
});

test("a temporary unlock bypasses the schedule until it expires", () => {
  const command = createCommand({
    commandId: "cmd-2",
    type: "unlock",
    deviceId: "device-1",
    childId: "child-1",
    issuedByUid: "parent-1",
    issuedAtMs: mondayAt(20, 0),
    minutes: 30,
  });
  const override = applyCommand(null, command);
  const during = evaluateDeviceState({
    policy: MORNING_HOUR,
    usedMinutes: 60,
    override,
    nowMs: mondayAt(20, 10),
  });
  assert.equal(during.locked, false);
  assert.equal(during.reason, "manual-unlock");
  assert.equal(during.lockAtMs, mondayAt(20, 30));

  const after = evaluateDeviceState({
    policy: MORNING_HOUR,
    usedMinutes: 60,
    override,
    nowMs: mondayAt(20, 31),
  });
  assert.equal(after.locked, true);
  assert.equal(after.reason, "outside-window");
});

test("pausing management unlocks without touching the schedule", () => {
  const paused = normalizePolicy({
    timeZone: TAIPEI,
    dailyQuotaMinutes: 60,
    windows: { 1: [{ start: "06:00", end: "07:00" }] },
    bedtime: { start: "22:00", end: "06:00" },
    allowlist: [],
    paused: true,
  });
  const state = evaluateDeviceState({ policy: paused, usedMinutes: 500, nowMs: mondayAt(23, 0) });
  assert.equal(state.locked, false);
  assert.equal(state.reason, "paused");
});

test("a manual lock still wins while management is paused", () => {
  const paused = normalizePolicy({
    timeZone: TAIPEI,
    dailyQuotaMinutes: 60,
    windows: { 1: [{ start: "06:00", end: "07:00" }] },
    bedtime: null,
    allowlist: [],
    paused: true,
  });
  const override = applyCommand(null, createCommand({
    commandId: "cmd-3",
    type: "lock",
    deviceId: "device-1",
    childId: "child-1",
    issuedByUid: "parent-1",
    issuedAtMs: mondayAt(12, 0),
  }));
  const state = evaluateDeviceState({ policy: paused, override, nowMs: mondayAt(12, 5) });
  assert.equal(state.locked, true);
  assert.equal(state.reason, "manual-lock");
});

test("allowlisted apps travel with every verdict", () => {
  const state = evaluateDeviceState({ policy: MORNING_HOUR, nowMs: mondayAt(3, 0) });
  assert.equal(state.locked, true);
  assert.equal(state.reason, "bedtime");
  assert.deepEqual([...state.allowlist], ["emergency-sos", "phone"]);
});

test("remainingMinutesToday is bounded by both quota and schedule", () => {
  assert.equal(
    remainingMinutesToday({ policy: MORNING_HOUR, usedMinutes: 0, nowMs: mondayAt(5, 0) }),
    60,
  );
  assert.equal(
    remainingMinutesToday({ policy: MORNING_HOUR, usedMinutes: 0, nowMs: mondayAt(6, 30) }),
    30,
    "only half the window is left",
  );
  assert.equal(
    remainingMinutesToday({ policy: MORNING_HOUR, usedMinutes: 55, nowMs: mondayAt(6, 0) }),
    5,
    "quota is the tighter bound",
  );
  assert.equal(
    remainingMinutesToday({ policy: MORNING_HOUR, usedMinutes: 0, nowMs: mondayAt(12, 0) }),
    0,
  );
});

test("dayTimeline exposes the whole day for the dashboard strip", () => {
  const timeline = dayTimeline({ policy: MORNING_HOUR, nowMs: mondayAt(12, 0) });
  assert.equal(timeline.length, 1);
  assert.deepEqual(
    { start: timeline[0].start, end: timeline[0].end, minutes: timeline[0].minutes },
    { start: "06:00", end: "07:00", minutes: 60 },
  );
  assert.equal(timeline[0].startMs, mondayAt(6, 0));
});

test("evaluation rejects malformed input rather than guessing", () => {
  assert.throws(() => evaluateDeviceState({ policy: null, nowMs: 0 }), /invalid-policy-evaluation/);
  assert.throws(
    () => evaluateDeviceState({ policy: MORNING_HOUR, nowMs: Number.NaN }),
    /invalid-policy-evaluation/,
  );
  assert.throws(
    () => evaluateDeviceState({ policy: MORNING_HOUR, usedMinutes: -5, nowMs: mondayAt(6, 0) }),
    /invalid-policy-evaluation/,
  );
});
