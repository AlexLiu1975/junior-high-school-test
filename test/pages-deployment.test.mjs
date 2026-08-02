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
  assert.match(quizHtml, /<title>細胞與顯微鏡 隨堂測驗<\/title>/);
});
