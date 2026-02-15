const viewHtmlCache = new Map();

export async function loadViewHtml(path) {
  if (viewHtmlCache.has(path)) return viewHtmlCache.get(path);

  const res = await fetch(path, { credentials: "same-origin" });
  if (!res.ok) {
    throw new Error(`Impossibile caricare ${path} (HTTP ${res.status})`);
  }

  const html = await res.text();
  viewHtmlCache.set(path, html);
  return html;
}
