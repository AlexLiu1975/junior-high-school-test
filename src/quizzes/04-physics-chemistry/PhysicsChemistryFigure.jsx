// Renders a question's extracted figures (PNG or SVG asset URLs) as images.
// Source markup is never injected as HTML (no dangerouslySetInnerHTML); each
// figure is a static asset resolved to a URL by the paper's figure map.
export function PhysicsChemistryFigure({ figureIds, resolve }) {
  const ids = (figureIds ?? []).map((id) => ({ id, url: resolve(id) })).filter(({ url }) => url);
  if (ids.length === 0) return null;
  return (
    <div className="my-4 flex flex-wrap items-center justify-center gap-3">
      {ids.map(({ id, url }) => (
        <img
          key={id}
          src={url}
          alt="題目附圖"
          className="max-h-80 max-w-full rounded-lg border border-slate-300 bg-white p-2"
        />
      ))}
    </div>
  );
}
