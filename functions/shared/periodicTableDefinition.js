const RAW_ELEMENTS = [
  [1, "H", "氫", "Hydrogen", "c-nonmetal", 1, 1], [2, "He", "氦", "Helium", "c-noble", 1, 18],
  [3, "Li", "鋰", "Lithium", "c-alkali", 2, 1], [4, "Be", "鈹", "Beryllium", "c-alkaline", 2, 2], [5, "B", "硼", "Boron", "c-metalloid", 2, 13], [6, "C", "碳", "Carbon", "c-nonmetal", 2, 14], [7, "N", "氮", "Nitrogen", "c-nonmetal", 2, 15], [8, "O", "氧", "Oxygen", "c-nonmetal", 2, 16], [9, "F", "氟", "Fluorine", "c-halogen", 2, 17], [10, "Ne", "氖", "Neon", "c-noble", 2, 18],
  [11, "Na", "鈉", "Sodium", "c-alkali", 3, 1], [12, "Mg", "鎂", "Magnesium", "c-alkaline", 3, 2], [13, "Al", "鋁", "Aluminium", "c-post", 3, 13], [14, "Si", "矽", "Silicon", "c-metalloid", 3, 14], [15, "P", "磷", "Phosphorus", "c-nonmetal", 3, 15], [16, "S", "硫", "Sulfur", "c-nonmetal", 3, 16], [17, "Cl", "氯", "Chlorine", "c-halogen", 3, 17], [18, "Ar", "氬", "Argon", "c-noble", 3, 18],
  [19, "K", "鉀", "Potassium", "c-alkali", 4, 1], [20, "Ca", "鈣", "Calcium", "c-alkaline", 4, 2], [21, "Sc", "鈧", "Scandium", "c-transition", 4, 3], [22, "Ti", "鈦", "Titanium", "c-transition", 4, 4], [23, "V", "釩", "Vanadium", "c-transition", 4, 5], [24, "Cr", "鉻", "Chromium", "c-transition", 4, 6], [25, "Mn", "錳", "Manganese", "c-transition", 4, 7], [26, "Fe", "鐵", "Iron", "c-transition", 4, 8], [27, "Co", "鈷", "Cobalt", "c-transition", 4, 9], [28, "Ni", "鎳", "Nickel", "c-transition", 4, 10], [29, "Cu", "銅", "Copper", "c-transition", 4, 11], [30, "Zn", "鋅", "Zinc", "c-transition", 4, 12], [31, "Ga", "鎵", "Gallium", "c-post", 4, 13], [32, "Ge", "鍺", "Germanium", "c-metalloid", 4, 14], [33, "As", "砷", "Arsenic", "c-metalloid", 4, 15], [34, "Se", "硒", "Selenium", "c-nonmetal", 4, 16], [35, "Br", "溴", "Bromine", "c-halogen", 4, 17], [36, "Kr", "氪", "Krypton", "c-noble", 4, 18],
  [37, "Rb", "銣", "Rubidium", "c-alkali", 5, 1], [38, "Sr", "鍶", "Strontium", "c-alkaline", 5, 2], [39, "Y", "釔", "Yttrium", "c-transition", 5, 3], [40, "Zr", "鋯", "Zirconium", "c-transition", 5, 4], [41, "Nb", "鈮", "Niobium", "c-transition", 5, 5], [42, "Mo", "鉬", "Molybdenum", "c-transition", 5, 6], [43, "Tc", "鎝", "Technetium", "c-transition", 5, 7], [44, "Ru", "釕", "Ruthenium", "c-transition", 5, 8], [45, "Rh", "銠", "Rhodium", "c-transition", 5, 9], [46, "Pd", "鈀", "Palladium", "c-transition", 5, 10], [47, "Ag", "銀", "Silver", "c-transition", 5, 11], [48, "Cd", "鎘", "Cadmium", "c-transition", 5, 12], [49, "In", "銦", "Indium", "c-post", 5, 13], [50, "Sn", "錫", "Tin", "c-post", 5, 14], [51, "Sb", "銻", "Antimony", "c-metalloid", 5, 15], [52, "Te", "碲", "Tellurium", "c-metalloid", 5, 16], [53, "I", "碘", "Iodine", "c-halogen", 5, 17], [54, "Xe", "氙", "Xenon", "c-noble", 5, 18],
  [55, "Cs", "銫", "Caesium", "c-alkali", 6, 1], [56, "Ba", "鋇", "Barium", "c-alkaline", 6, 2], [57, "La", "鑭", "Lanthanum", "c-lan", "lan", 1], [58, "Ce", "鈰", "Cerium", "c-lan", "lan", 2], [59, "Pr", "鐠", "Praseodymium", "c-lan", "lan", 3], [60, "Nd", "釹", "Neodymium", "c-lan", "lan", 4], [61, "Pm", "鉕", "Promethium", "c-lan", "lan", 5], [62, "Sm", "釤", "Samarium", "c-lan", "lan", 6], [63, "Eu", "銪", "Europium", "c-lan", "lan", 7], [64, "Gd", "釓", "Gadolinium", "c-lan", "lan", 8], [65, "Tb", "鋱", "Terbium", "c-lan", "lan", 9], [66, "Dy", "鏑", "Dysprosium", "c-lan", "lan", 10], [67, "Ho", "鈥", "Holmium", "c-lan", "lan", 11], [68, "Er", "鉺", "Erbium", "c-lan", "lan", 12], [69, "Tm", "銩", "Thulium", "c-lan", "lan", 13], [70, "Yb", "鐿", "Ytterbium", "c-lan", "lan", 14], [71, "Lu", "鎦", "Lutetium", "c-lan", "lan", 15],
  [72, "Hf", "鉿", "Hafnium", "c-transition", 6, 4], [73, "Ta", "鉭", "Tantalum", "c-transition", 6, 5], [74, "W", "鎢", "Tungsten", "c-transition", 6, 6], [75, "Re", "錸", "Rhenium", "c-transition", 6, 7], [76, "Os", "鋨", "Osmium", "c-transition", 6, 8], [77, "Ir", "銥", "Iridium", "c-transition", 6, 9], [78, "Pt", "鉑", "Platinum", "c-transition", 6, 10], [79, "Au", "金", "Gold", "c-transition", 6, 11], [80, "Hg", "汞", "Mercury", "c-transition", 6, 12], [81, "Tl", "鉈", "Thallium", "c-post", 6, 13], [82, "Pb", "鉛", "Lead", "c-post", 6, 14], [83, "Bi", "鉍", "Bismuth", "c-post", 6, 15], [84, "Po", "釙", "Polonium", "c-metalloid", 6, 16], [85, "At", "砈", "Astatine", "c-halogen", 6, 17], [86, "Rn", "氡", "Radon", "c-noble", 6, 18],
  [87, "Fr", "鍅", "Francium", "c-alkali", 7, 1], [88, "Ra", "鐳", "Radium", "c-alkaline", 7, 2], [89, "Ac", "錒", "Actinium", "c-act", "act", 1], [90, "Th", "釷", "Thorium", "c-act", "act", 2], [91, "Pa", "鏷", "Protactinium", "c-act", "act", 3], [92, "U", "鈾", "Uranium", "c-act", "act", 4], [93, "Np", "錼", "Neptunium", "c-act", "act", 5], [94, "Pu", "鈽", "Plutonium", "c-act", "act", 6], [95, "Am", "鋂", "Americium", "c-act", "act", 7], [96, "Cm", "鋦", "Curium", "c-act", "act", 8], [97, "Bk", "鉳", "Berkelium", "c-act", "act", 9], [98, "Cf", "鉲", "Californium", "c-act", "act", 10], [99, "Es", "鑀", "Einsteinium", "c-act", "act", 11], [100, "Fm", "鐨", "Fermium", "c-act", "act", 12], [101, "Md", "鍆", "Mendelevium", "c-act", "act", 13], [102, "No", "鍩", "Nobelium", "c-act", "act", 14], [103, "Lr", "鐒", "Lawrencium", "c-act", "act", 15],
  [104, "Rf", "鑪", "Rutherfordium", "c-transition", 7, 4], [105, "Db", "𨧀", "Dubnium", "c-transition", 7, 5], [106, "Sg", "𨭎", "Seaborgium", "c-transition", 7, 6], [107, "Bh", "𨨏", "Bohrium", "c-transition", 7, 7], [108, "Hs", "𨭆", "Hassium", "c-transition", 7, 8], [109, "Mt", "鿏", "Meitnerium", "c-transition", 7, 9], [110, "Ds", "鐽", "Darmstadtium", "c-transition", 7, 10], [111, "Rg", "錀", "Roentgenium", "c-transition", 7, 11], [112, "Cn", "鎶", "Copernicium", "c-transition", 7, 12], [113, "Nh", "鉨", "Nihonium", "c-post", 7, 13], [114, "Fl", "鈇", "Flerovium", "c-post", 7, 14], [115, "Mc", "鏌", "Moscovium", "c-post", 7, 15], [116, "Lv", "鉝", "Livermorium", "c-post", 7, 16], [117, "Ts", "鿬", "Tennessine", "c-halogen", 7, 17], [118, "Og", "鿫", "Oganesson", "c-noble", 7, 18],
];

