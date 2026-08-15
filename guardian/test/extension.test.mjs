import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_BONUS_MINUTES_PER_DAY,
  MAX_OPEN_REQUESTS_PER_DAY,
  REQUEST_EXPIRY_MS,
  bonusMinutesForDate,
  canOpenRequest,
  createExtensionRequest,
  decideExtensionRequest,
  expireRequest,
  isRequestExpired,
  pendingRequests,
} from "../domain/extension.js";

const NOW = Date.UTC(2026, 7, 17, 4, 0);
const TODAY = "2026-08-17";

function request(overrides = {}) {
  return createExtensionRequest({
    requestId: "req-1",
    childId: "child-1",
    deviceId: "device-1",
    dateKey: TODAY,
    minutes: 30,
    reason: "作業還沒寫完",
    createdAtMs: NOW,
    ...overrides,
  });
}

test("a child's request opens pending with an expiry", () => {
  const pending = request();
  assert.equal(pending.status, "pending");
  assert.equal(pending.minutes, 30);
  assert.equal(pending.reason, "作業還沒寫完");
  assert.equal(pending.grantedMinutes, 0);
  assert.equal(pending.expiresAtMs, NOW + REQUEST_EXPIRY_MS);
});

test("requested minutes are bounded and must be whole", () => {
  assert.throws(() => request({ minutes: 4 }), /invalid-extension-request/);
  assert.throws(() => request({ minutes: 121 }), /invalid-extension-request/);
  assert.throws(() => request({ minutes: 12.5 }), /invalid-extension-request/);
  assert.throws(() => request({ dateKey: "2026-8-17" }), /invalid-extension-request/);
  assert.throws(() => request({ reason: "x".repeat(201) }), /invalid-extension-request/);
});

test("approval records the grant and the deciding parent", () => {
  const approved = decideExtensionRequest(request(), {
    decision: "approved",
    decidedByUid: "parent-1",
    decidedAtMs: NOW + 60_000,
    decisionNote: "只到八點",
  });
  assert.equal(approved.status, "approved");
  assert.equal(approved.grantedMinutes, 30);
  assert.equal(approved.decidedByUid, "parent-1");
  assert.equal(approved.decisionNote, "只到八點");
});

test("a parent may grant fewer minutes than the child asked for", () => {
  const approved = decideExtensionRequest(request({ minutes: 60 }), {
    decision: "approved",
    decidedByUid: "parent-1",
    decidedAtMs: NOW + 1000,
    grantedMinutes: 15,
  });
  assert.equal(approved.grantedMinutes, 15);
});

test("denial grants nothing", () => {
  const denied = decideExtensionRequest(request(), {
    decision: "denied",
    decidedByUid: "parent-1",
    decidedAtMs: NOW + 1000,
    decisionNote: "先睡覺",
  });
  assert.equal(denied.status, "denied");
  assert.equal(denied.grantedMinutes, 0);
});

test("a request can only be decided once", () => {
  const approved = decideExtensionRequest(request(), {
    decision: "approved",
    decidedByUid: "parent-1",
    decidedAtMs: NOW + 1000,
  });
  assert.throws(
    () => decideExtensionRequest(approved, {
      decision: "denied",
      decidedByUid: "parent-2",
      decidedAtMs: NOW + 2000,
    }),
    /extension-request-not-pending/,
  );
});

test("an hour-old request can no longer be approved", () => {
  const stale = request();
  assert.equal(isRequestExpired(stale, NOW + REQUEST_EXPIRY_MS), true);
  assert.throws(
    () => decideExtensionRequest(stale, {
      decision: "approved",
      decidedByUid: "parent-1",
      decidedAtMs: NOW + REQUEST_EXPIRY_MS + 1,
    }),
    /extension-request-expired/,
  );
  assert.equal(expireRequest(stale, NOW + REQUEST_EXPIRY_MS).status, "expired");
  assert.equal(expireRequest(stale, NOW + 1000).status, "pending");
});

test("the daily bonus budget clamps generous approvals", () => {
  const approved = decideExtensionRequest(request({ minutes: 120 }), {
    decision: "approved",
    decidedByUid: "parent-1",
    decidedAtMs: NOW + 1000,
    bonusAlreadyGrantedMinutes: MAX_BONUS_MINUTES_PER_DAY - 20,
  });
  assert.equal(approved.grantedMinutes, 20);

  assert.throws(
    () => decideExtensionRequest(request({ requestId: "req-2" }), {
      decision: "approved",
      decidedByUid: "parent-1",
      decidedAtMs: NOW + 1000,
      bonusAlreadyGrantedMinutes: MAX_BONUS_MINUTES_PER_DAY,
    }),
    /extension-budget-exhausted/,
  );
});

test("bonus minutes are summed per day and capped", () => {
  const approvals = [
    { ...request({ requestId: "a" }), status: "approved", grantedMinutes: 30 },
    { ...request({ requestId: "b" }), status: "approved", grantedMinutes: 45 },
    { ...request({ requestId: "c" }), status: "denied", grantedMinutes: 0 },
    { ...request({ requestId: "d", dateKey: "2026-08-18" }), status: "approved", grantedMinutes: 60 },
  ];
  assert.equal(bonusMinutesForDate(approvals, TODAY), 75);
  assert.equal(bonusMinutesForDate(approvals, "2026-08-18"), 60);
  assert.equal(bonusMinutesForDate(approvals, "2026-08-19"), 0);

  const many = Array.from({ length: 8 }, (_, index) => ({
    ...request({ requestId: `r${index}` }),
    status: "approved",
    grantedMinutes: 60,
  }));
  assert.equal(bonusMinutesForDate(many, TODAY), MAX_BONUS_MINUTES_PER_DAY);
});

test("expired requests drop out of the parent's inbox", () => {
  const fresh = request({ requestId: "fresh", createdAtMs: NOW });
  const old = request({ requestId: "old", createdAtMs: NOW - REQUEST_EXPIRY_MS - 1 });
  const open = pendingRequests([fresh, old], NOW);
  assert.deepEqual(open.map((entry) => entry.requestId), ["fresh"]);
});

test("a child cannot flood the parent with requests", () => {
  const open = Array.from({ length: MAX_OPEN_REQUESTS_PER_DAY }, (_, index) =>
    request({ requestId: `r${index}` }));
  assert.equal(canOpenRequest(open.slice(0, 2), TODAY, NOW), true);
  assert.equal(canOpenRequest(open, TODAY, NOW), false);
  // Yesterday's pending requests do not block today.
  assert.equal(canOpenRequest(open, "2026-08-18", NOW), true);
});
