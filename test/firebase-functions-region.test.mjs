import assert from "node:assert/strict";
import test from "node:test";

import {
  createStudentFunctions,
} from "../src/firebase.js";
import { STUDENT_FUNCTIONS_REGION } from "../src/studentFunctions.js";
import {
  createTeacherFunctions,
  TEACHER_FUNCTIONS_REGION,
} from "../src/teacherFirebase.js";

function assertFunctionsInitialization(createFunctions, expectedRegion) {
  const app = { name: "test-app" };
  const result = { name: "functions" };
  const calls = [];
  const getFunctions = (...args) => {
    calls.push(args);
    return result;
  };

  assert.equal(createFunctions(app, getFunctions), result);
  assert.deepEqual(calls, [[app, expectedRegion]]);
  assert.equal(createFunctions(null, getFunctions), null);
  assert.deepEqual(calls, [[app, expectedRegion]]);
}

test("student Firebase initialization passes the callable region to getFunctions", () => {
  assert.equal(STUDENT_FUNCTIONS_REGION, "us-central1");
  assertFunctionsInitialization(createStudentFunctions, "us-central1");
});

test("teacher Firebase initialization passes the callable region to getFunctions", () => {
  assert.equal(TEACHER_FUNCTIONS_REGION, "us-central1");
  assertFunctionsInitialization(createTeacherFunctions, "us-central1");
});
