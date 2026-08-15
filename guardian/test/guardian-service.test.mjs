import assert from "node:assert/strict";
import test from "node:test";
import { evaluateDeviceState } from "../domain/policy.js";
import { seedDemoFamily } from "../server/memoryRepository.js";
import {
  confirmCommand,
  decideRequest,
  expireStaleRequests,
  issueCommand,
  loadDashboard,
  requestExtension,
  syncDevice,
  updatePolicy,
} from "../server/guardianService.js";

const FAMILY = "family-1";
const PARENT = "parent-1";
const CHILD = "child-1";
const DEVICE = "device-1";
const CLAIMS = { familyId: FAMILY, childId: CHILD, deviceId: DEVICE };

/** Monday 2026-08-17 in Asia/Taipei. */
function at(hour, minute = 0) {
  return Date.UTC(2026, 7, 17, hour - 8, minute);
}

function idFactory(prefix = "id") {
  let counter = 0;
  return () => {
    counter += 1;
    return `${prefix}-${counter}`;
  };
}

const MORNING_POLICY = {
  timeZone: "Asia/Taipei",
  dailyQuotaMinutes: 60,
  windows: {
    1: [{ start: "06:00", end: "07:00" }],
    2: [{ start: "06:00", end: "07:00" }],
  },
  bedtime: { start: "22:00", end: "05:30" },
  allowlist: ["phone"],
};

async function setup() {
  const repository = seedDemoFamily();
  await updatePolicy(repository, {
    familyId: FAMILY,
    uid: PARENT,
    childId: CHILD,
    policy: MORNING_POLICY,
    nowMs: at(5, 0),
  });
  return repository;
}

function session(startHour, startMinute, endHour, endMinute, appId = "youtube") {
  return {
    appId,
    appName: "YouTube",
    category: "video",
    startMs: at(startHour, startMinute),
    endMs: at(endHour, endMinute),
  };
}

test("device sync returns the verdict, policy, and today's usage", async () => {
  const repository = await setup();
  const result = await syncDevice(repository, {
    claims: CLAIMS,
    sessions: [session(6, 0, 6, 20)],
    platform: "android",
    appVersion: "1.0.0",
    nowMs: at(6, 20),
  });
  assert.equal(result.state.locked, false);
  assert.equal(result.state.reason, "allowed");
  assert.equal(result.usage.totalMinutes, 20);
  assert.equal(result.state.remainingMinutes, 40);
  assert.equal(result.policy.dailyQuotaMinutes, 60);
  assert.equal(result.state.lockAtMs, at(7, 0));
});

test("usage accumulates across syncs and locks when the hour is spent", async () => {
  const repository = await setup();
  await syncDevice(repository, { claims: CLAIMS, sessions: [session(6, 0, 6, 30)], nowMs: at(6, 30) });
  const second = await syncDevice(repository, {
    claims: CLAIMS,
    sessions: [session(6, 30, 7, 0)],
    nowMs: at(7, 0),
  });
  assert.equal(second.usage.totalMinutes, 60);
  assert.equal(second.state.locked, true);
  assert.equal(second.state.reason, "outside-window");
});

test("a device that re-uploads the same window does not lose minutes twice", async () => {
  const repository = await setup();
  await syncDevice(repository, { claims: CLAIMS, sessions: [session(6, 0, 6, 30)], nowMs: at(6, 30) });
  const retry = await syncDevice(repository, {
    claims: CLAIMS,
    sessions: [session(6, 0, 6, 30)],
    nowMs: at(6, 31),
  });
  assert.equal(retry.usage.totalMinutes, 30, "overlapping re-upload is merged");
  assert.equal(retry.state.remainingMinutes, 29);
});

test("a parent's one-tap lock reaches the device on its next sync", async () => {
  const repository = await setup();
  const issued = await issueCommand(repository, {
    familyId: FAMILY,
    uid: PARENT,
    deviceId: DEVICE,
    type: "lock",
    note: "吃飯了",
    nowMs: at(6, 10),
  }, { newId: idFactory("cmd") });
  assert.equal(issued.state.locked, true);
  assert.equal(issued.state.reason, "manual-lock");

  const sync = await syncDevice(repository, { claims: CLAIMS, nowMs: at(6, 11) });
  assert.equal(sync.state.locked, true);
  assert.equal(sync.commands.length, 1);
  assert.equal(sync.commands[0].type, "lock");

  const confirmed = await confirmCommand(repository, {
    claims: CLAIMS,
    commandId: sync.commands[0].commandId,
    nowMs: at(6, 11),
  });
  assert.equal(confirmed.command.status, "acknowledged");
  assert.equal(confirmed.state.locked, true, "the lock survives acknowledgement");

  const later = await syncDevice(repository, { claims: CLAIMS, nowMs: at(6, 20) });
  assert.equal(later.state.locked, true);
  assert.equal(later.commands.length, 0, "an acknowledged command is not re-delivered");
});

