import assert from "node:assert/strict";
import test from "node:test";
import { maskIp } from "../ipMask.js";

test("masks IPv4, IPv6, forwarded values, and unknown input", () => {
  assert.equal(maskIp("203.0.113.42"), "203.0.113.xxx");
  assert.equal(maskIp("2001:db8:85a3::8a2e:370:7334"), "2001:db8:85a3:…");
  assert.equal(maskIp("203.0.113.42, 10.0.0.1"), "203.0.113.xxx");
  assert.equal(maskIp("::ffff:203.0.113.42"), "::ffff:203.0.113.xxx");
  assert.equal(maskIp(undefined), "無法判定");
});
