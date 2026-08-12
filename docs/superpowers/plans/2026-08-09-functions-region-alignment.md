# Functions Region Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align all callable Functions and browser clients with the existing `nam5` Firestore database by changing the pre-deployment region from `asia-east1` to `us-central1`.

**Architecture:** Keep the existing explicit region constants at the Functions and browser package boundaries because Firebase deploys `functions/` independently from the Vite application. Add one cross-package contract test that scans every tracked runtime, emulator, environment, and operator surface so the duplicate constants cannot drift.

**Tech Stack:** Firebase Functions Gen 2, Firebase JavaScript SDK, Node.js 22 target, Node test runner, Firebase Auth/Firestore/Functions Emulators, Vite 8, oxlint.

## Global Constraints

- The target Functions region is exactly `us-central1`.
- The four callable names remain `loadStudentProgress`, `saveStudentProgress`, `submitQuizAttempt`, and `removeOrDeactivateStudent`.
- Runtime limits remain Node 22, `maxInstances: 3`, 30-second timeout, and 256 MiB memory.
- Firestore remains in `nam5`; no data or document path is changed.
- No Firebase deployment, Git push, Billing upgrade, budget creation, or production write is authorized.
- The combined Auth/Firestore/Functions emulator gate must pass with zero skipped emulator tests.

---

### Task 1: Align Callable Region and Verify Every Consumer

**Files:**
- Modify: `functions/index.js`
- Modify: `src/studentFunctions.js`
- Modify: `src/teacherFirebase.js`
- Modify: `functions/test/emulator-integration.test.mjs`
- Modify: `test/pages-deployment.test.mjs`
- Modify: `.env.example`
- Modify: `README.md`
- Test: `functions/test/student-service.test.mjs`

**Interfaces:**
- Consumes: the existing four Gen 2 callable exports and browser `getFunctions(app, region)` initialization.
- Produces: server and browser clients that all address `us-central1`, plus a repository-wide deployment contract that rejects a tracked `asia-east1` declaration.

- [ ] **Step 1: Add failing region-contract tests**

Extend `test/pages-deployment.test.mjs` to read the runtime and operator files and assert the intended region:

```js
const REGION_FILES = [
  "functions/index.js",
  "src/studentFunctions.js",
  "src/teacherFirebase.js",
  "functions/test/emulator-integration.test.mjs",
  ".env.example",
  "README.md",
];

test("every callable surface uses the nam5-aligned Functions region", async () => {
  for (const file of REGION_FILES) {
    const source = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
    assert.match(source, /us-central1/, `${file} must declare us-central1`);
    assert.doesNotMatch(source, /asia-east1/, `${file} must not declare asia-east1`);
  }
});
```

Add a Functions assertion that all exported callable option objects use `us-central1` while retaining the existing resource limits.

- [ ] **Step 2: Run the focused tests and confirm RED**

Run:

```bash
node --test test/pages-deployment.test.mjs
npm --prefix functions test
```

Expected: the region assertions fail because the tracked runtime and documentation still declare `asia-east1`.

- [ ] **Step 3: Change every runtime and emulator endpoint together**

Apply these exact changes:

```js
// functions/index.js
const callableOptions = {
  region: "us-central1",
  maxInstances: 3,
  timeoutSeconds: 30,
  memory: "256MiB",
};
```

```js
// src/studentFunctions.js
export const STUDENT_FUNCTIONS_REGION = "us-central1";
```

```js
// src/teacherFirebase.js
const teacherFunctions = teacherApp ? getFunctions(teacherApp, "us-central1") : null;
```

Change the callable emulator URL segment in `functions/test/emulator-integration.test.mjs` to `us-central1`. Update `.env.example` and both README region references to state that `nam5` is paired with `us-central1` and that live deployment is still blocked by Spark billing.

- [ ] **Step 4: Run focused tests and confirm GREEN**

Run:

```bash
node --test test/pages-deployment.test.mjs
npm --prefix functions test
rg -n "asia-east1" functions src test README.md .env.example .github package.json firebase.json
```

Expected: both test commands pass and `rg` returns no matches.

- [ ] **Step 5: Run the mandatory full verification gate**

Use the task-specific temporary Java and Firebase config locations:

```bash
env \
  XDG_CONFIG_HOME=/private/tmp/jhst-firebase-config \
  FIREBASE_CLI_DISABLE_UPDATE_CHECK=1 \
  PATH=/private/tmp/jhst-jdk21/Contents/Home/bin:$PATH \
  npm run verify
git diff --check
```

Expected: root and Functions unit phases have zero failures; the combined emulator phase passes all emulator tests with zero skipped; lint and production build exit 0; diff check is clean. The local Node 24 versus target Node 22 warning and existing Vite chunk-size warning may remain non-blocking and must be reported.

- [ ] **Step 6: Commit the reviewed configuration change**

```bash
git add functions/index.js src/studentFunctions.js src/teacherFirebase.js \
  functions/test/emulator-integration.test.mjs test/pages-deployment.test.mjs \
  .env.example README.md functions/test/student-service.test.mjs
git commit -m "Align Functions with nam5 Firestore"
```

Record the live evidence separately: Spark plan, Firestore `nam5`, and no deployed Functions. Do not click Upgrade, deploy, push, or change Billing.