test("sync hands the device the override so an offline phone stays locked", async () => {
  const repository = await setup();
  await issueCommand(repository, {
    familyId: FAMILY,
    uid: PARENT,
    deviceId: DEVICE,
    type: "lock",
    nowMs: at(5, 50),
  }, { newId: idFactory("cmd") });
  const sync = await syncDevice(repository, { claims: CLAIMS, nowMs: at(5, 51) });
  assert.equal(sync.override.type, "lock");

  // The phone loses connectivity and re-evaluates locally once the 06:00
  // window opens. Without the cached override it would unlock itself.
  const offline = evaluateDeviceState({
    policy: sync.policy,
    usedMinutes: 0,
    override: sync.override,
    nowMs: at(6, 15),
  });
  assert.equal(offline.locked, true);
  assert.equal(offline.reason, "manual-lock");
});

test("a temporary unlock lets the child back in, then lapses", async () => {
  const repository = await setup();
  await issueCommand(repository, {
    familyId: FAMILY,
    uid: PARENT,
    deviceId: DEVICE,
    type: "unlock",
    minutes: 20,
    nowMs: at(20, 0),
  }, { newId: idFactory("cmd") });

  const during = await syncDevice(repository, { claims: CLAIMS, nowMs: at(20, 5) });
  assert.equal(during.state.locked, false);
  assert.equal(during.state.reason, "manual-unlock");

  const after = await syncDevice(repository, { claims: CLAIMS, nowMs: at(20, 25) });
  assert.equal(after.state.locked, true);
  assert.equal(after.state.reason, "outside-window");
});

test("an approved extension immediately widens today's quota", async () => {
  const repository = await setup();
  await syncDevice(repository, { claims: CLAIMS, sessions: [session(6, 0, 6, 55)], nowMs: at(6, 55) });

  const asked = await requestExtension(repository, {
    claims: CLAIMS,
    minutes: 30,
    reason: "英文作業還沒交",
    nowMs: at(6, 56),
  }, { newId: idFactory("req") });
  assert.equal(asked.request.status, "pending");
  assert.equal(repository._notifications().length, 1);

  const inbox = await loadDashboard(repository, { familyId: FAMILY, uid: PARENT, nowMs: at(6, 57) });
  assert.equal(inbox.children[0].pendingRequests.length, 1);

  const decided = await decideRequest(repository, {
    familyId: FAMILY,
    uid: PARENT,
    requestId: asked.request.requestId,
    decision: "approved",
    grantedMinutes: 15,
    nowMs: at(6, 57),
  });
  assert.equal(decided.request.grantedMinutes, 15);
  assert.equal(decided.state.quotaMinutes, 75);

  const sync = await syncDevice(repository, { claims: CLAIMS, nowMs: at(6, 58) });
  assert.equal(sync.state.locked, false);
  assert.equal(sync.state.quotaMinutes, 75);
  assert.equal(sync.requests.length, 0, "the decided request left the inbox");
});

test("a denied extension leaves the quota untouched", async () => {
  const repository = await setup();
  const asked = await requestExtension(repository, {
    claims: CLAIMS,
    minutes: 30,
    nowMs: at(6, 50),
  }, { newId: idFactory("req") });
  const decided = await decideRequest(repository, {
    familyId: FAMILY,
    uid: PARENT,
    requestId: asked.request.requestId,
    decision: "denied",
    decisionNote: "明天再說",
    nowMs: at(6, 51),
  });
  assert.equal(decided.request.status, "denied");
  assert.equal(decided.state.quotaMinutes, 60);
});

test("unanswered requests expire instead of lingering", async () => {
  const repository = await setup();
  const asked = await requestExtension(repository, {
    claims: CLAIMS,
    minutes: 30,
    nowMs: at(6, 0),
  }, { newId: idFactory("req") });
  const swept = await expireStaleRequests(repository, {
    familyId: FAMILY,
    childId: CHILD,
    dateKey: "2026-08-17",
    nowMs: at(8, 0),
  });
  assert.equal(swept.expired.length, 1);
  assert.equal(swept.expired[0].requestId, asked.request.requestId);
  await assert.rejects(
    decideRequest(repository, {
      familyId: FAMILY,
      uid: PARENT,
      requestId: asked.request.requestId,
      decision: "approved",
      nowMs: at(8, 1),
    }),
    /extension-request-not-pending/,
  );
});

