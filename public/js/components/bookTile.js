function safeEscape(escapeHtml, value) {
  if (typeof escapeHtml === "function") return escapeHtml(value ?? "");
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toBadgeClass(tone) {
  if (tone === "ok") return "badge badge--ok";
  if (tone === "no") return "badge badge--no";
  return "badge";
}

function renderCover(coverUrl, title, escapeHtml) {
  const cover = String(coverUrl || "").trim();
  if (!cover) {
    return `<div class="book-tile__cover-placeholder">Nessuna copertina</div>`;
  }
  return `<img class="book-tile__cover" src="${safeEscape(escapeHtml, cover)}" alt="Copertina ${safeEscape(escapeHtml, title || "")}" />`;
}

function renderMetaRows(rows, escapeHtml) {
  if (!Array.isArray(rows) || !rows.length) return "";
  return rows
    .filter(Boolean)
    .map((row) => `<div class="book-tile__meta">${safeEscape(escapeHtml, row)}</div>`)
    .join("");
}

function renderActionList(actions, escapeHtml) {
  if (!Array.isArray(actions) || !actions.length) return "";
  return actions
    .map((action) => {
      const label = safeEscape(escapeHtml, action?.label || "Azione");
      const className = safeEscape(escapeHtml, action?.className || "btn btn--ghost");
      const attrs = Object.entries(action?.attrs || {})
        .map(([k, v]) => `${safeEscape(escapeHtml, k)}="${safeEscape(escapeHtml, v)}"`)
        .join(" ");
      const actionAttr = action?.action ? `data-action="${safeEscape(escapeHtml, action.action)}"` : "";
      return `<button type="button" class="${className}" ${actionAttr} ${attrs}>${label}</button>`;
    })
    .join("");
}

export function renderBookTile({
  context = "",
  layout = "compact",
  isbn = "",
  title = "",
  coverUrl = "",
  sourceBadge = "",
  statusLabel = "",
  statusTone = "",
  distanceLabel = "",
  ownerLabel = "",
  requesterLabel = "",
  contactLabel = "",
  loanMetaLabel = "",
  metaRows = [],
  sideAction = null,
  sideStatusLabel = "",
  sideStatusTone = "",
  actions = [],
  showIsbn = true,
  escapeHtml,
} = {}) {
  const safeTitle = safeEscape(escapeHtml, title || "(senza titolo)");
  const safeIsbn = safeEscape(escapeHtml, isbn || "—");
  const badgeHtml = statusLabel
    ? `<span class="${toBadgeClass(statusTone)}">${safeEscape(escapeHtml, statusLabel)}</span>`
    : "";

  const topMeta = [distanceLabel, ownerLabel, requesterLabel, loanMetaLabel].filter(Boolean);
  const extraMeta = [...topMeta, ...metaRows];
  if (contactLabel) extraMeta.push(`Contatto scambio: ${contactLabel}`);

  const sourceHtml = sourceBadge ? `<span class="badge">${safeEscape(escapeHtml, sourceBadge)}</span>` : "";
  const sideActionHtml = sideAction ? renderActionList([sideAction], escapeHtml) : "";
  const sideStatusHtml = sideStatusLabel
    ? `<span class="${toBadgeClass(sideStatusTone)}">${safeEscape(escapeHtml, sideStatusLabel)}</span>`
    : "";
  const footerActionsHtml = renderActionList(actions, escapeHtml);
  const tileClass = `book-tile book-tile--${safeEscape(escapeHtml, layout)}${context ? ` book-tile--${safeEscape(escapeHtml, context)}` : ""}`;

  return `
    <article class="${tileClass}">
      <div class="book-tile__main">
        <div class="book-tile__media">
          ${renderCover(coverUrl, title, escapeHtml)}
        </div>

        <div class="book-tile__body">
          <div class="book-tile__head">
            <div class="card__title">${safeTitle}</div>
            <div class="book-tile__chips">
              ${sourceHtml}
              ${badgeHtml}
            </div>
          </div>
          ${showIsbn ? `<div class="book-tile__meta">ISBN: ${safeIsbn}</div>` : ""}
          ${renderMetaRows(extraMeta, escapeHtml)}
        </div>
        ${(sideStatusHtml || sideActionHtml) ? `<div class="book-tile__side">${sideStatusHtml}${sideActionHtml}</div>` : ""}
      </div>

      ${footerActionsHtml ? `<div class="book-tile__actions">${footerActionsHtml}</div>` : ""}
    </article>
  `;
}
