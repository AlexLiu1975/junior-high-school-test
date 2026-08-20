import { biologyQuizAdapter } from "./biologyQuizAdapter.js";
import {
  biologySubmissionFailureMessage,
  submitBiologyAttempt,
} from "./biologySubmissionStatus.js";

export function recoverBiologyQuizSubmission({
  lifecycle,
  attempt,
  sync,
  recoveredSubmission,
  setAttempt,
  setReviewProgress,
  setConfirmedResult,
  setSaveError,
  setView,
  reportError,
}) {
  const { result, submission, refreshRequired } = recoveredSubmission;
  if (submission?.attemptId !== attempt.attemptId) return;
  try {
    const recovered = biologyQuizAdapter.restoreConfirmedSubmission({
      currentAttempt: attempt,
      submission,
      result,
    });
    lifecycle.restoreAttempt(recovered.attempt.questions);
    setAttempt(recovered.attempt);
    setReviewProgress(recovered.reviewProgress);
    setConfirmedResult(recovered.result);
    setSaveError(
      refreshRequired
        ? "完成紀錄已保存；請重新整理頁面後再開始新的測驗。"
        : null,
    );
    setView("results");
    if (!refreshRequired) {
      try {
        sync.queueSave({ activeAttempt: null, reviewProgress: recovered.reviewProgress });
      } catch (error) {
        reportError("Recovered biology review progress could not be queued", error);
        setSaveError("完成紀錄已保存；複習進度尚未同步，請重新整理頁面。");
      }
    }
  } catch (error) {
    reportError("Recovered biology submission could not be displayed", error);
    setSaveError(biologySubmissionFailureMessage({ confirmed: true }));
  }
}

export async function finishBiologyQuizSubmission({
  lifecycle,
  attempt,
  reviewProgress,
  saveAttempt,
  sync,
  setAttempt,
  setReviewProgress,
  setConfirmedResult,
  setSaveError,
  setView,
  setFinishing,
  reportError,
}) {
  if (!lifecycle.claimFinish()) return;

  setFinishing(true);
  try {
    setSaveError(null);
    const attemptSnapshot = structuredClone(attempt);
    saveAttempt(attemptSnapshot, reviewProgress);
    await sync.flush();
    const { result, reviewProgress: nextReviewProgress } = await submitBiologyAttempt({
      sync,
      attemptSnapshot,
      previousReviewProgress: reviewProgress,
    });
    setAttempt(attemptSnapshot);
    setReviewProgress(nextReviewProgress);
    setConfirmedResult(result);
    setView("results");
    try {
      sync.queueSave({ activeAttempt: null, reviewProgress: nextReviewProgress });
    } catch (error) {
      reportError("Biology review progress could not be queued", error);
      setSaveError("完成紀錄已保存；複習進度尚未同步，請重新整理頁面。");
    }
  } catch (error) {
    reportError("Biology submission failed", error);
    setSaveError(biologySubmissionFailureMessage({
      confirmed: error?.submissionConfirmed === true,
    }));
  } finally {
    lifecycle.releaseFinish();
    setFinishing(false);
  }
}
