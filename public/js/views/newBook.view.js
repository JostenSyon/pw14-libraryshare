import { loadViewHtml } from "./viewLoader.js";
import { renderBookTile } from "../components/bookTile.js";

export async function renderNewBookPage() {
  return loadViewHtml("/views/newBook.html");
}

function isLikelyIsbn(value) {
  const raw = String(value || "").replace(/[\s-]/g, "").trim();
  if (raw.length === 13) return /^\d{13}$/.test(raw);
  if (raw.length === 10) return /^\d{9}[\dXx]$/.test(raw);
  return false;
}

export function mountNewBookPage(ctx) {
  const { api, $, escapeHtml, currentUser } = ctx;

  const lookupForm = $("#bookLookupForm");
  const lookupInput = $("#bookLookup");
  const lookupResultEl = $("#lookupResult");
  const introEl = $("#bookNewIntro");

  const wrap = $("#createBookWrap");
  const createForm = $("#createBookForm");
  const createErr = $("#createBookError");
  const createStatus = $("#createBookStatus");

  const coverInput = $("#bookCover");
  const coverPreview = $("#coverPreview");
  const coverPreviewImg = $("#coverPreviewImg");

  const isTrusted = !!currentUser?.is_trusted;
  if (introEl) {
    introEl.textContent = `Usa una ricerca smart: ISBN, titolo, autore o editore. I risultati del catalogo interno sono sempre mostrati prima di OpenLibrary. ${isTrusted ? "Se non trovi un ISBN puoi creare il libro manualmente." : "La creazione manuale è riservata agli utenti fidati."}`;
  }

  let ownedIsbnSet = new Set();
  const externalBooksByIsbn = new Map();

  const setCreateError = (msg) => {
    if (!createErr) return;
    if (!msg) {
      createErr.textContent = "";
      createErr.classList.add("hidden");
      return;
    }
    createErr.textContent = msg;
    createErr.classList.remove("hidden");
  };

  const setCreateStatus = (msg) => {
    if (!createStatus) return;
    if (!msg) {
      createStatus.textContent = "";
      createStatus.classList.add("hidden");
      return;
    }
    createStatus.textContent = msg;
    createStatus.classList.remove("hidden");
  };

  const loadOwnedBooks = async () => {
    try {
      const res = await api.users?.myBooks?.();
      const books = Array.isArray(res) ? res : (res?.books || []);
      ownedIsbnSet = new Set(books.map((b) => String(b?.isbn || "").trim()).filter(Boolean));
    } catch (err) {
      console.warn("owned books load failed:", err);
      ownedIsbnSet = new Set();
    }
  };

  const isOwned = (isbn) => ownedIsbnSet.has(String(isbn || "").trim());

  const renderLookupTile = ({ book, source }) => {
    const isbn = String(book?.isbn || "").trim();
    const title = book?.title || "(senza titolo)";
    const authors = Array.isArray(book?.authors) ? book.authors.join(", ") : String(book?.authors || "");
    const publisher = String(book?.publisher || "");
    const year = book?.edition_year != null ? String(book.edition_year) : "";
    const pages = book?.pages != null ? String(book.pages) : "";
    const actions = isOwned(isbn)
      ? []
      : [{
          label: source === "local" ? "Aggiungi alla mia libreria" : "Importa e aggiungi",
          action: source === "local" ? "add-local" : "import-external",
          className: "btn btn--primary",
          attrs: { "data-isbn": isbn },
        }];

    return renderBookTile({
      context: source === "local" ? "newbook-local" : "newbook-ol",
      layout: "list",
      isbn,
      title,
      coverUrl: book?.cover_url || "",
      sourceBadge: source === "local" ? "Catalogo interno" : "OpenLibrary",
      statusLabel: isOwned(isbn) ? "Nella tua libreria" : "",
      statusTone: isOwned(isbn) ? "ok" : "",
      metaRows: [
        authors ? `Autori: ${authors}` : "",
        publisher ? `Editore: ${publisher}` : "",
        year ? `Anno: ${year}` : "",
        pages ? `Pagine: ${pages}` : "",
      ].filter(Boolean),
      actions,
      escapeHtml,
    });
  };

  const renderSection = (title, rows, source) => {
    if (!rows.length) return "";
    return `
      <div class="card mt-10">
        <div class="card__row">
          <div class="card__title">${title}</div>
          <span class="badge">${rows.length}</span>
        </div>
        <div class="list mt-10">${rows.map((b) => renderLookupTile({ book: b, source })).join("")}</div>
      </div>
    `;
  };

  const renderLookupResults = (payload, query) => {
    if (!lookupResultEl) return;
    const local = Array.isArray(payload?.local) ? payload.local : [];
    const openlibrary = Array.isArray(payload?.openlibrary) ? payload.openlibrary : [];

    for (const book of openlibrary) {
      const key = String(book?.isbn || "").trim();
      if (!key) continue;
      externalBooksByIsbn.set(key, { ...book, isbn: key });
    }

    if (!local.length && !openlibrary.length) {
      lookupResultEl.innerHTML = `<div class="card"><div class="card__meta">Nessun risultato per "${escapeHtml(query)}".</div></div>`;
      return;
    }

    lookupResultEl.innerHTML = `
      <div class="card">
        <div class="card__meta">Risultati per "${escapeHtml(query)}". Prima catalogo interno, poi OpenLibrary.</div>
        <div id="lookupResultStatus" class="card__meta mt-6"></div>
      </div>
      ${renderSection("Catalogo interno", local, "local")}
      ${renderSection("OpenLibrary", openlibrary, "openlibrary")}
    `;
  };

  const importExternalWithoutRefetch = async (isbn) => {
    const key = String(isbn || "").trim();
    const cached = externalBooksByIsbn.get(key);
    if (cached && api.books?.importOpenLibraryByData) {
      try {
        return await api.books.importOpenLibraryByData(cached);
      } catch (err) {
        console.warn("import by data failed, fallback to isbn import:", err);
      }
    }
    return api.books.importOpenLibraryByIsbn(key);
  };

  const hideCreateForm = () => {
    wrap?.classList.add("hidden");
    if ($("#bookIsbn")) $("#bookIsbn").value = "";
  };

  const showCreateFormForIsbn = (isbn) => {
    if (!isTrusted) {
      hideCreateForm();
      return;
    }
    wrap?.classList.remove("hidden");
    if ($("#bookIsbn")) $("#bookIsbn").value = isbn;
  };

  (async () => {
    const sel = $("#bookGenreId");
    if (!sel) return;
    try {
      const res = await api.genres?.list?.();
      const genres = Array.isArray(res) ? res : (res?.genres || []);
      if (!genres.length) return;
      sel.innerHTML = `<option value="" selected>Seleziona un genere...</option>` +
        genres.map((g) => `<option value="${escapeHtml(g.id)}">${escapeHtml(g.name)}</option>`).join("");
    } catch (err) {
      console.warn("genres load failed:", err);
    }
  })();

  const hideSuggest = (el) => {
    if (!el) return;
    el.classList.add("hidden");
    el.innerHTML = "";
  };

  const renderSuggest = (el, names, onPick) => {
    if (!el) return;
    if (!names?.length) {
      hideSuggest(el);
      return;
    }
    el.innerHTML = names.slice(0, 8).map((n) => `<button type="button" class="suggest__item">${escapeHtml(n)}</button>`).join("");
    el.classList.remove("hidden");
    el.querySelectorAll(".suggest__item").forEach((btn) => {
      btn.addEventListener("click", () => {
        onPick(btn.textContent);
        hideSuggest(el);
      });
    });
  };

  const pubInput = $("#bookPublisher");
  const pubSuggest = $("#publisherSuggest");
  let pubTimer;
  pubInput?.addEventListener("input", () => {
    if (!isTrusted) return;
    const q = pubInput.value.trim();
    if (q.length < 2) return hideSuggest(pubSuggest);
    clearTimeout(pubTimer);
    pubTimer = setTimeout(async () => {
      try {
        const res = await api.publishers?.search?.(q);
        const items = Array.isArray(res) ? res : (res?.publishers || res?.items || []);
        const names = items.map((x) => (typeof x === "string" ? x : (x.name || x.publisher || ""))).filter(Boolean);
        renderSuggest(pubSuggest, names, (name) => {
          pubInput.value = name;
        });
      } catch (err) {
        hideSuggest(pubSuggest);
      }
    }, 200);
  });
  pubInput?.addEventListener("blur", () => setTimeout(() => hideSuggest(pubSuggest), 150));

  const authInput = $("#bookAuthors");
  const authSuggest = $("#authorSuggest");
  let authTimer;
  authInput?.addEventListener("input", () => {
    if (!isTrusted) return;
    const parts = authInput.value.split(",");
    const last = (parts[parts.length - 1] || "").trim();
    if (last.length < 2) return hideSuggest(authSuggest);
    clearTimeout(authTimer);
    authTimer = setTimeout(async () => {
      try {
        const res = await api.authors?.search?.(last);
        const items = Array.isArray(res) ? res : (res?.authors || res?.items || []);
        const names = items.map((x) => (typeof x === "string" ? x : (x.name || ""))).filter(Boolean);
        renderSuggest(authSuggest, names, (name) => {
          parts[parts.length - 1] = ` ${name}`;
          authInput.value = parts.map((s) => s.trim()).filter(Boolean).join(", ");
        });
      } catch (err) {
        hideSuggest(authSuggest);
      }
    }, 200);
  });
  authInput?.addEventListener("blur", () => setTimeout(() => hideSuggest(authSuggest), 150));

  coverInput?.addEventListener("change", () => {
    const file = coverInput.files?.[0];
    if (!file) {
      coverPreview?.classList.add("hidden");
      if (coverPreviewImg) coverPreviewImg.src = "";
      return;
    }
    const url = URL.createObjectURL(file);
    if (coverPreviewImg) coverPreviewImg.src = url;
    coverPreview?.classList.remove("hidden");
  });

  lookupForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    await loadOwnedBooks();
    setCreateError("");
    setCreateStatus("");
    hideCreateForm();

    const q = lookupInput?.value?.trim();
    if (!q) {
      if (lookupResultEl) lookupResultEl.innerHTML = `<div class="error">Inserisci almeno 2 caratteri.</div>`;
      return;
    }

    if (lookupResultEl) lookupResultEl.innerHTML = "<p>Caricamento risultati...</p>";
    try {
      const res = await api.books.suggest({ q, limit: 8 });
      renderLookupResults(res, q);

      const noResults = (res?.totals?.local || 0) + (res?.totals?.openlibrary || 0) === 0;
      if (res?.mode === "isbn" && noResults && isLikelyIsbn(q)) {
        showCreateFormForIsbn(String(q).replace(/[\s-]/g, "").trim());
      }
    } catch (err) {
      if (lookupResultEl) lookupResultEl.innerHTML = `<div class="error">${escapeHtml(err?.message || "Errore ricerca")}</div>`;
    }
  });

  lookupResultEl?.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;

    const action = btn.dataset.action;
    const isbn = String(btn.dataset.isbn || "").trim();
    const status = $("#lookupResultStatus");
    if (!isbn) return;

    btn.disabled = true;
    try {
      if (status) status.textContent = "Operazione in corso...";
      if (action === "add-local") {
        await api.users.addBookToMe({ isbn });
      } else if (action === "import-external") {
        await importExternalWithoutRefetch(isbn);
        await api.users.addBookToMe({ isbn });
      }
      ownedIsbnSet.add(isbn);

      const buttons = lookupResultEl.querySelectorAll("button[data-isbn]");
      buttons.forEach((node) => {
        if (String(node.dataset.isbn || "") !== isbn) return;
        const container = node.closest(".book-tile__actions");
        if (container) container.innerHTML = `<span class="badge badge--ok">Nella tua libreria</span>`;
      });

      if (status) status.textContent = `Operazione completata su ISBN ${isbn}.`;
    } catch (err) {
      if (status) status.textContent = err?.message || "Errore operazione";
    } finally {
      btn.disabled = false;
    }
  });

  createForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    setCreateError("");
    setCreateStatus("");
    if (!isTrusted) {
      setCreateError("Solo un utente fidato puo creare nuovi libri.");
      return;
    }

    const isbn = $("#bookIsbn")?.value?.trim();
    const title = $("#bookTitle")?.value?.trim();
    const descriptionRaw = $("#bookDescription")?.value?.trim();
    const description = descriptionRaw ? descriptionRaw : null;
    const edition_year = Number($("#bookYear")?.value);
    const pages = Number($("#bookPages")?.value);
    const cover_price = Number($("#bookPrice")?.value);
    const genre_id = Number($("#bookGenreId")?.value);
    const publisher = $("#bookPublisher")?.value?.trim();
    const authorsRaw = $("#bookAuthors")?.value?.trim();

    if (!isbn || !title || !publisher || !authorsRaw) {
      setCreateError("Compila tutti i campi richiesti.");
      return;
    }

    const authors = authorsRaw.split(",").map((s) => s.trim()).filter(Boolean);

    try {
      await api.books.create({
        isbn,
        title,
        description,
        edition_year,
        pages,
        cover_price,
        genre_id,
        publisher,
        authors,
      });

      const coverFile = coverInput?.files?.[0];
      if (coverFile) {
        try {
          setCreateStatus("Carico la copertina...");
          await api.books.uploadCover({ isbn, file: coverFile });
          setCreateStatus("Copertina caricata.");
        } catch {
          setCreateStatus("Libro creato, ma caricamento copertina fallito.");
        }
      }

      setCreateStatus("Libro creato. Ora è disponibile nel catalogo.");
      hideCreateForm();
      if (lookupInput) lookupInput.value = isbn;
      lookupForm?.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    } catch (err) {
      setCreateStatus("");
      setCreateError(err?.message || "Errore nella creazione del libro.");
    }
  });

  loadOwnedBooks();
}
