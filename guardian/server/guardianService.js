import {
  acknowledgeCommand,
  applyCommand,
  createCommand,
  isCommandStale,
  pruneOverride,
} from "../domain/commands.js";
import {
  bonusMinutesForDate,
  canOpenRequest,
  createExtensionRequest,
  decideExtensionRequest,
  expireRequest,
  pendingRequests,
} from "../domain/extension.js";
import { evaluateDeviceState, dayTimeline, remainingMinutesToday } from "../domain/policy.js";
import { DEFAULT_POLICY, POLICY_FIELDS, normalizePolicy } from "../domain/schedule.js";
import { addLocalDays, dateKeyOf, isInstant } from "../domain/time.js";
import { normalizeSessions, quotaComplianceForDay, summarizeDay, summarizeRange } from "../domain/usage.js";

const ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;
export const MAX_HISTORY_DAYS = 31;

function isId(value) {
  return typeof value === "string" && ID_PATTERN.test(value);
}

function invalidArgument() {
  throw new Error("invalid-argument");
}

function requireInstant(nowMs) {
  if (!isInstant(nowMs)) invalidArgument();
  return nowMs;
}

/**
 * A parent must be listed on the family document. Membership is the only
 * authorization fact the service trusts; callables never take a familyId from
 * the client without checking it here.
 */
export async function requireParent(repository, { familyId, uid }) {
  if (!isId(familyId) || !isId(uid)) invalidArgument();
  const family = await repository.loadFamily(familyId);
  if (!family) throw new Error("family-not-found");
  if (!Array.isArray(family.parentUids) || !family.parentUids.includes(uid)) {
    throw new Error("parent-required");
  }
  return family;
}

/**
 * A device presents claims minted at enrollment. The device may only ever act
 * for its own child, and is rejected once the parent unenrolls it.
 */
export async function requireDevice(repository, claims) {
  const { familyId, childId, deviceId } = claims ?? {};
  if (!isId(familyId) || !isId(childId) || !isId(deviceId)) throw new Error("device-auth-required");
  const device = await repository.loadDevice(familyId, deviceId);
  if (!device) throw new Error("device-not-enrolled");
  if (device.childId !== childId) throw new Error("device-child-mismatch");
  if (device.revoked === true) throw new Error("device-revoked");
  return device;
}

/**
 * Stored policy documents also carry audit metadata (who changed the schedule
 * and when), which the strict domain validator must not see.
 */
function policyFieldsOf(document) {
  const picked = {};
  for (const field of POLICY_FIELDS) {
    if (document[field] !== undefined) picked[field] = document[field];
  }
  return picked;
}

async function effectivePolicy(repository, familyId, childId) {
  const stored = await repository.loadPolicy(familyId, childId);
  return normalizePolicy(stored ? policyFieldsOf(stored) : structuredClone(DEFAULT_POLICY));
}

async function overrideFromPendingCommands(repository, { familyId, deviceId, override, nowMs }) {
  const commands = await repository.loadPendingCommands(familyId, deviceId);
  const ordered = [...commands].sort((left, right) => left.issuedAtMs - right.issuedAtMs);
  let next = pruneOverride(override, nowMs);
  for (const command of ordered) next = applyCommand(next, command);
  return { override: next, commands: ordered };
}

/**
 * Recomputes and stores a device's verdict. Both the device sync and any parent
 * action funnel through here so the stored state never drifts from the inputs.
 */
