import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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

test("production Firebase bootstraps consume the tested Functions initializers", async () => {
  const [studentSource, teacherSource] = await Promise.all([
    readFile(new URL("../src/firebase.js", import.meta.url), "utf8"),
    readFile(new URL("../src/teacherFirebase.js", import.meta.url), "utf8"),
  ]);
  const studentBootstrap = studentSource.replace(/\s+/g, "");
  const teacherBootstrap = teacherSource.replace(/\s+/g, "");

  assert.match(studentBootstrap, /constfunctions=createStudentFunctions\(app\);/);
  assert.doesNotMatch(studentBootstrap, /constfunctions=getFunctions\(/);
  assert.match(teacherBootstrap, /constteacherFunctions=createTeacherFunctions\(teacherApp\);/);
  assert.doesNotMatch(teacherBootstrap, /constteacherFunctions=getFunctions\(/);
});
