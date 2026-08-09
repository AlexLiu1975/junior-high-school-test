# Functions Region Alignment Design

## Decision

Change all four callable Cloud Functions and both browser clients from `asia-east1` to `us-central1` before the first production deployment.

## Verified Context

- Firebase project: `junior-high-school-test`.
- Current plan: Spark; Functions deployment is unavailable until the owner explicitly upgrades billing.
- Default Firestore database location: `nam5`.
- Existing deployed Functions: none.
- Firebase documents `us-central1` as the nearest supported Functions region for a `nam5` Firestore database.

## Scope

Use one shared, explicit region value, `us-central1`, across:

- the four Gen 2 callable definitions;
- the student Functions client;
- the teacher/admin Functions client;
- emulator callable URLs and region assertions;
- operator documentation and environment comments.

The callable names remain:

- `loadStudentProgress`
- `saveStudentProgress`
- `submitQuizAttempt`
- `removeOrDeactivateStudent`

Runtime limits remain Node 22, `maxInstances: 3`, 30-second timeout, and 256 MiB memory.

## Compatibility and Migration

No production Functions exist, so this is a pre-deployment configuration correction rather than a deployed-region migration. No dual-region compatibility alias or old-function deletion is required.

Firestore remains in `nam5`; its location is not changed. Existing Firestore data and document paths are untouched.

## Verification

Tests must prove:

1. the server exports all four callables in `us-central1`;
2. student and teacher clients initialize Functions in `us-central1`;
3. emulator integration calls the `us-central1` endpoints;
4. no tracked source, test, workflow, environment example, or operator document still declares `asia-east1`;
5. the complete root, Functions, Auth/Firestore/Functions emulator, lint, build, and diff checks pass.

The emulator gate must run with zero skipped emulator tests. Plain unit phases may continue to mark emulator-only cases as skipped when the emulator environment variables are absent.

## Safety and Deployment Gate

This change does not authorize any Firebase deployment, Git push, Billing upgrade, budget creation, or production data write. After verification, production deployment remains blocked until the owner explicitly approves:

1. upgrading from Spark to Blaze;
2. the proposed budget-alert settings;
3. deploying Functions, Rules, and indexes;
4. pushing the reviewed branch and running public browser E2E.

