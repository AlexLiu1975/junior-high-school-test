import { httpsCallable } from "firebase/functions";

export const STUDENT_FUNCTIONS_REGION = "us-central1";

async function invoke(callable, input) {
  const result = await callable(input);
  return result.data;
}

export function createStudentFunctionCallers(functions) {
  const load = httpsCallable(functions, "loadStudentProgress");
  const save = httpsCallable(functions, "saveStudentProgress");
  const submit = httpsCallable(functions, "submitQuizAttempt");
  const grade = httpsCallable(functions, "gradeQuizAnswers");
  return {
    loadStudentProgress: (input) => invoke(load, input),
    saveStudentProgress: (input) => invoke(save, input),
    submitQuizAttempt: (input) => invoke(submit, input),
    gradeQuizAnswers: (input) => invoke(grade, input),
  };
}