async function refreshDeviceState(repository, { familyId, childId, deviceId, nowMs }) {
  const policy = await effectivePolicy(repository, familyId, childId);
  const dateKey = dateKeyOf(nowMs, policy.timeZone);
  const device = await repository.loadDevice(familyId, deviceId);
  const [sessions, requests, resolved] = await Promise.all([
    repository.loadSessions(familyId, childId, [dateKey]),
    repository.loadRequests(familyId, childId, [dateKey]),
    overrideFromPendingCommands(repository, {
      familyId,
      deviceId,
      override: device?.override ?? null,
      nowMs,
    }),
  ]);
  const summary = summarizeDay({ sessions, timeZone: policy.timeZone, dateKey });
  const state = evaluateDeviceState({
    policy,
    usedMinutes: summary.totalMinutes,
    bonusMinutes: bonusMinutesForDate(requests, dateKey),
    override: resolved.override,
    nowMs,
  });
  await repository.saveDevice(familyId, deviceId, {
    ...device,
    childId,
    override: resolved.override,
    state,
    lastEvaluatedAtMs: nowMs,
  });
  return {
    policy,
    state,
    summary,
    dateKey,
    commands: resolved.commands,
    override: resolved.override,
  };
}

/**
 * Device heartbeat: uploads foreground sessions, then receives the policy, the
 * current verdict, and any commands waiting for it. The device enforces the
 * verdict locally, so a child who goes offline stays locked.
 */
export async function syncDevice(repository, {
  claims,
  sessions = [],
  appVersion = null,
  platform = null,
  nowMs,
}) {
  requireInstant(nowMs);
  const device = await requireDevice(repository, claims);
  const { familyId, childId, deviceId } = claims;
  const uploaded = normalizeSessions(sessions);
  const policy = await effectivePolicy(repository, familyId, childId);
  if (uploaded.length > 0) {
    await repository.appendSessions(familyId, childId, uploaded, policy.timeZone);
  }

  const refreshed = await refreshDeviceState(repository, { familyId, childId, deviceId, nowMs });
  await repository.saveDevice(familyId, deviceId, {
    ...(await repository.loadDevice(familyId, deviceId)),
    childId,
    platform: platform ?? device.platform ?? null,
    appVersion: appVersion ?? device.appVersion ?? null,
    lastSeenAtMs: nowMs,
  });

  const requests = await repository.loadRequests(familyId, childId, [refreshed.dateKey]);
  return Object.freeze({
    state: refreshed.state,
    policy: refreshed.policy,
    usage: refreshed.summary,
    commands: refreshed.commands,
    // The device caches this so an offline re-evaluation still honours a
    // parent's standing lock instead of unlocking itself.
    override: refreshed.override,
    requests: pendingRequests(requests, nowMs),
    serverTimeMs: nowMs,
  });
}

/** The device confirms it applied a command, closing the loop for the parent. */
export async function confirmCommand(repository, { claims, commandId, nowMs }) {
  requireInstant(nowMs);
  await requireDevice(repository, claims);
  const { familyId, deviceId, childId } = claims;
  const command = await repository.loadCommand(familyId, commandId);
  if (!command) throw new Error("command-not-found");
  const acknowledged = acknowledgeCommand(command, { deviceId, acknowledgedAtMs: nowMs });
  await repository.saveCommand(familyId, acknowledged);
  const refreshed = await refreshDeviceState(repository, { familyId, childId, deviceId, nowMs });
  return Object.freeze({ command: acknowledged, state: refreshed.state });
}

/** Parent action: lock now, unlock for N minutes, or ask the device to resync. */
export async function issueCommand(repository, {
  familyId,
  uid,
  deviceId,
  type,
  minutes = null,
  note = null,
  nowMs,
}, { newId }) {
  requireInstant(nowMs);
  await requireParent(repository, { familyId, uid });
  const device = await repository.loadDevice(familyId, deviceId);
  if (!device) throw new Error("device-not-enrolled");

  const command = createCommand({
    commandId: newId(),
    type,
    deviceId,
    childId: device.childId,
    issuedByUid: uid,
    issuedAtMs: nowMs,
    minutes: type === "unlock" ? minutes : null,
    note,
  });
  await repository.saveCommand(familyId, command);
  await repository.appendAudit(familyId, {
    kind: `command:${type}`,
    actorUid: uid,
    childId: device.childId,
    deviceId,
    atMs: nowMs,
    detail: { commandId: command.commandId, minutes: command.minutes, note: command.note },
  });

  const refreshed = await refreshDeviceState(repository, {
    familyId,
    childId: device.childId,
    deviceId,
    nowMs,
  });
  return Object.freeze({ command, state: refreshed.state });
}

