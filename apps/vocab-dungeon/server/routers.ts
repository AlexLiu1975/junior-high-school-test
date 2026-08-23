import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router, studentProcedure, systemAdminProcedure, teacherProcedure } from "./_core/trpc";
import { createClassroom, createVocabWord, findClassroomByCode, getAllClassrooms, listUsers, getClassroomAttempts, getClassroomById, getClassroomStudents, getStudentPerformance, getTeacherClassrooms, isClassroomMember, joinClassroom, listVocabWords, recordWordAttempt, updateClassroom, updateUserRole, buildWordPerformance } from "./db";
import { nanoid } from "nanoid";

const roleSchema = z.enum(["system_admin", "teacher", "student"]);

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => { const cookieOptions = getSessionCookieOptions(ctx.req); ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 }); return { success: true } as const; }),
  }),
  learning: router({
    words: protectedProcedure.input(z.object({ volume: z.string().optional(), lesson: z.string().optional() }).optional()).query(({ input }) => listVocabWords(input?.volume, input?.lesson)),
    recordAttempt: protectedProcedure.input(z.object({ wordId: z.number().int().positive(), classroomId: z.number().int().positive().optional(), correct: z.boolean(), questionType: z.string().min(1).max(32) })).mutation(async ({ ctx, input }) => {
      if (input.classroomId && ctx.user.role === "student" && !(await isClassroomMember(input.classroomId, ctx.user.id))) throw new TRPCError({ code: "FORBIDDEN", message: "你尚未加入這個班級" });
      await recordWordAttempt({ ...input, studentId: ctx.user.id }); return { recorded: true as const };
    }),
    myPerformance: studentProcedure.input(z.object({ classroomId: z.number().int().positive().optional() }).optional()).query(({ ctx, input }) => getStudentPerformance(ctx.user.id, input?.classroomId)),
  }),
  classrooms: router({
    mine: teacherProcedure.query(({ ctx }) => getTeacherClassrooms(ctx.user.id)),
    join: protectedProcedure.input(z.object({ joinCode: z.string().trim().min(4).max(24) })).mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "student") throw new TRPCError({ code: "FORBIDDEN", message: "只有學生帳號可以加入班級" });
      const classroom = await findClassroomByCode(input.joinCode.toUpperCase()); if (!classroom) return { joined: false as const, reason: "找不到或已停用這個班級代碼" };
      const alreadyMember = await isClassroomMember(classroom.id, ctx.user.id); if (!alreadyMember) await joinClassroom(classroom.id, ctx.user.id); return { joined: true as const, alreadyMember, classroom };
    }),
  }),
  teacher: router({
    createClassroom: teacherProcedure.input(z.object({ name: z.string().trim().min(1).max(120) })).mutation(({ ctx, input }) => createClassroom({ teacherId: ctx.user.id, name: input.name, joinCode: nanoid(8).toUpperCase(), isActive: true })),
    rotateJoinCode: teacherProcedure.input(z.object({ classroomId: z.number().int().positive() })).mutation(async ({ ctx, input }) => { const classroom = await assertCanManageClassroom(ctx.user.id, ctx.user.role, input.classroomId); const joinCode = nanoid(8).toUpperCase(); await updateClassroom(classroom.id, { joinCode }); return { classroomId: classroom.id, joinCode }; }),
    setClassroomActive: teacherProcedure.input(z.object({ classroomId: z.number().int().positive(), isActive: z.boolean() })).mutation(async ({ ctx, input }) => { const classroom = await assertCanManageClassroom(ctx.user.id, ctx.user.role, input.classroomId); await updateClassroom(classroom.id, { isActive: input.isActive }); return { classroomId: classroom.id, isActive: input.isActive }; }),
    addWord: teacherProcedure.input(z.object({ volume: z.string().trim().min(1).max(32), lesson: z.string().trim().min(1).max(64), english: z.string().trim().min(1).max(120), chinese: z.string().trim().min(1).max(255), example: z.string().max(2000).optional() })).mutation(({ ctx, input }) => createVocabWord({ ...input, ownerId: ctx.user.id })),
    overview: teacherProcedure.query(async ({ ctx }) => {
      const classrooms = ctx.user.role === "system_admin" ? await getAllClassrooms() : await getTeacherClassrooms(ctx.user.id);
      const classReports = await Promise.all(classrooms.map(async (classroom) => { const students = await getClassroomStudents(classroom.id); const attempts = await getClassroomAttempts(classroom.id); const studentReports = students.map(({ student, joinedAt }) => { const rows = attempts.filter((attempt) => attempt.studentId === student.id).map(({ wordId, english, chinese, correct, answeredAt }) => ({ wordId, english, chinese, correct, answeredAt })); const performance = buildWordPerformance(rows); const attemptCount = rows.length; const correctCount = rows.filter((row) => row.correct).length; return { student: { id: student.id, name: student.name, email: student.email, role: student.role }, joinedAt, attempts: attemptCount, correct: correctCount, accuracy: attemptCount ? Math.round((correctCount / attemptCount) * 100) : 0, dueWords: performance.filter((item) => item.due).length, performance }; }); return { classroom, students: studentReports, totalAttempts: attempts.length, totalCorrect: attempts.filter((attempt) => attempt.correct).length }; }));
      return { teacher: { id: ctx.user.id, name: ctx.user.name, email: ctx.user.email, role: ctx.user.role }, classrooms: classReports };
    }),
    studentPerformance: teacherProcedure.input(z.object({ studentId: z.number().int().positive(), classroomId: z.number().int().positive().optional() })).query(async ({ ctx, input }) => { if (ctx.user.role === "teacher") { if (input.classroomId) { await assertCanManageClassroom(ctx.user.id, ctx.user.role, input.classroomId); const members = await getClassroomStudents(input.classroomId); if (!members.some((member) => member.student.id === input.studentId)) throw new TRPCError({ code: "FORBIDDEN", message: "學生不屬於你的班級" }); } else { const classroomIds = await getTeacherClassrooms(ctx.user.id); const memberships = await Promise.all(classroomIds.map((classroom) => getClassroomStudents(classroom.id))); const inScope = memberships.some((members) => members.some((member) => member.student.id === input.studentId)); if (!inScope) throw new TRPCError({ code: "FORBIDDEN", message: "學生不屬於你的班級" }); } } return getStudentPerformance(input.studentId, input.classroomId); }),
  }),
  systemAdmin: router({
    users: systemAdminProcedure.query(() => listUsers()),
    setUserRole: systemAdminProcedure.input(z.object({ userId: z.number().int().positive(), role: roleSchema })).mutation(async ({ input }) => { await updateUserRole(input.userId, input.role); return { updated: true as const }; }),
    allClassrooms: systemAdminProcedure.query(() => getAllClassrooms()),
  }),
});

async function assertCanManageClassroom(userId: number, role: "system_admin" | "teacher" | "student", classroomId: number) {
  const classroom = await getClassroomById(classroomId);
  if (!classroom || (role === "teacher" && classroom.teacherId !== userId)) throw new TRPCError({ code: "NOT_FOUND", message: "找不到可管理的班級" });
  return classroom;
}

export type AppRouter = typeof appRouter;
