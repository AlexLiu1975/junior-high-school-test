import { describe, expect, it } from "vitest";
import { buildWordPerformance, reviewIntervalDays } from "./db";

describe("learning performance", () => {
  it("uses longer review intervals after consecutive correct answers", () => {
    expect(reviewIntervalDays(0)).toBe(0);
    expect(reviewIntervalDays(1)).toBe(1);
    expect(reviewIntervalDays(3)).toBe(4);
    expect(reviewIntervalDays(6)).toBe(30);
  });

  it("summarizes attempts and prioritizes due words", () => {
    const now = new Date();
    const performance = buildWordPerformance([
      { wordId: 1, english: "adventure", chinese: "冒險", correct: true, answeredAt: new Date(now.getTime() - 2 * 86400000) },
      { wordId: 1, english: "adventure", chinese: "冒險", correct: true, answeredAt: new Date(now.getTime() - 86400000) },
      { wordId: 2, english: "careful", chinese: "小心的", correct: false, answeredAt: new Date(now.getTime() - 86400000) },
    ]);

    expect(performance[0]).toMatchObject({ wordId: 2, attempts: 1, correct: 0, wrong: 1, accuracy: 0, streak: 0, due: true });
    expect(performance.find((item) => item.wordId === 1)).toMatchObject({ attempts: 2, correct: 2, wrong: 0, accuracy: 100, streak: 2 });
  });
});
