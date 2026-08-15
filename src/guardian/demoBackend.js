import { createMemoryRepository } from "../../guardian/server/memoryRepository.js";
import {
  confirmCommand,
  createPairingCode,
  decideRequest,
  issueCommand,
  loadDashboard,
  requestExtension,
  revokeDevice,
  syncDevice,
  updatePolicy,
} from "../../guardian/server/guardianService.js";
import { addLocalDays, dateKeyOf, startOfLocalDay } from "../../guardian/domain/time.js";

const FAMILY_ID = "family-demo";
const PARENT_UID = "parent-demo";
const TIME_ZONE = "Asia/Taipei";

const CHILDREN = [
  { childId: "child-ming", displayName: "小明", avatarColor: "#2a78d6", deviceId: "device-ming", platform: "android" },
  { childId: "child-hua", displayName: "小華", avatarColor: "#1baf7a", deviceId: "device-hua", platform: "ios" },
];

const APP_LIBRARY = [
  { appId: "youtube", appName: "YouTube", category: "video" },
  { appId: "roblox", appName: "Roblox", category: "game" },
  { appId: "line", appName: "LINE", category: "social" },
  { appId: "instagram", appName: "Instagram", category: "social" },
  { appId: "duolingo", appName: "Duolingo", category: "study" },
  { appId: "chrome", appName: "Chrome", category: "tool" },
];

let counter = 0;
const newId = () => {
  counter += 1;
  return `demo-${counter}`;
};
const newCode = () => String(100000 + (counter += 1) % 900000);

/**
 * Deterministic pseudo-random so the demo looks the same on every reload but
 * still varies across days and children.
 */
