import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test, { before } from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

before(async () => {
  await execFileAsync(process.execPath, ["node_modules/vite/bin/vite.js", "build"], {
    cwd: new URL("../", import.meta.url),
  });
});

function assertClientSafe(value, location = "root") {
  if (Array.isArray(value)) {
    value.forEach((child, index) => assertClientSafe(child, `${location}[${index}]`));
    return;
  }
  if (value === null || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    assert.equal(
      ["correct", "correctIndex", "explanation", "resultReviewScope"].includes(key),
      false,
      `${location}.${key} exposes server-only review data`,
    );
    assertClientSafe(child, `${location}.${key}`);
  }
}

test("browser quiz content has no answer or explanation fields", async () => {
  const [
    { BIOLOGY_QUIZ_CONTENT },
    { ENGLISH_REVIEW_2_CONTENT },
    { PHYSICS_CHEMISTRY_PART_1_CONTENT },
    { PHYSICS_CHEMISTRY_PART_2_CONTENT },
  ] = await Promise.all([
    import("../src/quizzes/01-biology/biologyQuizContent.js"),
    import("../src/quizzes/02-english/englishReview2Content.js"),
    import("../src/quizzes/04-physics-chemistry/b3-1-1-to-2-1-part-1/part1Content.js"),
    import("../src/quizzes/04-physics-chemistry/b3-1-1-to-2-1-part-2/part2Content.js"),
  ]);
  assertClientSafe(BIOLOGY_QUIZ_CONTENT, "biology");
  assertClientSafe(ENGLISH_REVIEW_2_CONTENT, "english");
  assertClientSafe(PHYSICS_CHEMISTRY_PART_1_CONTENT, "physics-chemistry-part-1");
  assertClientSafe(PHYSICS_CHEMISTRY_PART_2_CONTENT, "physics-chemistry-part-2");
});

test("client-safe content stays aligned with the versioned server definitions", async () => {
  const [
    { BIOLOGY_QUIZ_CONTENT },
    { ENGLISH_REVIEW_2_CONTENT },
    { PHYSICS_CHEMISTRY_PART_1_CONTENT },
    { PHYSICS_CHEMISTRY_PART_2_CONTENT },
    { QUIZ_DEFINITION },
    { ENGLISH_REVIEW_2 },
    { PHYSICS_CHEMISTRY_PART_1 },
    { PHYSICS_CHEMISTRY_PART_2 },
  ] = await Promise.all([
    import("../src/quizzes/01-biology/biologyQuizContent.js"),
    import("../src/quizzes/02-english/englishReview2Content.js"),
    import("../src/quizzes/04-physics-chemistry/b3-1-1-to-2-1-part-1/part1Content.js"),
    import("../src/quizzes/04-physics-chemistry/b3-1-1-to-2-1-part-2/part2Content.js"),
    import("../functions/shared/quizzes/01-biology/biologyDefinition.js"),
    import("../functions/shared/quizzes/02-english/englishReview2Definition.js"),
    import("../functions/shared/quizzes/04-physics-chemistry/b3-1-1-to-2-1-part-1/part1Definition.js"),
    import("../functions/shared/quizzes/04-physics-chemistry/b3-1-1-to-2-1-part-2/part2Definition.js"),
  ]);
  const strip = (definition) => {
    const { resultReviewScope: _resultReviewScope, ...clientDefinition } = definition;
    return {
      ...clientDefinition,
      questions: definition.questions.map(({ correct: _correct, explanation: _explanation, ...question }) => ({
        ...question,
        options: question.options.map(({ correct: _optionCorrect, ...option }) => option),
      })),
    };
  };
  assert.deepEqual(BIOLOGY_QUIZ_CONTENT, strip(QUIZ_DEFINITION));
  assert.deepEqual(ENGLISH_REVIEW_2_CONTENT, strip(ENGLISH_REVIEW_2));
  assert.deepEqual(PHYSICS_CHEMISTRY_PART_1_CONTENT, strip(PHYSICS_CHEMISTRY_PART_1));
  assert.deepEqual(PHYSICS_CHEMISTRY_PART_2_CONTENT, strip(PHYSICS_CHEMISTRY_PART_2));
});

test("the src dependency graph cannot import server answer modules", async () => {
  const srcDirectory = new URL("../src/", import.meta.url);
  const entries = await readdir(srcDirectory, { recursive: true, withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile() && /\.[cm]?[jt]sx?$/.test(entry.name));
  for (const entry of files) {
    const filename = path.join(entry.parentPath, entry.name);
    const source = await readFile(filename, "utf8");
    assert.doesNotMatch(
      source,
      /(?:biologyDefinition|englishReview2Definition|part1Definition|part2Definition|quizRegistry|multipleChoiceSubmission)/,
      `${path.relative(new URL("../", import.meta.url).pathname, filename)} imports server-only quiz data`,
    );
  }
});

test("production browser chunks exclude server answer-key markers", async () => {
  const assets = new URL("../dist/assets/", import.meta.url);
  const chunks = (await readdir(assets)).filter((name) => name.endsWith(".js"));
  const bundle = (await Promise.all(
    chunks.map((name) => readFile(new URL(name, assets), "utf8")),
  )).join("\n");
  for (const marker of [
    "correctIndex",
    "biologyDefinition",
    "englishReview2Definition",
    "part1Definition",
    "part2Definition",
    "虎克觀察的是軟木栓中已死亡細胞留下的細胞壁格室",
    "listen to... 為固定搭配用語",
    "因此 (A) 完全符合配置",
    "黃金的密度約為 19.3 g/cm³",
    "金屬體積為 57.0－42.0＝15.0 cm³",
  ]) {
    assert.equal(bundle.includes(marker), false, `browser bundle exposes ${marker}`);
  }
});
