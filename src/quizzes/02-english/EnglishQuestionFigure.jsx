const layouts = [
  {
    label: "(A)", x: 20, y: 20,
    rooms: [
      [40, 10, 60, 80, "English"], [40, 90, 60, 80, "Animal"],
      [150, 10, 70, 60, "Fun"], [150, 70, 70, 60, "Food"],
    ],
  },
  {
    label: "(B)", x: 260, y: 20,
    rooms: [
      [40, 10, 180, 50, "Animal"], [40, 60, 60, 50, "Fun"],
      [40, 110, 60, 60, "English"], [150, 60, 70, 60, "Food"],
    ],
  },
  {
    label: "(C)", x: 20, y: 210,
    rooms: [
      [40, 10, 60, 50, "Fun"], [100, 10, 60, 50, "English"],
      [160, 10, 60, 50, "Food"], [40, 60, 60, 110, "Animal"],
    ],
  },
  {
    label: "(D)", x: 260, y: 210,
    rooms: [
      [40, 10, 60, 70, "English"], [40, 80, 60, 90, "Fun"],
      [150, 10, 70, 50, "Animal"], [150, 80, 70, 50, "Food"],
    ],
  },
];

function LibraryLayout({ label, x, y, rooms }) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      <text x="15" y="20" fontWeight="bold" fontSize="16" fill="#333">{label}</text>
      <rect x="40" y="10" width="180" height="160" fill="#fdfdfd" stroke="#333" strokeWidth="2" />
      <path d="M 140 170 A 30 30 0 0 1 170 140" stroke="#333" strokeWidth="1.5" strokeDasharray="3 3" fill="none" />
      <line x1="140" y1="170" x2="140" y2="150" stroke="#333" strokeWidth="2" />
      {rooms.map(([roomX, roomY, width, height, name]) => (
        <g key={`${label}-${name}`}>
          <rect x={roomX} y={roomY} width={width} height={height} fill="#fdfdfd" stroke="#333" strokeWidth="2" />
          <text x={roomX + (width / 2)} y={roomY + (height / 2) + 5}>{name}</text>
        </g>
      ))}
    </g>
  );
}

export function EnglishQuestionFigure({ figureId }) {
  if (figureId !== "library-layout-q36") return null;

  return (
    <div className="my-4 flex justify-center rounded-lg border border-slate-300 bg-white p-2.5">
      <svg
        aria-label="Four possible layouts for Mark's small library"
        width="500"
        height="400"
        viewBox="0 0 500 400"
        role="img"
        style={{ fontFamily: "sans-serif", fontSize: "14px", textAnchor: "middle" }}
      >
        {layouts.map((layout) => <LibraryLayout key={layout.label} {...layout} />)}
      </svg>
    </div>
  );
}
