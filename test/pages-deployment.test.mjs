import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
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

  await access(new URL("../dist/teacher.html", import.meta.url));
});
