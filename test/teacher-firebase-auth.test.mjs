import assert from "node:assert/strict";
import test from "node:test";

import { browserPopupRedirectResolver } from "firebase/auth";
import { getTeacherAuthOptions } from "../src/teacherFirebase.js";

test("teacher auth supplies the browser resolver required by Google popup sign-in", () => {
  const options = getTeacherAuthOptions();

  assert.equal(options.popupRedirectResolver, browserPopupRedirectResolver);
});