function seededRandom(seed) {
  let value = seed % 2147483647;
  if (value <= 0) value += 2147483646;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

function buildDaySessions(dayStartMs, seed) {
  const random = seededRandom(seed);
  const sessions = [];
  const blocks = [
    { hour: 6, maxMinutes: 55 },
    { hour: 12, maxMinutes: 35 },
    { hour: 17, maxMinutes: 50 },
    { hour: 20, maxMinutes: 45 },
  ];
  for (const block of blocks) {
    if (random() < 0.25) continue;
    let cursor = dayStartMs + (block.hour * 60 + Math.floor(random() * 20)) * 60000;
    let budget = Math.round(block.maxMinutes * (0.4 + random() * 0.6));
    while (budget > 5) {
      const app = APP_LIBRARY[Math.floor(random() * APP_LIBRARY.length)];
      const minutes = Math.min(budget, 5 + Math.floor(random() * 25));
      sessions.push({
        appId: app.appId,
        appName: app.appName,
        category: app.category,
        startMs: cursor,
        endMs: cursor + minutes * 60000,
      });
      cursor += minutes * 60000;
      budget -= minutes;
    }
  }
  return sessions;
}

/**
 * A fully wired backend running in the browser: the same domain and service
 * code the Cloud Functions run, against an in-memory repository. It lets the
 * dashboard be explored — including locking, approving and editing schedules —
 * before any Firebase project exists.
 */
export function createDemoBackend(nowMs = Date.now()) {
  const repository = createMemoryRepository({
    families: {
      [FAMILY_ID]: { familyId: FAMILY_ID, name: "示範家庭", parentUids: [PARENT_UID] },
    },
  });

  const ready = (async () => {
    for (const child of CHILDREN) {
      await repository.saveChild(FAMILY_ID, {
        childId: child.childId,
        displayName: child.displayName,
        avatarColor: child.avatarColor,
      });
      await repository.saveDevice(FAMILY_ID, child.deviceId, {
        deviceId: child.deviceId,
        childId: child.childId,
        platform: child.platform,
        deviceName: `${child.displayName}的手機`,
        appVersion: "1.0.0",
        override: null,
        lastSeenAtMs: nowMs - 2 * 60000,
        revoked: false,
      });
      await updatePolicy(repository, {
        familyId: FAMILY_ID,
        uid: PARENT_UID,
        childId: child.childId,
        nowMs,
        policy: {
          timeZone: TIME_ZONE,
          dailyQuotaMinutes: child.childId === "child-ming" ? 60 : 90,
          windows: {
            0: [{ start: "09:00", end: "11:00" }, { start: "15:00", end: "17:00" }],
            1: [{ start: "06:00", end: "07:00" }, { start: "19:00", end: "20:00" }],
            2: [{ start: "06:00", end: "07:00" }, { start: "19:00", end: "20:00" }],
            3: [{ start: "06:00", end: "07:00" }, { start: "19:00", end: "20:00" }],
            4: [{ start: "06:00", end: "07:00" }, { start: "19:00", end: "20:00" }],
            5: [{ start: "06:00", end: "07:00" }, { start: "19:00", end: "21:00" }],
            6: [{ start: "09:00", end: "11:00" }, { start: "15:00", end: "17:00" }],
          },
          bedtime: { start: "22:00", end: "05:30" },
          allowlist: ["phone", "messages", "emergency-sos"],
          paused: false,
        },
      });

      // Two weeks of history, plus today's usage up to the current minute.
      for (let offset = 13; offset >= 0; offset -= 1) {
        const dayStart = startOfLocalDay(addLocalDays(nowMs, TIME_ZONE, -offset), TIME_ZONE);
        const seed = dayStart / 60000 + child.childId.length * 7919;
        const sessions = buildDaySessions(dayStart, seed)
          .filter((session) => session.endMs < nowMs);
        if (sessions.length > 0) {
          await repository.appendSessions(FAMILY_ID, child.childId, sessions, TIME_ZONE);
        }
      }
    }

    // One pending request waiting in the parent's inbox.
    await requestExtension(repository, {
      claims: {
        familyId: FAMILY_ID,
        childId: CHILDREN[0].childId,
        deviceId: CHILDREN[0].deviceId,
      },
      minutes: 30,
      reason: "想把英文作業的影片看完",
      nowMs: nowMs - 4 * 60000,
    }, { newId });
  })();

  const withReady = (operation) => async (...args) => {
    await ready;
    return operation(...args);
  };

  return {
    mode: "demo",
    familyId: FAMILY_ID,
    uid: PARENT_UID,
    timeZone: TIME_ZONE,
    todayKey: () => dateKeyOf(Date.now(), TIME_ZONE),
    loadDashboard: withReady((days = 7) =>
      loadDashboard(repository, { familyId: FAMILY_ID, uid: PARENT_UID, days, nowMs: Date.now() })),
    issueCommand: withReady((deviceId, type, options = {}) =>
      issueCommand(repository, {
        familyId: FAMILY_ID,
        uid: PARENT_UID,
        deviceId,
        type,
        minutes: options.minutes ?? null,
        note: options.note ?? null,
        nowMs: Date.now(),
      }, { newId })),
    updatePolicy: withReady((childId, policy) =>
      updatePolicy(repository, {
        familyId: FAMILY_ID,
        uid: PARENT_UID,
        childId,
        policy,
        nowMs: Date.now(),
      })),
    decideRequest: withReady((requestId, decision, options = {}) =>
      decideRequest(repository, {
        familyId: FAMILY_ID,
        uid: PARENT_UID,
        requestId,
        decision,
        grantedMinutes: options.grantedMinutes ?? null,
        decisionNote: options.decisionNote ?? null,
        nowMs: Date.now(),
      })),
    createPairingCode: withReady((childId) =>
      createPairingCode(repository, {
        familyId: FAMILY_ID,
        uid: PARENT_UID,
        childId,
        nowMs: Date.now(),
      }, { newCode })),
    revokeDevice: withReady((deviceId) =>
      revokeDevice(repository, { familyId: FAMILY_ID, uid: PARENT_UID, deviceId, nowMs: Date.now() })),

    /** Lets the demo show a device picking up commands and reporting usage. */
    simulateDeviceSync: withReady(async (childId) => {
      const child = CHILDREN.find((entry) => entry.childId === childId) ?? CHILDREN[0];
      const claims = { familyId: FAMILY_ID, childId: child.childId, deviceId: child.deviceId };
      const result = await syncDevice(repository, { claims, nowMs: Date.now() });
      for (const command of result.commands) {
        await confirmCommand(repository, { claims, commandId: command.commandId, nowMs: Date.now() });
      }
      return result;
    }),
  };
}
