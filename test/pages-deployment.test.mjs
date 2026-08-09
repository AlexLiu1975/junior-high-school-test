import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Vite builds assets below the repository GitHub Pages path", async () => {
  const { default: config } = await import("../vite.config.js");

  assert.equal(config.base, "/junior-high-school-test/");
});

test("GitHub Actions builds and deploys the Vite dist directory", async () => {
  const workflow = await readFile(
    new URL("../.github/workflows/deploy-pages.yml", import.meta.url),
    "utf8",
  );

  assert.match(workflow, /npm ci/);
  assert.match(workflow, /npm run build/);
  assert.match(workflow, /path:\s*dist/);
  assert.match(workflow, /actions\/deploy-pages@v4/);
});

test("GitHub Actions verifies Functions and the combined emulator suite without deploying backend services", async () => {
  const workflow = await readFile(
    new URL("../.github/workflows/deploy-pages.yml", import.meta.url),
    "utf8",
  );

  assert.match(workflow, /npm --prefix functions ci/);
  assert.match(workflow, /npm run test:functions/);
  assert.match(workflow, /npm run test:emulators/);
  assert.doesNotMatch(workflow, /firebase deploy\s+--only\s+(?:functions|firestore|functions,firestore)/);
});

test("Firebase config exposes the combined Auth, Firestore, and Functions emulator ports", async () => {
  const config = await readFile(
    new URL("../firebase.json", import.meta.url),
    "utf8",
  ).then(JSON.parse);

  assert.equal(config.emulators.auth.port, 9099);
  assert.equal(config.emulators.firestore.port, 8080);
  assert.equal(config.emulators.functions.port, 5001);
});

test("root package scripts include Functions, combined emulators, and the complete verification gate", async () => {
  const pkg = await readFile(new URL("../package.json", import.meta.url), "utf8").then(JSON.parse);

  assert.equal(pkg.scripts["test:functions"], "npm --prefix functions test");
  assert.match(pkg.scripts["test:emulators"], /--only auth,firestore,functions/);
  assert.match(pkg.scripts["test:emulators"], /functions\/test\/emulator-integration\.test\.mjs/);
  assert.match(pkg.scripts["test:emulators"], /test\/firestore\.rules\.test\.mjs/);
  assert.equal(
    pkg.scripts.verify,
    "npm test && npm run test:functions && npm run test:emulators && npm run lint && npm run build",
  );
});

test("missing Firebase settings are reported before SDK initialization", async () => {
  const { getMissingFirebaseConfigKeys } = await import(
    "../src/firebaseConfig.js"
  );

  assert.deepEqual(
    getMissingFirebaseConfigKeys({
      apiKey: "",
      authDomain: undefined,
      projectId: "junior-high-school-test",
      storageBucket: "",
      messagingSenderId: "",
      appId: "",
    }),
    ["apiKey", "authDomain", "storageBucket", "messagingSenderId", "appId"],
  );
});

test("teacher portal is a noindex Vite build entry", async () => {
  const teacherHtml = await readFile(
    new URL("../teacher.html", import.meta.url),
    "utf8",
  );
  assert.match(teacherHtml, /noindex,\s*nofollow/);

  const { default: config } = await import("../vite.config.js");
  assert.match(config.build.rolldownOptions.input.teacher, /teacher\.html$/);
});

test("homepage, quiz, and teacher are separate Vite entries", async () => {
  const { default: config } = await import("../vite.config.js");
  const inputs = config.build.rolldownOptions.input;

  assert.match(inputs.home, /index\.html$/);
  assert.match(inputs.quiz, /quiz\.html$/);
  assert.match(inputs.teacher, /teacher\.html$/);
});

test("homepage and quiz HTML load their dedicated React entries", async () => {
  const [homeHtml, quizHtml] = await Promise.all([
    readFile(new URL("../index.html", import.meta.url), "utf8"),
    readFile(new URL("../quiz.html", import.meta.url), "utf8"),
  ]);

  assert.match(homeHtml, /src\/home-main\.jsx/);
  assert.match(homeHtml, /<title>測驗學習平台<\/title>/);
  assert.match(quizHtml, /src\/main\.jsx/);
  assert.match(quizHtml, /<title>學生試卷選單<\/title>/);
});

test("Firebase config declares the collection-group index used for safe link removal", async () => {
  const [firebaseConfig, indexes] = await Promise.all([
    readFile(new URL("../firebase.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../firestore.indexes.json", import.meta.url), "utf8").then(JSON.parse),
  ]);
  assert.equal(firebaseConfig.firestore.indexes, "firestore.indexes.json");
  assert.equal(
    indexes.fieldOverrides.some((item) =>
      item.collectionGroup === "students"
      && item.fieldPath === "studentId"
      && item.indexes.some((index) => index.queryScope === "COLLECTION_GROUP" && index.order === "ASCENDING")),
    true,
  );
});