const CATEGORY_NAMES = {
  "c-alkali": "alkali-metal",
  "c-alkaline": "alkaline-earth-metal",
  "c-transition": "transition-metal",
  "c-post": "post-transition-metal",
  "c-metalloid": "metalloid",
  "c-nonmetal": "nonmetal",
  "c-halogen": "halogen",
  "c-noble": "noble-gas",
  "c-lan": "lanthanide",
  "c-act": "actinide",
};

function makeElement([atomicNumber, symbol, chineseName, englishName, categoryClass, sourceRow, column]) {
  const row = sourceRow === "lan" ? "lanthanide" : sourceRow === "act" ? "actinide" : "main";
  const period = row === "lanthanide" ? 6 : row === "actinide" ? 7 : sourceRow;
  const targetId = row === "main"
    ? `main-r${period}-c${column}`
    : `${row}-c${column}`;

  return {
    id: `element-${String(atomicNumber).padStart(3, "0")}`,
    atomicNumber,
    symbol,
    chineseName,
    englishName,
    category: CATEGORY_NAMES[categoryClass],
    categoryClass,
    row,
    period,
    column,
    targetId,
  };
}

export const PERIODIC_TABLE_QUIZ = {
  id: "periodic-table-placement",
  version: 1,
  kind: "placement",
  subject: "Science",
  title: "化學元素週期表",
  elements: RAW_ELEMENTS.map(makeElement),
};
