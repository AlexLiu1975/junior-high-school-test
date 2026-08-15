import { MS_PER_MINUTE, isInstant } from "./time.js";

export const COMMAND_TYPES = Object.freeze(["lock", "unlock", "sync"]);
export const MAX_UNLOCK_MINUTES = 240;
export const COMMAND_DELIVERY_TIMEOUT_MS = 5 * 60 * 1000;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;
const MAX_NOTE_LENGTH = 200;

function invalidCommand() {
  throw new Error("invalid-command");
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isId(value) {
  return typeof value === "string" && ID_PATTERN.test(value);
}

function normalizeNote(note) {
  if (note === undefined || note === null || note === "") return null;
  if (typeof note !== "string" || note.length > MAX_NOTE_LENGTH) invalidCommand();
  const trimmed = note.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * Parent-issued command targeted at one device. `lock` holds until the parent
 * lifts it; `unlock` grants a bounded bypass of the schedule; `sync` only asks
 * the device to re-read its policy.
 */
export function createCommand({
  commandId,
  type,
  deviceId,
  childId,
  issuedByUid,
  issuedAtMs,
  minutes,
  note,
}) {
  if (!isId(commandId) || !isId(deviceId) || !isId(childId) || !isId(issuedByUid)) invalidCommand();
  if (!COMMAND_TYPES.includes(type)) invalidCommand();
  if (!isInstant(issuedAtMs)) invalidCommand();
  let unlockMinutes = null;
  if (type === "unlock") {
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > MAX_UNLOCK_MINUTES) invalidCommand();
    unlockMinutes = minutes;
  } else if (minutes !== undefined && minutes !== null) {
    invalidCommand();
  }
  return Object.freeze({
    commandId,
    type,
    deviceId,
    childId,
    issuedByUid,
    issuedAtMs,
    minutes: unlockMinutes,
    note: normalizeNote(note),
    status: "pending",
    deliveredAtMs: null,
    acknowledgedAtMs: null,
  });
}

export function acknowledgeCommand(command, { deviceId, acknowledgedAtMs }) {
  if (!isRecord(command) || !isId(deviceId) || !isInstant(acknowledgedAtMs)) invalidCommand();
  if (command.deviceId !== deviceId) throw new Error("command-device-mismatch");
  if (command.status === "acknowledged") return command;
  if (command.status !== "pending") throw new Error("command-not-pending");
  if (acknowledgedAtMs < command.issuedAtMs) invalidCommand();
  return Object.freeze({
    ...command,
    status: "acknowledged",
    deliveredAtMs: command.deliveredAtMs ?? acknowledgedAtMs,
    acknowledgedAtMs,
  });
}

/**
 * True when a pending command has outrun the delivery budget — the dashboard
 * surfaces this as "device unreachable" rather than silently claiming success.
 */
export function isCommandStale(command, nowMs) {
  if (!isRecord(command) || !isInstant(nowMs)) invalidCommand();
  return command.status === "pending"
    && nowMs - command.issuedAtMs > COMMAND_DELIVERY_TIMEOUT_MS;
}

/**
 * Folds a command into the device override that the scheduler reads. A lock has
 * no expiry; an unlock expires after its granted minutes; a sync clears nothing.
 */
export function applyCommand(override, command) {
  if (!isRecord(command)) invalidCommand();
  if (command.type === "sync") return override ?? null;
  if (command.type === "lock") {
    return Object.freeze({
      type: "lock",
      since: command.issuedAtMs,
      expiresAtMs: null,
      commandId: command.commandId,
      issuedByUid: command.issuedByUid,
      note: command.note,
    });
  }
  return Object.freeze({
    type: "unlock",
    since: command.issuedAtMs,
    expiresAtMs: command.issuedAtMs + command.minutes * MS_PER_MINUTE,
    commandId: command.commandId,
    issuedByUid: command.issuedByUid,
    note: command.note,
  });
}

export function isOverrideActive(override, nowMs) {
  if (override === null || override === undefined) return false;
  if (!isRecord(override) || !isInstant(nowMs)) invalidCommand();
  if (!["lock", "unlock"].includes(override.type)) invalidCommand();
  if (override.expiresAtMs === null) return true;
  return nowMs < override.expiresAtMs;
}

/** Drops an override that has already expired so stored state stays truthful. */
export function pruneOverride(override, nowMs) {
  return isOverrideActive(override, nowMs) ? override : null;
}
