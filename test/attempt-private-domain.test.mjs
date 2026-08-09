import assert from "node:assert/strict";
import test from "node:test";
import { joinAttemptPrivate } from "../src/attemptPrivateDomain.js";

test("joins masked IP by attempt id without losing public fields", () => {
  assert.deepEqual(
    joinAttemptPrivate(
      [{ id: "a1", studentName: "王小明" }, { id: "a2", studentName: "李小華" }],
      [{ id: "a1", maskedIp: "203.0.113.xxx" }],
    ),
    [
      { id: "a1", studentName: "王小明", maskedIp: "203.0.113.xxx" },
      { id: "a2", studentName: "李小華", maskedIp: null },
    ],
  );
});
