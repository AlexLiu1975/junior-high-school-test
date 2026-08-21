// Maps each extracted figureId to its bundled asset URL. Assets are static
// PNG/SVG files under ./assets; nothing from the source HTML is executed.
const modules = import.meta.glob("./assets/*", { eager: true, query: "?url", import: "default" });
const byId = {};
for (const [path, url] of Object.entries(modules)) {
  const file = path.split("/").pop();
  byId[file.replace(/\.[^.]+$/, "")] = url;
}

export function resolvePart2Figure(id) {
  return byId[id] ?? null;
}
