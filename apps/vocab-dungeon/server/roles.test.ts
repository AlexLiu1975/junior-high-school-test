import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./db", async () => {
  const actual = await vi.importActual<typeof import("./db")>("./db");
  return { ...actual, findClassroomByCode: vi.fn(), isClassroomMember: vi.fn(), joinClassroom: vi.fn(), getTeacherClassrooms: vi.fn().mockResolvedValue([]), getAllClassrooms: vi.fn().mockResolvedValue([]) };
});

import { appRouter } from "./routers";
import * as db from "./db";
import type { TrpcContext } from "./_core/context";

type Role = "system_admin" | "teacher" | "student";
function context(role: Role): TrpcContext { return { user: { id: 7, openId: `test-${role}`, name: role, email: `${role}@test.local`, loginMethod: "test", role, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] }; }
const classroom = { id: 4, teacherId: 11, name: "八年級英文", joinCode: "ABCD1234", isActive: true, createdAt: new Date(), updatedAt: new Date() };

beforeEach(() => { vi.clearAllMocks(); vi.mocked(db.getTeacherClassrooms).mockResolvedValue([]); vi.mocked(db.getAllClassrooms).mockResolvedValue([]); });

describe("three-level roles and classroom access", () => {
  it("blocks students from creating classrooms", async () => { await expect(appRouter.createCaller(context("student")).teacher.createClassroom({ name: "八年級英文" })).rejects.toMatchObject({ code: "FORBIDDEN" }); });
  it("blocks teachers from changing global roles", async () => { await expect(appRouter.createCaller(context("teacher")).systemAdmin.setUserRole({ userId: 8, role: "student" })).rejects.toMatchObject({ code: "FORBIDDEN" }); });
  it("blocks students from changing global roles", async () => { await expect(appRouter.createCaller(context("student")).systemAdmin.setUserRole({ userId: 8, role: "teacher" })).rejects.toMatchObject({ code: "FORBIDDEN" }); });
  it("blocks teachers from querying a student outside their class scope", async () => { await expect(appRouter.createCaller(context("teacher")).teacher.studentPerformance({ studentId: 99 })).rejects.toMatchObject({ code: "FORBIDDEN" }); });
  it("returns false for an invalid join code", async () => { vi.mocked(db.findClassroomByCode).mockResolvedValue(undefined); await expect(appRouter.createCaller(context("student")).classrooms.join({ joinCode: "NOPE" })).resolves.toMatchObject({ joined: false }); });
  it("joins an active classroom once and does not write a duplicate member", async () => { vi.mocked(db.findClassroomByCode).mockResolvedValue(classroom); vi.mocked(db.isClassroomMember).mockResolvedValueOnce(false).mockResolvedValueOnce(true); const caller = appRouter.createCaller(context("student")); await expect(caller.classrooms.join({ joinCode: "abcd1234" })).resolves.toMatchObject({ joined: true, alreadyMember: false }); await expect(caller.classrooms.join({ joinCode: "ABCD1234" })).resolves.toMatchObject({ joined: true, alreadyMember: true }); expect(db.joinClassroom).toHaveBeenCalledTimes(1); });
  it("allows system administrators to access the global classroom endpoint", async () => { await expect(appRouter.createCaller(context("system_admin")).systemAdmin.allClassrooms()).resolves.toEqual([]); });
  it("blocks students from teacher and system administration endpoints", async () => { const caller = appRouter.createCaller(context("student")); await expect(caller.teacher.overview()).rejects.toMatchObject({ code: "FORBIDDEN" }); await expect(caller.teacher.studentPerformance({ studentId: 99 })).rejects.toMatchObject({ code: "FORBIDDEN" }); await expect(caller.systemAdmin.allClassrooms()).rejects.toMatchObject({ code: "FORBIDDEN" }); });
  it("allows students to query only their own personal performance", async () => { const student = appRouter.createCaller(context("student")); await expect(student.learning.myPerformance()).resolves.toEqual([]); });
  it("blocks staff from using the student personal performance endpoint", async () => { const teacher = appRouter.createCaller(context("teacher")); const admin = appRouter.createCaller(context("system_admin")); await expect(teacher.learning.myPerformance()).rejects.toMatchObject({ code: "FORBIDDEN" }); await expect(admin.learning.myPerformance()).rejects.toMatchObject({ code: "FORBIDDEN" }); });
});