/** Parent action: replace a child's schedule. */
export async function updatePolicy(repository, { familyId, uid, childId, policy, nowMs }) {
  requireInstant(nowMs);
  await requireParent(repository, { familyId, uid });
  if (!isId(childId)) invalidArgument();
  const normalized = normalizePolicy(policy);
  const stored = {
    timeZone: normalized.timeZone,
    dailyQuotaMinutes: normalized.dailyQuotaMinutes,
    windows: Object.fromEntries(
      Object.entries(normalized.windows)
        .map(([weekday, windows]) => [
          weekday,
          windows.map((window) => ({ start: window.start, end: window.end })),
        ]),
    ),
    bedtime: normalized.bedtime
      ? { start: normalized.bedtime.start, end: normalized.bedtime.end }
      : null,
    allowlist: [...normalized.allowlist],
    paused: normalized.paused,
    updatedAtMs: nowMs,
    updatedByUid: uid,
  };
  await repository.savePolicy(familyId, childId, stored);
  await repository.appendAudit(familyId, {
    kind: "policy:update",
    actorUid: uid,
    childId,
    atMs: nowMs,
    detail: { dailyQuotaMinutes: normalized.dailyQuotaMinutes, paused: normalized.paused },
  });

  const devices = await repository.loadDevicesForChild(familyId, childId);
  for (const device of devices) {
    await refreshDeviceState(repository, { familyId, childId, deviceId: device.deviceId, nowMs });
  }
  return Object.freeze({ policy: normalized });
}

/** Child action: ask for extra minutes today. */
export async function requestExtension(repository, { claims, minutes, reason, nowMs }, { newId }) {
  requireInstant(nowMs);
  await requireDevice(repository, claims);
  const { familyId, childId, deviceId } = claims;
  const policy = await effectivePolicy(repository, familyId, childId);
  const dateKey = dateKeyOf(nowMs, policy.timeZone);
  const existing = await repository.loadRequests(familyId, childId, [dateKey]);
  if (!canOpenRequest(existing, dateKey, nowMs)) throw new Error("too-many-open-requests");

  const request = createExtensionRequest({
    requestId: newId(),
    childId,
    deviceId,
    dateKey,
    minutes,
    reason,
    createdAtMs: nowMs,
  });
  await repository.saveRequest(familyId, request);
  await repository.notifyParents(familyId, {
    kind: "extension-requested",
    childId,
    requestId: request.requestId,
    minutes: request.minutes,
    reason: request.reason,
    atMs: nowMs,
  });
  return Object.freeze({ request });
}

/** Parent action: approve (optionally trimming minutes) or deny a request. */
export async function decideRequest(repository, {
  familyId,
  uid,
  requestId,
  decision,
  grantedMinutes = null,
  decisionNote = null,
  nowMs,
}) {
  requireInstant(nowMs);
  await requireParent(repository, { familyId, uid });
  const request = await repository.loadRequest(familyId, requestId);
  if (!request) throw new Error("extension-request-not-found");

  const sameDay = await repository.loadRequests(familyId, request.childId, [request.dateKey]);
  const decided = decideExtensionRequest(request, {
    decision,
    decidedByUid: uid,
    decidedAtMs: nowMs,
    grantedMinutes,
    decisionNote,
    bonusAlreadyGrantedMinutes: bonusMinutesForDate(sameDay, request.dateKey),
  });
  await repository.saveRequest(familyId, decided);
  await repository.appendAudit(familyId, {
    kind: `extension:${decision}`,
    actorUid: uid,
    childId: request.childId,
    atMs: nowMs,
    detail: { requestId, grantedMinutes: decided.grantedMinutes },
  });

  const refreshed = await refreshDeviceState(repository, {
    familyId,
    childId: request.childId,
    deviceId: request.deviceId,
    nowMs,
  });
  return Object.freeze({ request: decided, state: refreshed.state });
}

