function deepFreeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export const QUIZ_CATALOG = deepFreeze([
  {
    id: "biology-cell-microscope-1",
    version: 1,
    kind: "multiple-choice",
    subject: "Biology",
    title: "第1回 第1、2單元｜細胞與顯微鏡",
    catalogDescription: "細胞構造、物質進出細胞與顯微鏡操作複習",
  },
  {
    id: "english-review-2",
    version: 1,
    kind: "multiple-choice",
    subject: "English",
    title: "英語科 第2回複習考",
    catalogDescription: "第一冊 L3～L4（表位置的介系詞／Where問答／祈使句／人稱代名詞受格／can問答）",
  },
  {
    id: "periodic-table",
    version: 1,
    kind: "placement",
    subject: "Science",
    title: "化學元素週期表",
    catalogDescription: "118 個元素的位置、分類與符號練習",
  },
]);
