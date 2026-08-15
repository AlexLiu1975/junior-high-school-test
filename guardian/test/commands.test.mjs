import assert from "node:assert/strict";
import test from "node:test";
import {
  COMMAND_DELIVERY_TIMEOUT_MS,
  MAX_UNLOCK_MINUTES,
  acknowledgeCommand,
  applyCommand,
  createCommand,
  isCommandStale,
  isOverrideActive,
  pruneOverride,
} from "../domain/commands.js";

const NOW = Date.UTC(2026, 7, 17, 4, 0);

function lockCommand(overrides = {}) {
  return createCommand({
    commandId: "cmd-1",
    type: "lock",
    deviceId: "device-1",
    childId: "child-1",
    issuedByUid: "parent-1",
    issuedAtMs: NOW,
    ...overrides,
  });
}

test("a lock command starts pending and carries its issuer", () => {
  const command = lockCommand({ note: "  吃飯時間  " });
  assert.equal(command.status, "pending");
  assert.equal(command.issuedByUid, "parent-1");
  assert.equal(command.note, "吃飯時間");
  assert.equal(command.minutes, null);
});

test("unlock commands require bounded minutes", () => {
  const command = lockCommand({ type: "unlock", minutes: 30 });
  assert.equal(command.minutes, 30);
  assert.throws(() => lockCommand({ type: "unlock" }), /invalid-command/);
  assert.throws(() => lockCommand({ type: "unlock", minutes: 0 }), /invalid-command/);
  assert.throws(
    () => lockCommand({ type: "unlock", minutes: MAX_UNLOCK_MINUTES + 1 }),
    /invalid-command/,
  );
  assert.throws(() => lockCommand({ type: "lock", minutes: 30 }), /invalid-command/);
});

test("commands reject unknown types and malformed identifiers", () => {
  assert.throws(() => lockCommand({ type: "wipe" }), /invalid-command/);
  assert.throws(() => lockCommand({ deviceId: "device 1" }), /invalid-command/);
  assert.throws(() => lockCommand({ issuedAtMs: "now" }), /invalid-command/);
});

test("acknowledgement is idempotent and device-bound", () => {
  const command = lockCommand();
  const acked = acknowledgeCommand(command, { deviceId: "device-1", acknowledgedAtMs: NOW + 2000 });
  assert.equal(acked.status, "acknowledged");
  assert.equal(acked.acknowledgedAtMs, NOW + 2000);
  assert.equal(acked.deliveredAtMs, NOW + 2000);

  const again = acknowledgeCommand(acked, { deviceId: "device-1", acknowledgedAtMs: NOW + 9000 });
  assert.equal(again, acked, "a repeated ack does not rewrite history");

  assert.throws(
    () => acknowledgeCommand(command, { deviceId: "device-2", acknowledgedAtMs: NOW }),
    /command-device-mismatch/,
  );
});

test("commands the device never picked up go stale", () => {
  const command = lockCommand();
  assert.equal(isCommandStale(command, NOW + 60_000), false);
  assert.equal(isCommandStale(command, NOW + COMMAND_DELIVERY_TIMEOUT_MS + 1), true);
  const acked = acknowledgeCommand(command, { deviceId: "device-1", acknowledgedAtMs: NOW });
  assert.equal(isCommandStale(acked, NOW + COMMAND_DELIVERY_TIMEOUT_MS + 1), false);
});

test("a lock override never expires on its own", () => {
  const override = applyCommand(null, lockCommand());
  assert.equal(override.type, "lock");
  assert.equal(override.expiresAtMs, null);
  assert.equal(isOverrideActive(override, NOW + 7 * 24 * 3600_000), true);
  assert.equal(pruneOverride(override, NOW + 7 * 24 * 3600_000), override);
});

test("an unlock override expires exactly at its granted horizon", () => {
  const override = applyCommand(null, lockCommand({ commandId: "cmd-2", type: "unlock", minutes: 15 }));
  assert.equal(override.expiresAtMs, NOW + 15 * 60_000);
  assert.equal(isOverrideActive(override, NOW + 15 * 60_000 - 1), true);
  assert.equal(isOverrideActive(override, NOW + 15 * 60_000), false);
  assert.equal(pruneOverride(override, NOW + 15 * 60_000), null);
});

test("a later command replaces the standing override", () => {
  const locked = applyCommand(null, lockCommand());
  const unlocked = applyCommand(locked, lockCommand({
    commandId: "cmd-2",
    type: "unlock",
    minutes: 20,
    issuedAtMs: NOW + 60_000,
  }));
  assert.equal(unlocked.type, "unlock");
  assert.equal(unlocked.commandId, "cmd-2");

  const relocked = applyCommand(unlocked, lockCommand({ commandId: "cmd-3", issuedAtMs: NOW + 120_000 }));
  assert.equal(relocked.type, "lock");
  assert.equal(relocked.expiresAtMs, null);
});

test("a sync command leaves the override untouched", () => {
  const locked = applyCommand(null, lockCommand());
  const afterSync = applyCommand(locked, lockCommand({ commandId: "cmd-4", type: "sync" }));
  assert.equal(afterSync, locked);
  assert.equal(applyCommand(null, lockCommand({ commandId: "cmd-5", type: "sync" })), null);
});

test("no override means no restriction", () => {
  assert.equal(isOverrideActive(null, NOW), false);
  assert.equal(isOverrideActive(undefined, NOW), false);
  assert.equal(pruneOverride(null, NOW), null);
});
