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
  const [{ BIOLOGY_QUIZ_CONTENT }, { ENGLISH_REVIEW_2_CONTENT }] = await Promise.all([
    import("../src/quizzes/01-biology/biologyQuizContent.js"),
    import("../src/quizzes/02-english/englishReview2Content.js"),
  ]);
  assertClientSafe(BIOLOGY_QUIZ_CONTENT, "biology");
  assertClientSafe(ENGLISH_REVIEW_2_CONTENT, "english");
});

test("client-safe content stays aligned with the versioned server definitions", async () => {
  const [
    { BIOLOGY_QUIZ_CONTENT },
    { ENGLISH_REVIEW_2_CONTENT },
    { QUIZ_DEFINITION },
    { ENGLISH_REVIEW_2 },
  ] = await Promise.all([
    import("../src/quizzes/01-biology/biologyQuizContent.js"),
    import("../src/quizzes/02-english/englishReview2Content.js"),
    import("../functions/shared/quizzes/01-biology/biologyDefinition.js"),
    import("../functions/shared/quizzes/02-english/englishReview2Definition.js"),
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
      /functions\/shared\/(?:biologyDefinition|englishReview2Definition|quizRegistry|multipleChoiceSubmission)/,
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
    "虎克觀察的是軟木栓中已死亡細胞留下的細胞壁格室",
    "listen to... 為固定搭配用語",
    "因此 (A) 完全符合配置",
  ]) {
    assert.equal(bundle.includes(marker), false, `browser bundle exposes ${marker}`);
  }
});
