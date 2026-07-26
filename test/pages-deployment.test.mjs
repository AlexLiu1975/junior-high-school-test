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
