import { boolean, int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["system_admin", "teacher", "student"]).default("student").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const classrooms = mysqlTable("classrooms", {
  id: int("id").autoincrement().primaryKey(),
  teacherId: int("teacherId").notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  joinCode: varchar("joinCode", { length: 24 }).notNull().unique(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  isActive: boolean("isActive").default(true).notNull(),
});

export const classroomMembers = mysqlTable("classroomMembers", {
  id: int("id").autoincrement().primaryKey(),
  classroomId: int("classroomId").notNull(),
  studentId: int("studentId").notNull(),
  joinedAt: timestamp("joinedAt").defaultNow().notNull(),
});

export const vocabWords = mysqlTable("vocabWords", {
  id: int("id").autoincrement().primaryKey(),
  ownerId: int("ownerId"),
  volume: varchar("volume", { length: 32 }).notNull(),
  lesson: varchar("lesson", { length: 64 }).notNull(),
  english: varchar("english", { length: 120 }).notNull(),
  chinese: varchar("chinese", { length: 255 }).notNull(),
  example: text("example"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const wordAttempts = mysqlTable("wordAttempts", {
  id: int("id").autoincrement().primaryKey(),
  studentId: int("studentId").notNull(),
  wordId: int("wordId").notNull(),
  classroomId: int("classroomId"),
  correct: boolean("correct").notNull(),
  questionType: varchar("questionType", { length: 32 }).notNull(),
  answeredAt: timestamp("answeredAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Classroom = typeof classrooms.$inferSelect;
export type InsertClassroom = typeof classrooms.$inferInsert;
export type ClassroomMember = typeof classroomMembers.$inferSelect;
export type VocabWord = typeof vocabWords.$inferSelect;
export type InsertVocabWord = typeof vocabWords.$inferInsert;
export type WordAttempt = typeof wordAttempts.$inferSelect;
export type InsertWordAttempt = typeof wordAttempts.$inferInsert;