/** Sweeps pending requests the parent never answered. */
export async function expireStaleRequests(repository, { familyId, childId, dateKey, nowMs }) {
  requireInstant(nowMs);
  const requests = await repository.loadRequests(familyId, childId, [dateKey]);
  const expired = [];
  for (const request of requests) {
    const next = expireRequest(request, nowMs);
    if (next !== request) {
      await repository.saveRequest(familyId, next);
      expired.push(next);
    }
  }
  return Object.freeze({ expired });
}

export const PAIRING_CODE_TTL_MS = 15 * 60 * 1000;
const PAIRING_CODE_PATTERN = /^\d{6}$/;

/**
 * Parent action: mint a short-lived pairing code. The child's phone redeems it
 * once, which is the only way a device can ever join a family.
 */
export async function createPairingCode(repository, { familyId, uid, childId, nowMs }, { newCode }) {
  requireInstant(nowMs);
  await requireParent(repository, { familyId, uid });
  if (!isId(childId)) invalidArgument();
  const children = await repository.loadChildren(familyId);
  if (!children.some((child) => child.childId === childId)) throw new Error("child-not-found");

  const code = newCode();
  if (typeof code !== "string" || !PAIRING_CODE_PATTERN.test(code)) invalidArgument();
  const pairing = Object.freeze({
    code,
    familyId,
    childId,
    createdByUid: uid,
    createdAtMs: nowMs,
    expiresAtMs: nowMs + PAIRING_CODE_TTL_MS,
    redeemedAtMs: null,
    deviceId: null,
  });
  await repository.savePairing(pairing);
  await repository.appendAudit(familyId, {
    kind: "device:pairing-created",
    actorUid: uid,
    childId,
    atMs: nowMs,
    detail: { expiresAtMs: pairing.expiresAtMs },
  });
  return Object.freeze({ code, expiresAtMs: pairing.expiresAtMs });
}

/**
 * Child device action: redeem a pairing code and become an enrolled device.
 * Returns the claims the caller should mint into the device's auth token.
 */
export async function redeemPairingCode(repository, {
  code,
  platform,
  deviceName = null,
  nowMs,
}, { newId }) {
  requireInstant(nowMs);
  if (typeof code !== "string" || !PAIRING_CODE_PATTERN.test(code)) throw new Error("invalid-pairing-code");
  if (!["ios", "android"].includes(platform)) invalidArgument();
  const pairing = await repository.loadPairing(code);
  if (!pairing) throw new Error("invalid-pairing-code");
  if (pairing.redeemedAtMs !== null) throw new Error("pairing-code-used");
  if (nowMs >= pairing.expiresAtMs) throw new Error("pairing-code-expired");

  const deviceId = newId();
  await repository.saveDevice(pairing.familyId, deviceId, {
    deviceId,
    childId: pairing.childId,
    platform,
    deviceName: typeof deviceName === "string" ? deviceName.slice(0, 80) : null,
    enrolledAtMs: nowMs,
    lastSeenAtMs: nowMs,
    override: null,
    revoked: false,
  });
  await repository.savePairing({ ...pairing, redeemedAtMs: nowMs, deviceId });
  await repository.appendAudit(pairing.familyId, {
    kind: "device:enrolled",
    actorUid: pairing.createdByUid,
    childId: pairing.childId,
    deviceId,
    atMs: nowMs,
    detail: { platform },
  });
  return Object.freeze({
    familyId: pairing.familyId,
    childId: pairing.childId,
    deviceId,
  });
}

