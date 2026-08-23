import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { classrooms, classroomMembers, InsertClassroom, InsertUser, users, vocabWords, InsertVocabWord, wordAttempts } from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try { _db = drizzle(process.env.DATABASE_URL); } catch (error) { console.warn("[Database] Failed to connect:", error); _db = null; }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values: InsertUser = { openId: user.openId }; const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  textFields.forEach((field) => { if (user[field] !== undefined) { values[field] = user[field] ?? null; updateSet[field] = user[field] ?? null; } });
  if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
  if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; } else if (user.openId === ENV.ownerOpenId) { values.role = "system_admin"; updateSet.role = "system_admin"; }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (!Object.keys(updateSet).length) updateSet.lastSignedIn = new Date();
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb(); if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1); return result[0];
}

export async function updateUserRole(userId: number, role: "system_admin" | "teacher" | "student") {
  const db = await getDb(); if (!db) throw new Error("Database not available");
  await db.update(users).set({ role }).where(eq(users.id, userId));
}

export async function listUsers() {
  const db = await getDb(); if (!db) return [];
  return db.select({ id: users.id, name: users.name, email: users.email, role: users.role, lastSignedIn: users.lastSignedIn }).from(users).orderBy(users.name);
}

export async function createClassroom(input: InsertClassroom) {
  const db = await getDb(); if (!db) throw new Error("Database not available");
  const result = await db.insert(classrooms).values(input); return Number(result[0].insertId);
}

export async function getTeacherClassrooms(teacherId: number) {
  const db = await getDb(); if (!db) return [];
  return db.select().from(classrooms).where(eq(classrooms.teacherId, teacherId)).orderBy(desc(classrooms.createdAt));
}

export async function getAllClassrooms() {
  const db = await getDb(); if (!db) return [];
  return db.select().from(classrooms).orderBy(desc(classrooms.createdAt));
}

export async function getClassroomById(classroomId: number) {
  const db = await getDb(); if (!db) return undefined;
  const result = await db.select().from(classrooms).where(eq(classrooms.id, classroomId)).limit(1); return result[0];
}

export async function updateClassroom(classroomId: number, patch: Partial<Pick<typeof classrooms.$inferInsert, "joinCode" | "isActive">>) {
  const db = await getDb(); if (!db) throw new Error("Database not available");
  await db.update(classrooms).set(patch).where(eq(classrooms.id, classroomId));
}

export async function getClassroomStudents(classroomId: number) {
  const db = await getDb(); if (!db) return [];
  return db.select({ memberId: classroomMembers.id, joinedAt: classroomMembers.joinedAt, student: users }).from(classroomMembers).innerJoin(users, eq(classroomMembers.studentId, users.id)).where(eq(classroomMembers.classroomId, classroomId)).orderBy(users.name);
}

export async function getStudentClassroomIds(studentId: number) {
  const db = await getDb(); if (!db) return [];
  const rows = await db.select({ classroomId: classroomMembers.classroomId }).from(classroomMembers).where(eq(classroomMembers.studentId, studentId));
  return rows.map((row) => row.classroomId);
}

export async function joinClassroom(classroomId: number, studentId: number) {
  const db = await getDb(); if (!db) throw new Error("Database not available");
  const existing = await db.select().from(classroomMembers).where(and(eq(classroomMembers.classroomId, classroomId), eq(classroomMembers.studentId, studentId))).limit(1);
  if (!existing.length) await db.insert(classroomMembers).values({ classroomId, studentId });
}

export async function isClassroomMember(classroomId: number, studentId: number) {
  const db = await getDb(); if (!db) return false;
  const result = await db.select({ id: classroomMembers.id }).from(classroomMembers).where(and(eq(classroomMembers.classroomId, classroomId), eq(classroomMembers.studentId, studentId))).limit(1);
  return result.length > 0;
}

export async function findClassroomByCode(joinCode: string) {
  const db = await getDb(); if (!db) return undefined;
  const result = await db.select().from(classrooms).where(and(eq(classrooms.joinCode, joinCode), eq(classrooms.isActive, true))).limit(1); return result[0];
}

