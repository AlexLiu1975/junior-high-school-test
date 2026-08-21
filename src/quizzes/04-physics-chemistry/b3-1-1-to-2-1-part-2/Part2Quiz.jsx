import { PhysicsChemistryQuiz } from "../PhysicsChemistryQuiz.jsx";
import { part2Adapter } from "./part2Adapter.js";
import { resolvePart2Figure } from "./part2Figures.js";

const INTRO = "每一題都是一隻怪物！選出答案就立刻分出勝負——答對擊敗怪物、連續答對觸發 COMBO 連擊，並馬上顯示解析。作答會即時上傳雲端判定（答案不會出現在頁面原始碼），全部答完後自動記錄成績。";

export default function Part2Quiz({ progress, sync }) {
  return (
    <PhysicsChemistryQuiz
      adapter={part2Adapter}
      resolveFigure={resolvePart2Figure}
      title="理化科 B3 1-1～2-1（貳）"
      subtitle="第三冊 1-1～2-1 綜合複習｜貳　25 題／每題 4 分【滿分 100 分】"
      intro={INTRO}
      pointsPerQuestion={4}
      progress={progress}
      sync={sync}
    />
  );
}
