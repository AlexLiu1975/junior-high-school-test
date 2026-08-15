import { splitByLocalDay } from "../domain/usage.js";

function clone(value) {
  return value === null || value === undefined ? value : structuredClone(value);
}

/**
 * Repository backed by plain maps. The service layer is written against this
 * interface, which lets the whole backend run in tests and in the dashboard's
 * demo mode without Firestore. `firestoreRepository.js` implements the same
 * shape against the real database.
 */
export function createMemoryRepository(seed = {}) {
  const families = new Map(Object.entries(seed.families ?? {}));
  const children = new Map(Object.entries(seed.children ?? {}));
  const policies = new Map(Object.entries(seed.policies ?? {}));
  const devices = new Map(Object.entries(seed.devices ?? {}));
  const commands = new Map(Object.entries(seed.commands ?? {}));
  const requests = new Map(Object.entries(seed.requests ?? {}));
  const pairings = new Map(Object.entries(seed.pairings ?? {}));
  // key: `${familyId}/${childId}/${dateKey}` -> session slices for that day
  const sessions = new Map();
  const audit = [];
  const notifications = [];

  const key = (...parts) => parts.join("/");

  return {
    async loadFamily(familyId) {
      return clone(families.get(familyId) ?? null);
    },
    async saveFamily(familyId, family) {
      families.set(familyId, clone(family));
    },
    async loadChildren(familyId) {
      return [...children.values()]
        .filter((child) => child.familyId === familyId)
        .map(clone)
        .sort((left, right) => left.childId.localeCompare(right.childId));
    },
    async saveChild(familyId, child) {
      children.set(key(familyId, child.childId), clone({ ...child, familyId }));
    },
    async loadPolicy(familyId, childId) {
      return clone(policies.get(key(familyId, childId)) ?? null);
    },
    async savePolicy(familyId, childId, policy) {
      policies.set(key(familyId, childId), clone(policy));
    },
    async loadDevice(familyId, deviceId) {
      return clone(devices.get(key(familyId, deviceId)) ?? null);
    },
    async saveDevice(familyId, deviceId, device) {
      devices.set(key(familyId, deviceId), clone({ ...device, deviceId, familyId }));
    },
    async loadDevicesForChild(familyId, childId) {
      return [...devices.values()]
        .filter((device) => device.familyId === familyId && device.childId === childId)
        .map(clone)
        .sort((left, right) => left.deviceId.localeCompare(right.deviceId));
    },
    async appendSessions(familyId, childId, normalizedSessions, timeZone) {
      for (const slice of splitByLocalDay(normalizedSessions, timeZone)) {
        const bucketKey = key(familyId, childId, slice.dateKey);
        const bucket = sessions.get(bucketKey) ?? [];
        bucket.push({
          appId: slice.appId,
          appName: slice.appName,
          category: slice.category,
          startMs: slice.startMs,
          endMs: slice.endMs,
        });
        sessions.set(bucketKey, bucket);
      }
    },
    async loadSessions(familyId, childId, dateKeys) {
      return dateKeys.flatMap((dateKey) => clone(sessions.get(key(familyId, childId, dateKey)) ?? []));
    },
    async loadCommand(familyId, commandId) {
      return clone(commands.get(key(familyId, commandId)) ?? null);
    },
    async saveCommand(familyId, command) {
      commands.set(key(familyId, command.commandId), clone(command));
    },
    async loadPendingCommands(familyId, deviceId) {
      return [...commands.values()]
        .filter((command) => command.deviceId === deviceId && command.status === "pending")
        .map(clone);
    },
    async loadRecentCommands(familyId, limit) {
      return [...commands.values()]
        .sort((left, right) => right.issuedAtMs - left.issuedAtMs)
        .slice(0, limit)
        .map(clone);
    },
    async loadRequest(familyId, requestId) {
      return clone(requests.get(key(familyId, requestId)) ?? null);
    },
    async saveRequest(familyId, request) {
      requests.set(key(familyId, request.requestId), clone(request));
    },
    async loadRequests(familyId, childId, dateKeys) {
      const wanted = new Set(dateKeys);
      return [...requests.values()]
        .filter((request) => request.childId === childId && wanted.has(request.dateKey))
        .map(clone)
        .sort((left, right) => left.createdAtMs - right.createdAtMs);
    },
    async loadPairing(code) {
      return clone(pairings.get(code) ?? null);
    },
    async savePairing(pairing) {
      pairings.set(pairing.code, clone(pairing));
    },
    async appendAudit(familyId, entry) {
      audit.push(clone({ ...entry, familyId }));
    },
    async notifyParents(familyId, notification) {
      notifications.push(clone({ ...notification, familyId }));
    },

    // Test and demo helpers — not part of the production repository contract.
    _audit: () => audit.map(clone),
    _notifications: () => notifications.map(clone),
  };
}

/** A ready-to-use family: one parent, one child, one enrolled Android phone. */
export function seedDemoFamily({
  familyId = "family-1",
  parentUid = "parent-1",
  childId = "child-1",
  deviceId = "device-1",
} = {}) {
  return createMemoryRepository({
    families: {
      [familyId]: { familyId, name: "示範家庭", parentUids: [parentUid] },
    },
    children: {
      [`${familyId}/${childId}`]: {
        familyId,
        childId,
        displayName: "小明",
        avatarColor: "#4f7df0",
      },
    },
    devices: {
      [`${familyId}/${deviceId}`]: {
        familyId,
        deviceId,
        childId,
        platform: "android",
        appVersion: "1.0.0",
        override: null,
        lastSeenAtMs: null,
      },
    },
  });
}
