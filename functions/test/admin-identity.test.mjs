import assert from "node:assert/strict";
import test from "node:test";
import { requireAdminAuth } from "../adminIdentity.js";

test("requires the verified Google administrator", () => {
  assert.doesNotThrow(() => requireAdminAuth({
    uid: "admin-uid",
    token: {
      email: "beyle931224@gmail.com",
      email_verified: true,
      firebase: { sign_in_provider: "google.com" },
    },
  }));
  assert.throws(
    () => requireAdminAuth({
      token: {
        email: "beyle931224@gmail.com",
        email_verified: true,
        firebase: { sign_in_provider: "google.com" },
      },
    }),
    /admin-required/,
  );

  assert.throws(
    () => requireAdminAuth({ token: { email: "teacher@example.com", email_verified: true } }),
    /admin-required/,
  );
  assert.throws(
    () => requireAdminAuth({
      token: {
        email: "beyle931224@gmail.com",
        email_verified: true,
        firebase: { sign_in_provider: "password" },
      },
    }),
    /admin-required/,
  );
  assert.throws(
    () => requireAdminAuth({
      token: {
        email: "beyle931224@gmail.com",
        email_verified: false,
        firebase: { sign_in_provider: "google.com" },
      },
    }),
    /admin-required/,
  );
});