/**
 * Parent action: cut a device loose. Revocation is a flag rather than a delete
 * so the usage history the parent already saw stays readable.
 */
export async function revokeDevice(repository, { familyId, uid, deviceId, nowMs }) {
  requireInstant(nowMs);
  await requireParent(repository, { familyId, uid });
  const device = await repository.loadDevice(familyId, deviceId);
  if (!device) throw new Error("device-not-enrolled");
  await repository.saveDevice(familyId, deviceId, { ...device, revoked: true, revokedAtMs: nowMs });
  await repository.appendAudit(familyId, {
    kind: "device:revoked",
    actorUid: uid,
    childId: device.childId,
    deviceId,
    atMs: nowMs,
    detail: {},
  });
  return Object.freeze({ deviceId, revoked: true });
}

function dateKeysBack(nowMs, timeZone, days) {
  const keys = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    keys.push(dateKeyOf(addLocalDays(nowMs, timeZone, -offset), timeZone));
  }
  return keys;
}

/**
 * Everything the parent dashboard renders in one read: per-child verdict,
 * today's detail, the trailing range, devices, and the request inbox.
 */
export async function loadDashboard(repository, { familyId, uid, nowMs, days = 7 }) {
  requireInstant(nowMs);
  const family = await requireParent(repository, { familyId, uid });
  if (!Number.isInteger(days) || days < 1 || days > MAX_HISTORY_DAYS) invalidArgument();
  const children = await repository.loadChildren(familyId);

  const cards = [];
  for (const child of children) {
    const policy = await effectivePolicy(repository, familyId, child.childId);
    const dateKeys = dateKeysBack(nowMs, policy.timeZone, days);
    const todayKey = dateKeys[dateKeys.length - 1];
    const [sessions, requests, devices] = await Promise.all([
      repository.loadSessions(familyId, child.childId, dateKeys),
      repository.loadRequests(familyId, child.childId, dateKeys),
      repository.loadDevicesForChild(familyId, child.childId),
    ]);

    const daySummaries = dateKeys.map((dateKey) =>
      summarizeDay({ sessions, timeZone: policy.timeZone, dateKey }));
    const today = daySummaries[daySummaries.length - 1];
    const bonusMinutes = bonusMinutesForDate(requests, todayKey);
    const state = evaluateDeviceState({
      policy,
      usedMinutes: today.totalMinutes,
      bonusMinutes,
      override: pruneOverride(devices[0]?.override ?? null, nowMs),
      nowMs,
    });

    cards.push(Object.freeze({
      childId: child.childId,
      displayName: child.displayName,
      avatarColor: child.avatarColor ?? null,
      policy,
      state,
      today,
      timeline: dayTimeline({ policy, nowMs }),
      remainingMinutesToday: remainingMinutesToday({
        policy,
        usedMinutes: today.totalMinutes,
        bonusMinutes,
        nowMs,
      }),
      range: summarizeRange(daySummaries),
      compliance: daySummaries.map((day) =>
        quotaComplianceForDay(day, policy.dailyQuotaMinutes)),
      devices: devices.map((device) => Object.freeze({
        deviceId: device.deviceId,
        platform: device.platform ?? null,
        appVersion: device.appVersion ?? null,
        lastSeenAtMs: device.lastSeenAtMs ?? null,
        online: typeof device.lastSeenAtMs === "number"
          && nowMs - device.lastSeenAtMs < 10 * 60 * 1000,
        override: pruneOverride(device.override ?? null, nowMs),
      })),
      pendingRequests: pendingRequests(requests, nowMs),
    }));
  }

  const staleCommands = (await repository.loadRecentCommands(familyId, 20))
    .filter((command) => isCommandStale(command, nowMs));

  return Object.freeze({
    familyId,
    familyName: family.name ?? null,
    generatedAtMs: nowMs,
    children: Object.freeze(cards),
    undeliveredCommands: Object.freeze(staleCommands),
  });
}
