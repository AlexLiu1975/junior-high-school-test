import { PhysicsChemistryQuiz } from "../PhysicsChemistryQuiz.jsx";
import { part1Adapter } from "./part1Adapter.js";
import { resolvePart1Figure } from "./part1Figures.js";

export default function Part1Quiz({ progress, sync }) {
  return (
    <PhysicsChemistryQuiz
      adapter={part1Adapter}
      resolveFigure={resolvePart1Figure}
      title="理化科 B3 1-1～2-1（壹）"
      range="第三冊 1-1～2-1 綜合複習｜每題 2.5 分，共 40 題 100 分"
      progress={progress}
      sync={sync}
    />
  );
}
