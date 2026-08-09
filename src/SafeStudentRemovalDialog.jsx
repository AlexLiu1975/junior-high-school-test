import { buildStudentRemovalConfirmation } from "./safeStudentRemovalDomain.js";

export default function SafeStudentRemovalDialog({ student, busy, error, onCancel, onConfirm }) {
  if (!student) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="presentation">
      <section aria-labelledby="student-removal-title" aria-modal="true" className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl" role="dialog">
        <h2 className="text-xl font-bold text-slate-900" id="student-removal-title">刪除或停用學生</h2>
        <p className="mt-4 leading-7 text-slate-700">{buildStudentRemovalConfirmation(student)}</p>
        {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-red-800" role="alert">{error}</p>}
        <div className="mt-6 flex justify-end gap-3">
          <button autoFocus className="rounded-lg border px-4 py-2 font-semibold" disabled={busy} onClick={onCancel} type="button">取消</button>
          <button className="rounded-lg bg-red-700 px-4 py-2 font-semibold text-white disabled:opacity-50" disabled={busy} onClick={onConfirm} type="button">
            {busy ? "處理中…" : "確認刪除／停用"}
          </button>
        </div>
      </section>
    </div>
  );
}
