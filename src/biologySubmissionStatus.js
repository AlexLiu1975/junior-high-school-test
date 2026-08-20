import { biologyQuizAdapter } from "./biologyQuizAdapter.js";

export function biologySubmissionFailureMessage({ confirmed }) {
  return confirmed
    ? "完成紀錄已保存；結果顯示失敗，請重新整理頁面。"
    : "作答紀錄尚未送出，資料已保留；請檢查網路後重試。";
}

function resolveBiologySubmissionResult({
  attemptSnapshot,
  previousReviewProgress,
  serverResult,
  today,
}) {
  const result = biologyQuizAdapter.renderResult(serverResult);
  const reviewProgress = biologyQuizAdapter.updateReviewProgress({
    previous: previousReviewProgress,
    attempt: attemptSnapshot,
    result,
    ...(today === undefined ? {} : { today }),
  });
  return { result, reviewProgress };
}

export async function submitBiologyAttempt({
  sync,
  attemptSnapshot,
  previousReviewProgress,
  today,
}) {
  let submissionConfirmed = false;
  try {
    const serverResult = await sync.submit(
      biologyQuizAdapter.buildSubmission({
        ...attemptSnapshot,
        reviewProgress: previousReviewProgress,
      }),
    );
    submissionConfirmed = true;
    return resolveBiologySubmissionResult({
      attemptSnapshot,
      previousReviewProgress,
      serverResult,
      today,
    });
  } catch (cause) {
    const error = new Error("biology-submission-failed", { cause });
    error.submissionConfirmed = submissionConfirmed;
    throw error;
  }
}
