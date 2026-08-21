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
  {
    id: "physics-chemistry-b3-1-1-to-2-1-part-1",
    version: 1,
    kind: "multiple-choice",
    subject: "PhysicsChemistry",
    title: "理化科 B3 1-1～2-1（壹）",
    catalogDescription: "第三冊 1-1～2-1 綜合複習｜壹（40 題，每題 2.5 分，共 100 分）",
  },
  {
    id: "physics-chemistry-b3-1-1-to-2-1-part-2",
    version: 1,
    kind: "multiple-choice",
    subject: "PhysicsChemistry",
    title: "理化科 B3 1-1～2-1（貳）",
    catalogDescription: "第三冊 1-1～2-1 綜合複習｜貳（25 題，每題 4 分，共 100 分）",
  },
]);