test("changing the schedule re-evaluates enrolled devices right away", async () => {
  const repository = await setup();
  await syncDevice(repository, { claims: CLAIMS, sessions: [session(6, 0, 6, 30)], nowMs: at(6, 30) });

  await updatePolicy(repository, {
    familyId: FAMILY,
    uid: PARENT,
    childId: CHILD,
    policy: { ...MORNING_POLICY, dailyQuotaMinutes: 20 },
    nowMs: at(6, 31),
  });
  const device = await repository.loadDevice(FAMILY, DEVICE);
  assert.equal(device.state.locked, true);
  assert.equal(device.state.reason, "quota-exhausted");
});

test("the dashboard reports usage, trend, devices, and compliance", async () => {
  const repository = await setup();
  await syncDevice(repository, {
    claims: CLAIMS,
    sessions: [session(6, 0, 6, 40), session(6, 40, 7, 0, "line")],
    platform: "android",
    nowMs: at(7, 0),
  });

  const dashboard = await loadDashboard(repository, {
    familyId: FAMILY,
    uid: PARENT,
    nowMs: at(9, 0),
    days: 7,
  });
  const card = dashboard.children[0];
  assert.equal(dashboard.familyName, "示範家庭");
  assert.equal(card.displayName, "小明");
  assert.equal(card.today.totalMinutes, 60);
  assert.equal(card.today.byApp.length, 2);
  assert.equal(card.state.locked, true);
  assert.equal(card.state.reason, "outside-window");
  assert.equal(card.remainingMinutesToday, 0);
  assert.equal(card.range.dayCount, 7);
  assert.equal(card.range.totalMinutes, 60);
  assert.equal(card.devices[0].platform, "android");
  assert.equal(card.devices[0].online, false, "last seen two hours ago");
  assert.equal(card.compliance.at(-1).withinQuota, true);
  assert.equal(card.timeline[0].start, "06:00");
});

test("the dashboard surfaces commands the device never picked up", async () => {
  const repository = await setup();
  await issueCommand(repository, {
    familyId: FAMILY,
    uid: PARENT,
    deviceId: DEVICE,
    type: "lock",
    nowMs: at(6, 0),
  }, { newId: idFactory("cmd") });
  const dashboard = await loadDashboard(repository, { familyId: FAMILY, uid: PARENT, nowMs: at(6, 30) });
  assert.equal(dashboard.undeliveredCommands.length, 1);
});

test("only enrolled parents may read or act on a family", async () => {
  const repository = await setup();
  await assert.rejects(
    loadDashboard(repository, { familyId: FAMILY, uid: "stranger", nowMs: at(9, 0) }),
    /parent-required/,
  );
  await assert.rejects(
    issueCommand(repository, {
      familyId: FAMILY,
      uid: "stranger",
      deviceId: DEVICE,
      type: "lock",
      nowMs: at(9, 0),
    }, { newId: idFactory("cmd") }),
    /parent-required/,
  );
  await assert.rejects(
    loadDashboard(repository, { familyId: "family-2", uid: PARENT, nowMs: at(9, 0) }),
    /family-not-found/,
  );
});

test("device calls are rejected once the device is unenrolled or mismatched", async () => {
  const repository = await setup();
  await assert.rejects(
    syncDevice(repository, { claims: { ...CLAIMS, deviceId: "device-9" }, nowMs: at(6, 0) }),
    /device-not-enrolled/,
  );
  await assert.rejects(
    syncDevice(repository, { claims: { ...CLAIMS, childId: "child-9" }, nowMs: at(6, 0) }),
    /device-child-mismatch/,
  );

  const device = await repository.loadDevice(FAMILY, DEVICE);
  await repository.saveDevice(FAMILY, DEVICE, { ...device, revoked: true });
  await assert.rejects(syncDevice(repository, { claims: CLAIMS, nowMs: at(6, 0) }), /device-revoked/);
});

test("a child cannot open unlimited requests", async () => {
  const repository = await setup();
  const newId = idFactory("req");
  for (let index = 0; index < 5; index += 1) {
    await requestExtension(repository, { claims: CLAIMS, minutes: 10, nowMs: at(6, index) }, { newId });
  }
  await assert.rejects(
    requestExtension(repository, { claims: CLAIMS, minutes: 10, nowMs: at(6, 10) }, { newId }),
    /too-many-open-requests/,
  );
});

test("parent actions are written to the family audit log", async () => {
  const repository = await setup();
  await issueCommand(repository, {
    familyId: FAMILY,
    uid: PARENT,
    deviceId: DEVICE,
    type: "lock",
    nowMs: at(6, 0),
  }, { newId: idFactory("cmd") });
  const kinds = repository._audit().map((entry) => entry.kind);
  assert.deepEqual(kinds, ["policy:update", "command:lock"]);
  assert.equal(repository._audit()[1].actorUid, PARENT);
});
