import { PhysicsChemistryQuiz } from "../PhysicsChemistryQuiz.jsx";
import { part2Adapter } from "./part2Adapter.js";
import { resolvePart2Figure } from "./part2Figures.js";

export default function Part2Quiz({ progress, sync }) {
  return (
    <PhysicsChemistryQuiz
      adapter={part2Adapter}
      resolveFigure={resolvePart2Figure}
      title="理化科 B3 1-1～2-1（貳）"
      range="第三冊 1-1～2-1 綜合複習｜每題 4 分，共 25 題 100 分"
      progress={progress}
      sync={sync}
    />
  );
}
