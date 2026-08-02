export const HOME_ENTRIES = Object.freeze([
  Object.freeze({
    id: "student",
    title: "學生開始測驗",
    description: "使用專屬代碼＋學生姓名進入",
    href: "quiz.html",
    primary: true,
  }),
  Object.freeze({
    id: "teacher",
    title: "教師／管理員",
    description: "審核申請、建立學生、查看全部紀錄",
    href: "teacher.html?entry=teacher",
    primary: false,
  }),
  Object.freeze({
    id: "parent",
    title: "家長查看紀錄",
    description: "使用 Google 帳號查看已指定學生",
    href: "teacher.html?entry=parent",
    primary: false,
  }),
]);

const fallbackDescription = "首次登入後，可申請教師或家長查閱權限。";

export function getTeacherEntryDescription(entry) {
  if (entry === "teacher") {
    return "使用 Google 帳號登入後，可申請教師權限或進入管理功能。";
  }
  if (entry === "parent") {
    return "使用 Google 帳號登入後，可申請查看指定學生的測驗紀錄。";
  }
  return fallbackDescription;
}
