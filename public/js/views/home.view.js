import { loadViewHtml } from "./viewLoader.js";
import { renderBookTile } from "../components/bookTile.js";

export async function renderHomePage() {
  return loadViewHtml("/views/home.html");
}

export async function mountHomePage(ctx) {
  const nearSection = document.getElementById("home-near-section");
  const nearRow = document.getElementById("home-near-row");
  const nearEmpty = document.getElementById("home-near-empty");

  const reqRow = document.getElementById("home-most-requested-row");
  const reqEmpty = document.getElementById("home-most-requested-empty");

  const viewRow = document.getElementById("home-most-viewed-row");
  const viewEmpty = document.getElementById("home-most-viewed-empty");

  // La modale arriva dal router tramite contesto.
  const { openBookModal, currentUser, escapeHtml } = ctx || {};

  const renderBookCard = (b) => {
    const isbn = b?.isbn ? String(b.isbn) : "";
    const title = b?.title ? String(b.title) : "Titolo sconosciuto";
    const cover = b?.cover_url ? String(b.cover_url) : "";

    const distance = Number.isFinite(b?.distance_km_approx) ? `${b.distance_km_approx} km` : null;

    // Gli endpoint home possono fornire direttamente il proprietario
    // così anche dalle classifiche è possibile richiedere il prestito.
    const owner_user_id = Number.isInteger(b?.owner_user_id) ? b.owner_user_id : null;
    const hasAvailability = typeof b?.is_available === "boolean";
    const is_available = hasAvailability ? b.is_available : null;

    const isOwnedByCurrentUser =
      b?.is_owned_by_me === true ||
      (currentUser?.id != null &&
        owner_user_id != null &&
        String(currentUser.id) === String(owner_user_id));
    const availLabel = isOwnedByCurrentUser
      ? "Posseduto"
      : hasAvailability
      ? (is_available ? "Disponibile" : "Non disponibile")
      : null;

    return renderBookTile({
      context: "home",
      layout: "compact",
      isbn,
      title,
      coverUrl: cover,
      statusLabel: availLabel || "",
      statusTone: isOwnedByCurrentUser ? "ok" : hasAvailability ? (is_available ? "ok" : "no") : "",
      distanceLabel: distance ? `~${distance}` : "",
      showIsbn: false,
      actions: [
        {
          label: "Dettagli",
          action: "details",
          className: "btn btn--ghost",
          attrs: {
            "data-isbn": encodeURIComponent(isbn),
            "data-title": encodeURIComponent(title),
            "data-owner-user-id": owner_user_id ?? "",
            "data-is-available": hasAvailability ? (is_available ? "1" : "0") : "",
          },
        },
      ],
      escapeHtml,
    });
  };

  const wireRowToModal = (rowEl, contextName) => {
    if (!rowEl) return;

    rowEl.addEventListener("click", (e) => {
      const btn = e.target?.closest?.('button[data-action="details"]');
      if (!btn) return;

      if (typeof openBookModal !== "function") {
        console.warn("openBookModal non disponibile in ctx: controlla che venga passato dal router/app");
        return;
      }

      const isbn = decodeURIComponent(btn.getAttribute("data-isbn") || "");
      const title = decodeURIComponent(btn.getAttribute("data-title") || "");

      const ownerStr = btn.getAttribute("data-owner-user-id") || "";
      const owner_user_id = ownerStr ? Number(ownerStr) : null;

      const av = btn.getAttribute("data-is-available");
      const is_available = av === "1" ? true : av === "0" ? false : null;

      // Proprietario e disponibilità possono mancare: li tratto come campi opzionali
      const payload = { isbn, title, context: contextName };
      if (Number.isInteger(owner_user_id)) payload.owner_user_id = owner_user_id;
      if (typeof is_available === "boolean") payload.is_available = is_available;

      openBookModal(payload);
    });
  };

  const syncScrollState = (rowEl) => {
    if (!rowEl) return;
    const max = Math.max(0, rowEl.scrollWidth - rowEl.clientWidth);
    const hasOverflow = max > 4;
    const atStart = rowEl.scrollLeft <= 2;
    const atEnd = rowEl.scrollLeft >= max - 2;
    rowEl.classList.toggle("is-start", atStart);
    rowEl.classList.toggle("is-end", atEnd);
    return { hasOverflow, atStart, atEnd };
  };

  const enhanceScrollableRow = (rowEl) => {
    if (!rowEl) return;
    const controls = document.createElement("div");
    controls.className = "scroll-controls hidden";
    controls.innerHTML = `
      <button type="button" class="scroll-btn" data-dir="-1" aria-label="Scorri a sinistra">◀</button>
      <button type="button" class="scroll-btn" data-dir="1" aria-label="Scorri a destra">▶</button>
    `;
    rowEl.insertAdjacentElement("afterend", controls);

    const [btnLeft, btnRight] = controls.querySelectorAll(".scroll-btn");
    const scrollStep = () => Math.max(180, Math.floor(rowEl.clientWidth * 0.72));

    controls.addEventListener("click", (e) => {
      const btn = e.target.closest(".scroll-btn");
      if (!btn) return;
      const dir = Number(btn.dataset.dir || "0");
      if (!dir) return;
      rowEl.scrollBy({ left: dir * scrollStep(), behavior: "smooth" });
    });

    const update = () => {
      const state = syncScrollState(rowEl);
      if (!state) return;
      controls.classList.toggle("hidden", !state.hasOverflow);
      if (btnLeft) btnLeft.disabled = !state.hasOverflow || state.atStart;
      if (btnRight) btnRight.disabled = !state.hasOverflow || state.atEnd;
    };

    rowEl.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    requestAnimationFrame(update);
  };

  // --- Vicini a te (solo se loggato + posizione impostata) ---
  try {
    const locRes = await fetch("/api/users/me/location", { credentials: "include" });
    if (!locRes.ok) throw new Error("no-location"); // non loggato o posizione non disponibile: saltiamo solo questa sezione

    const loc = await locRes.json();
    if (!loc?.has_location || !loc?.consent) throw new Error("no-location");

    nearSection.hidden = false;

    const nearRes = await fetch("/api/books/search?radius_km=100&limit=12&offset=0", { credentials: "include" });
    if (!nearRes.ok) {
      nearEmpty.hidden = false;
      throw new Error("near-search-failed");
    }

    const nearJson = await nearRes.json();
    const items = Array.isArray(nearJson?.results) ? nearJson.results : [];

    if (items.length === 0) {
      nearEmpty.hidden = false;
      throw new Error("near-empty");
    }

    nearRow.innerHTML = items.map(renderBookCard).join("");
    wireRowToModal(nearRow, "home-near");
    enhanceScrollableRow(nearRow);
  } catch (_) {
    // In caso di errore rete o posizione assente: nascondo la sezione senza bloccare il resto
  }

  // --- Più richiesti ---
  try {
    const r = await fetch("/api/home/most-requested?limit=12", { credentials: "include" });
    if (!r.ok) throw new Error("most-requested");
    const json = await r.json();
    const items = Array.isArray(json?.results) ? json.results : [];

    if (items.length === 0) {
      reqEmpty.hidden = false;
    } else {
      reqRow.innerHTML = items.map(renderBookCard).join("");
      wireRowToModal(reqRow, "home-most-requested");
      enhanceScrollableRow(reqRow);
    }
  } catch (_) {
    reqEmpty.hidden = false;
  }

  // --- Più visualizzati ---
  try {
    const r = await fetch("/api/home/most-viewed?limit=12", { credentials: "include" });
    if (!r.ok) throw new Error("most-viewed");
    const json = await r.json();
    const items = Array.isArray(json?.results) ? json.results : [];

    if (items.length === 0) {
      viewEmpty.hidden = false;
    } else {
      viewRow.innerHTML = items.map(renderBookCard).join("");
      wireRowToModal(viewRow, "home-most-viewed");
      enhanceScrollableRow(viewRow);
    }
  } catch (_) {
    viewEmpty.hidden = false;
  }
}
