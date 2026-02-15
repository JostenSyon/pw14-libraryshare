// public/js/views/myBooks.view.js
import { loadViewHtml } from "./viewLoader.js";
import { renderBookTile } from "../components/bookTile.js";

// HTML della pagina #/my-books
export async function renderMyBooksPage() {
  return loadViewHtml("/views/myBooks.html");
}

// Logica della pagina #/my-books
// Contesto: { api, $, escapeHtml, getViewMode:()=>string, setViewMode:(m)=>void, openBookModal }
export function mountMyBooksPage(ctx) {
  const { api, $, escapeHtml, getViewMode, setViewMode, openBookModal } = ctx;

  (async () => {
    try {
      const res = await api.users.myBooks();
      // L'API reale ritorna { books: [...] }, ma accetto anche un array diretto
      const books = Array.isArray(res) ? res : (res?.books || []);

      const status = $("#myBooksStatus");
      const list = $("#myBooksList");
      if (!status || !list) return;

      const btnList = $("#viewListBtn");
      const btnGrid = $("#viewGridBtn");

      const setActiveBtn = () => {
        const viewMode = getViewMode();
        btnList?.classList.toggle("is-active", viewMode === "list");
        btnGrid?.classList.toggle("is-active", viewMode === "grid");
      };

      const buildDetailAction = (b) => ({
        label: "Dettagli",
        action: "details",
        className: "btn btn--ghost",
        attrs: {
          "data-isbn": b?.isbn || "",
          "data-avail": b?.is_available ? "1" : "0",
          "data-title": b?.title || "",
        },
      });

      const renderListTile = (b) =>
        renderBookTile({
          context: "my-list",
          layout: "loan",
          isbn: b?.isbn || "",
          title: b?.title || "(senza titolo)",
          coverUrl: b?.cover_url || "",
          sideStatusLabel: b?.is_available ? "Disponibile" : "Non disponibile",
          sideStatusTone: b?.is_available ? "ok" : "no",
          sideAction: buildDetailAction(b),
          escapeHtml,
        });

      const renderGridTile = (b) =>
        renderBookTile({
          context: "my-grid",
          layout: "compact",
          isbn: b?.isbn || "",
          title: b?.title || "(senza titolo)",
          coverUrl: b?.cover_url || "",
          statusLabel: b?.is_available ? "Disponibile" : "Non disponibile",
          statusTone: b?.is_available ? "ok" : "no",
          actions: [buildDetailAction(b)],
          escapeHtml,
        });

      const renderBooks = () => {
        const viewMode = getViewMode();
        setActiveBtn();

        if (viewMode === "grid") {
          list.innerHTML = `
            <div class="mybooks-grid">
              ${books.map(renderGridTile).join("")}
            </div>
          `;
          return;
        }

        list.innerHTML = `
          <div class="list">
            ${books.map(renderListTile).join("")}
          </div>
        `;
      };

      btnList?.addEventListener("click", () => {
        setViewMode("list");
        renderBooks();
      });
      btnGrid?.addEventListener("click", () => {
        setViewMode("grid");
        renderBooks();
      });

      setActiveBtn();

      if (!books.length) {
        status.textContent = "Nessun libro trovato nel tuo patrimonio.";
        list.innerHTML = "";
        setViewMode("list");
        setActiveBtn();
        return;
      }

      status.textContent = `Trovati ${books.length} libri.`;
      renderBooks();

      list.addEventListener("click", (e) => {
        const btn = e.target.closest('[data-action="details"]');
        if (!btn) return;
        const isbn = btn.dataset.isbn;
        const is_available = btn.dataset.avail === "1";
        const title = btn.dataset.title;
        if (!openBookModal) {
          console.warn("openBookModal missing from ctx");
          return;
        }
        openBookModal({ isbn, is_available, title, context: "my" });
      });

      window.addEventListener("mybook:availability", (ev) => {
        const { isbn, is_available } = ev.detail || {};
        if (!isbn) return;
        const target = books.find((b) => b.isbn === isbn);
        if (target) {
          target.is_available = !!is_available;
          renderBooks();
        }
      });

      window.addEventListener("mybook:removed", (ev) => {
        const { isbn } = ev.detail || {};
        if (!isbn) return;
        const idx = books.findIndex((b) => b.isbn === isbn);
        if (idx < 0) return;
        books.splice(idx, 1);
        if (!books.length) {
          status.textContent = "Nessun libro trovato nel tuo patrimonio.";
          list.innerHTML = "";
          return;
        }
        status.textContent = `Trovati ${books.length} libri.`;
        renderBooks();
      });
    } catch (err) {
      const status = $("#myBooksStatus");
      const list = $("#myBooksList");
      if (status) status.textContent = "Errore nel caricamento dei libri.";
      if (list) list.innerHTML = `<div class="error">${escapeHtml(err?.message || "Errore")}</div>`;
    }
  })();
}
