import assert from "node:assert/strict";
import test from "node:test";
import {
  HOME_ENTRIES,
  getTeacherEntryDescription,
} from "../src/entryDomain.js";

test("defines the three homepage destinations in display order", () => {
  assert.deepEqual(HOME_ENTRIES, [
    {
      id: "student",
      title: "學生開始測驗",
      description: "使用專屬代碼＋學生姓名進入",
      href: "quiz.html",
      primary: true,
    },
    {
      id: "teacher",
      title: "教師／管理員",
      description: "審核申請、建立學生、查看全部紀錄",
      href: "teacher.html?entry=teacher",
      primary: false,
    },
    {
      id: "parent",
      title: "家長查看紀錄",
      description: "使用 Google 帳號查看已指定學生",
      href: "teacher.html?entry=parent",
      primary: false,
    },
  ]);
});

test("derives teacher, parent, and fallback sign-in descriptions", () => {
  assert.equal(
    getTeacherEntryDescription("teacher"),
    "使用 Google 帳號登入後，可申請教師權限或進入管理功能。",
  );
  assert.equal(
    getTeacherEntryDescription("parent"),
    "使用 Google 帳號登入後，可申請查看指定學生的測驗紀錄。",
  );
  assert.equal(
    getTeacherEntryDescription("unknown"),
    "首次登入後，可申請教師或家長查閱權限。",
  );
  assert.equal(
    getTeacherEntryDescription(null),
    "首次登入後，可申請教師或家長查閱權限。",
  );
});
