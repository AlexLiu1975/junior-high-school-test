# Biology result normalization fix

## Problem

The production Biology quiz successfully saves a completed attempt, but the client then reports `invalid-biology-result` and shows the misleading message that the attempt was not submitted.

The failure occurs because `biologyQuizAdapter.renderResult()` validates a trusted server result and returns a normalized object without `resultType`. `BiologyQuiz.finishQuiz()` passes that normalized object into `updateReviewProgress()`, which deliberately validates it again and requires `resultType === "score"`. The second validation therefore rejects the client's own normalized result after the server has already confirmed and stored the attempt.

## Chosen approach

Preserve `resultType: "score"` in the normalized Biology result. This makes a normalized result safe to pass through the same validation boundary again without weakening validation or creating a separate trusted-result path.

Alternatives rejected:

- Skipping validation inside `updateReviewProgress()` would weaken the adapter boundary.
- Removing the first validation in `finishQuiz()` would make other callers easier to misuse and would not make normalized results idempotent.

## Behavior

1. `renderResult()` continues to require a server-confirmed score result and structurally valid review items.
2. Its normalized return value includes only `resultType`, `score`, `correctCount`, `wrongCount`, and cloned `review` items.
3. Passing that normalized value back to `renderResult()` or `updateReviewProgress()` succeeds.
4. `finishQuiz()` distinguishes two failure phases:
   - before `sync.submit()` resolves: the attempt may not have been saved, so retain the existing retry message;
   - after `sync.submit()` resolves: the server confirmed the attempt, so report that the completion record is saved and only result display failed.
5. Retry remains idempotent because the existing attempt identity contract is unchanged.

## Tests

- Add a regression test that normalizes a valid raw Biology result and then feeds the normalized result into `updateReviewProgress()`.
- Assert the normalized result retains `resultType: "score"` and strips unrelated transport fields.
- Add or extend a Biology component test for the post-confirmation error message if the current test harness can exercise the phase boundary without replacing production behavior with mocks.
- Run focused Biology tests, the complete project verification command, lint, and production build.
- After deployment, reuse the existing production attempt to confirm that the result page renders and no duplicate attempt is created.

## Deployment scope

The change is frontend-only. Publish through the normal GitHub Pages workflow after PR review and merge. Do not redeploy Firebase Functions, Firestore Rules, or indexes unless verification uncovers a separate backend defect.