export async function listVocabWords(volume?: string, lesson?: string) {
  const db = await getDb(); if (!db) return [];
  const conditions = []; if (volume) conditions.push(eq(vocabWords.volume, volume)); if (lesson) conditions.push(eq(vocabWords.lesson, lesson));
  return db.select().from(vocabWords).where(conditions.length ? and(...conditions) : undefined).orderBy(vocabWords.volume, vocabWords.lesson, vocabWords.english);
}

export async function createVocabWord(input: InsertVocabWord) {
  const db = await getDb(); if (!db) throw new Error("Database not available");
  const result = await db.insert(vocabWords).values(input); return Number(result[0].insertId);
}

export async function recordWordAttempt(input: { studentId: number; wordId: number; classroomId?: number; correct: boolean; questionType: string }) {
  const db = await getDb(); if (!db) throw new Error("Database not available");
  await db.insert(wordAttempts).values({ ...input, classroomId: input.classroomId ?? null });
}

export type WordPerformance = { wordId: number; english: string | null; chinese: string | null; attempts: number; correct: number; wrong: number; accuracy: number; streak: number; lastAnsweredAt: Date | null; nextReviewAt: Date | null; due: boolean };
export const reviewIntervalDays = (streak: number) => [0, 1, 2, 4, 7, 14, 30][Math.min(streak, 6)] ?? 30;
export function buildWordPerformance(rows: Array<{ wordId: number; english: string | null; chinese: string | null; correct: boolean; answeredAt: Date }>): WordPerformance[] {
  const grouped = new Map<number, WordPerformance>();
  for (const row of rows) {
    const existing = grouped.get(row.wordId) ?? { wordId: row.wordId, english: row.english, chinese: row.chinese, attempts: 0, correct: 0, wrong: 0, accuracy: 0, streak: 0, lastAnsweredAt: null, nextReviewAt: null, due: true };
    existing.attempts += 1; if (row.correct) { existing.correct += 1; existing.streak += 1; } else { existing.wrong += 1; existing.streak = 0; }
    if (!existing.lastAnsweredAt || row.answeredAt > existing.lastAnsweredAt) existing.lastAnsweredAt = row.answeredAt;
    grouped.set(row.wordId, existing);
  }
  const now = Date.now();
  return Array.from(grouped.values()).map((item) => { item.accuracy = item.attempts ? Math.round((item.correct / item.attempts) * 100) : 0; item.nextReviewAt = item.lastAnsweredAt ? new Date(item.lastAnsweredAt.getTime() + reviewIntervalDays(item.streak) * 86400000) : null; item.due = !item.nextReviewAt || item.nextReviewAt.getTime() <= now || item.wrong > item.correct; return item; }).sort((a, b) => Number(b.due) - Number(a.due) || a.accuracy - b.accuracy || (a.nextReviewAt?.getTime() ?? 0) - (b.nextReviewAt?.getTime() ?? 0));
}

export async function getStudentPerformance(studentId: number, classroomId?: number) {
  const db = await getDb(); if (!db) return [];
  const conditions = [eq(wordAttempts.studentId, studentId)]; if (classroomId) conditions.push(eq(wordAttempts.classroomId, classroomId));
  const rows = await db.select({ wordId: wordAttempts.wordId, english: vocabWords.english, chinese: vocabWords.chinese, correct: wordAttempts.correct, answeredAt: wordAttempts.answeredAt }).from(wordAttempts).leftJoin(vocabWords, eq(wordAttempts.wordId, vocabWords.id)).where(and(...conditions)).orderBy(desc(wordAttempts.answeredAt));
  return buildWordPerformance(rows);
}

export async function getClassroomAttempts(classroomId: number) {
  const db = await getDb(); if (!db) return [];
  return db.select({ studentId: wordAttempts.studentId, wordId: wordAttempts.wordId, english: vocabWords.english, chinese: vocabWords.chinese, correct: wordAttempts.correct, answeredAt: wordAttempts.answeredAt }).from(wordAttempts).leftJoin(vocabWords, eq(wordAttempts.wordId, vocabWords.id)).where(eq(wordAttempts.classroomId, classroomId)).orderBy(desc(wordAttempts.answeredAt));
}
