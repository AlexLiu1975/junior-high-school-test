import assert from "node:assert/strict";
import test from "node:test";
import { seedDemoFamily } from "../server/memoryRepository.js";
import {
  PAIRING_CODE_TTL_MS,
  createPairingCode,
  redeemPairingCode,
  revokeDevice,
  syncDevice,
} from "../server/guardianService.js";

const FAMILY = "family-1";
const PARENT = "parent-1";
const CHILD = "child-1";
const NOW = Date.UTC(2026, 7, 17, 4, 0);

const codeFactory = (code = "123456") => () => code;
const idFactory = (id = "device-new") => () => id;

test("a parent mints a single-use pairing code", async () => {
  const repository = seedDemoFamily();
  const pairing = await createPairingCode(
    repository,
    { familyId: FAMILY, uid: PARENT, childId: CHILD, nowMs: NOW },
    { newCode: codeFactory() },
  );
  assert.equal(pairing.code, "123456");
  assert.equal(pairing.expiresAtMs, NOW + PAIRING_CODE_TTL_MS);
});

test("redeeming a code enrolls the device and returns its claims", async () => {
  const repository = seedDemoFamily();
  await createPairingCode(
    repository,
    { familyId: FAMILY, uid: PARENT, childId: CHILD, nowMs: NOW },
    { newCode: codeFactory() },
  );
  const claims = await redeemPairingCode(
    repository,
    { code: "123456", platform: "ios", deviceName: "小明的 iPhone", nowMs: NOW + 1000 },
    { newId: idFactory() },
  );
  assert.deepEqual({ ...claims }, { familyId: FAMILY, childId: CHILD, deviceId: "device-new" });

  const device = await repository.loadDevice(FAMILY, "device-new");
  assert.equal(device.platform, "ios");
  assert.equal(device.deviceName, "小明的 iPhone");
  assert.equal(device.revoked, false);

  // The freshly enrolled device can immediately sync.
  const sync = await syncDevice(repository, { claims, nowMs: NOW + 2000 });
  assert.equal(typeof sync.state.locked, "boolean");
});

test("a pairing code cannot be redeemed twice or after it expires", async () => {
  const repository = seedDemoFamily();
  await createPairingCode(
    repository,
    { familyId: FAMILY, uid: PARENT, childId: CHILD, nowMs: NOW },
    { newCode: codeFactory() },
  );
  await redeemPairingCode(
    repository,
    { code: "123456", platform: "android", nowMs: NOW + 1000 },
    { newId: idFactory() },
  );
  await assert.rejects(
    redeemPairingCode(
      repository,
      { code: "123456", platform: "android", nowMs: NOW + 2000 },
      { newId: idFactory("device-other") },
    ),
    /pairing-code-used/,
  );

  await createPairingCode(
    repository,
    { familyId: FAMILY, uid: PARENT, childId: CHILD, nowMs: NOW },
    { newCode: codeFactory("654321") },
  );
  await assert.rejects(
    redeemPairingCode(
      repository,
      { code: "654321", platform: "android", nowMs: NOW + PAIRING_CODE_TTL_MS },
      { newId: idFactory("device-late") },
    ),
    /pairing-code-expired/,
  );
});

test("unknown codes and platforms are rejected", async () => {
  const repository = seedDemoFamily();
  await assert.rejects(
    redeemPairingCode(repository, { code: "000000", platform: "ios", nowMs: NOW }, { newId: idFactory() }),
    /invalid-pairing-code/,
  );
  await assert.rejects(
    redeemPairingCode(repository, { code: "12345", platform: "ios", nowMs: NOW }, { newId: idFactory() }),
    /invalid-pairing-code/,
  );
  await createPairingCode(
    repository,
    { familyId: FAMILY, uid: PARENT, childId: CHILD, nowMs: NOW },
    { newCode: codeFactory() },
  );
  await assert.rejects(
    redeemPairingCode(
      repository,
      { code: "123456", platform: "windows", nowMs: NOW },
      { newId: idFactory() },
    ),
    /invalid-argument/,
  );
});

test("only a parent of the family may mint a code, and only for its own child", async () => {
  const repository = seedDemoFamily();
  await assert.rejects(
    createPairingCode(
      repository,
      { familyId: FAMILY, uid: "stranger", childId: CHILD, nowMs: NOW },
      { newCode: codeFactory() },
    ),
    /parent-required/,
  );
  await assert.rejects(
    createPairingCode(
      repository,
      { familyId: FAMILY, uid: PARENT, childId: "child-9", nowMs: NOW },
      { newCode: codeFactory() },
    ),
    /child-not-found/,
  );
});

test("revoking a device stops it syncing but keeps its history", async () => {
  const repository = seedDemoFamily();
  const revoked = await revokeDevice(repository, {
    familyId: FAMILY,
    uid: PARENT,
    deviceId: "device-1",
    nowMs: NOW,
  });
  assert.equal(revoked.revoked, true);
  await assert.rejects(
    syncDevice(repository, {
      claims: { familyId: FAMILY, childId: CHILD, deviceId: "device-1" },
      nowMs: NOW + 1000,
    }),
    /device-revoked/,
  );
  assert.ok(await repository.loadDevice(FAMILY, "device-1"));
});
