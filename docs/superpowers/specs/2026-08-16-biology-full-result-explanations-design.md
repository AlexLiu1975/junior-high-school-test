# Biology Full Result Explanations Design

## Goal

After a student successfully submits **第1回　第1、2單元｜細胞與顯微鏡**, show the score and a complete, server-confirmed review of all 20 questions. Each item must show whether the student was correct, the student's answer, the correct answer, and a concise junior-high-level explanation. The presentation should follow the useful feedback pattern in `history.html` without copying its history questions or exposing Biology answers before submission.

## Confirmed Scope

- Show all 20 questions on the immediate successful-submission result page.
- Preserve the current randomized question and option order.
- Include correct, incorrect, and unanswered states.
- Author new Biology explanations for all 20 existing questions.
- Keep the existing score summary, Ebbinghaus review schedule, retry action, and clear-progress action.
- Do not create a permanent student explanation-history page.
- Do not write explanations into Firestore attempts, progress, pending submissions, or other persistent client-visible records.
- Do not change Firestore Rules, Firestore indexes, Billing settings, student identity, attempt identity, or the duplicate-attempt policy.

## Architecture

### Server-only content

Each question in `functions/shared/biologyDefinition.js` gains a non-empty `explanation`. The explanation is part of the trusted Functions definition alongside the correct-answer key. It must not be imported by `src`, copied into `src/biologyQuizContent.js`, or emitted in an initial browser bundle.

The existing client-safe content parity logic continues to strip both correct-answer and explanation fields. The answer-key boundary tests must continue to prove that neither field crosses into the pre-submit browser graph or production chunks.

### Submission response

After trusted server scoring, the response-only review payload contains exactly one item for every Biology question, in a stable allowlisted shape:

```js
{
  questionId,
  correctOptionId,
  explanation,
}
```

The server constructs this full review from the registered Biology definition. It does not trust question IDs, correctness, or explanations supplied by the caller. The public/private attempt records retain the current score/result fields and do not persist the review payload.

For an exact idempotent retry of the same `studentId`, `quizId`, version, kind, and `attemptId`, Functions reconstructs the same full review from the stored confirmed result plus the current registered versioned definition. It must not create a second attempt.

### Client validation and display model

`biologyQuizAdapter.renderResult()` validates that the response is a score result and that review contains exactly 20 unique entries covering the complete Biology question set. Every entry must contain only the allowlisted fields, reference a valid option belonging to the same question, and include a non-empty explanation.

The adapter combines trusted review data with the immutable submitted attempt snapshot. It returns display rows in the student's actual randomized question order. Each row includes:

- attempt position and question text;
- whether the answer is correct;
- the student's selected option, or an unanswered state;
- the correct option;
- the server-provided explanation.

The client determines the displayed correct/incorrect state only after accepting the trusted server response. It does not contain or calculate from a local answer key.

## Result Page

The result page begins with the existing score summary:

- score out of 100;
- correct count;
- incorrect count;
- a heading labelled **成績與解析**.

Below it, all 20 question cards appear in the submitted attempt order. Each card shows:

- `✓ 答對` in green or `✕ 答錯` in red;
- the question text;
- **你的答案** (or **未作答**);
- **正確答案**;
- a visually separated **💡 解題觀念** block.

The styling follows the feedback hierarchy in `history.html` while retaining the existing Biology paper-and-ink visual language. Correct questions are not collapsed or omitted. The Ebbinghaus schedule and existing result actions remain below the 20-card review.

## Explanation Content Standard

Each of the 20 explanations must:

- use Traditional Chinese suitable for junior-high students;
- explain the governing biological concept, not merely repeat the option;
- be concise enough for a result card;
- avoid unsupported claims and identify the relevant cell structure, transport principle, or microscope operation;
- be reviewed against the corresponding correct answer before deployment.

## Error and Legacy Handling

- Before server confirmation, submission failures retain answers and do not reveal any correct answer or explanation.
- If the attempt is confirmed but the full review is malformed or unavailable, the UI reports: **完成紀錄已保存，但解析暫時無法顯示，請重新整理頁面。** It must not claim the submission was unsent.
- Response recovery and exact retry use the same full-review validation path as a direct successful submission.
- A legacy confirmed Biology result that predates full-review support may safely show its trusted score without inventing question-level explanations. This compatibility applies only when the stored attempt lacks enough trusted result data to reconstruct a version-matched review; new Biology submissions require the complete 20-item review.

## Testing

Tests must cover:

1. All 20 server definitions have non-empty explanations and still have exactly one correct option.
2. A direct Biology submission returns 20 allowlisted review items.
3. Exact retry returns the same result/review and leaves one public/private attempt pair.
4. The adapter accepts only a complete, unique, same-question 20-item review and rejects missing, duplicate, cross-question, extra-field, or empty-explanation entries.
5. Display rows preserve randomized question/option order and correctly represent correct, incorrect, and unanswered responses.
6. Direct submission and recovered submission reach the same complete result state.
7. The initial browser dependency graph and built chunks contain no Biology correct-answer or explanation source data.
8. Full root tests, Functions tests, lint, production build, and the combined Auth/Firestore/Functions emulator gate pass with zero skips in the combined gate.

## Deployment

Implementation requires both:

- deploying the updated Firebase Functions so trusted Biology explanations are returned; and
- publishing the updated GitHub Pages frontend so the complete review is rendered.

Firestore Rules and indexes remain unchanged. Deployment must occur only after local verification and review. Production smoke testing should submit one authorized test attempt, confirm all 20 result cards and explanations, and verify the teacher record count increases by exactly one for that new attempt.

## Non-goals

- A permanent student history/detail page for explanations.
- Teacher-side display of full answer explanations.
- Changing quiz questions, answer choices, scoring, randomization, Ebbinghaus intervals, or student access.
- Reusing `history.html` answer keys or history-subject content.
