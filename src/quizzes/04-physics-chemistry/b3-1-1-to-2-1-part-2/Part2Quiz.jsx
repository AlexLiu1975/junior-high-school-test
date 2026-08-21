import { PhysicsChemistryQuiz } from "../PhysicsChemistryQuiz.jsx";
import { part2Adapter } from "./part2Adapter.js";
import { resolvePart2Figure } from "./part2Figures.js";

const INTRO = "每一題都是一隻怪物！先選出你的答案，全部作答後按「開始結算」——答對就擊敗怪物、連續答對觸發 COMBO 連擊。為維持公平，正解與解析在提交結算後才揭曉。";

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
