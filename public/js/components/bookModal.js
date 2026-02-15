// Modale dettagli libro, riusata nelle varie view.
// Contesti supportati:
// - "browse" (ricerca): utente non proprietario -> richiesta prestito o avviso
// - "myBooks" (miei libri): utente proprietario -> cambio disponibilità
// - "loans" (prestiti): solo dettagli, nessuna azione

let _ctx = null;
let _isInit = false;
let _lastActiveEl = null;
let _lastParams = null;
let _ownedBooksCache = null;
let _ownedBooksCacheUserId = null;
let _bookGenresCache = null;
let _lastBook = null;
let _savedBodyOverflow = "";
let _savedBodyTouchAction = "";

const $ = (sel) => document.querySelector(sel);

function show(el) {
  el?.classList.remove("hidden");
}
function hide(el) {
  el?.classList.add("hidden");
}

function setText(el, txt) {
  if (el) el.textContent = txt ?? "";
}

function getCurrentUser() {
  return _ctx?.getCurrentUser?.() ?? null;
}

function escapeHtml(s) {
  // Se disponibile, uso l'escape condiviso dal contesto.
  if (_ctx?.escapeHtml) return _ctx.escapeHtml(s);
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function elRefs() {
  return {
    modal: $("#bookModal"),
    backdrop: $("#bookModal .modal__backdrop"),
    panel: $("#bookModal .modal__panel"),
    body: $("#bookModalBody"),
    msg: $("#bookModalMsg"),
    btnClose: $("#btnBookClose"),
    btnToggle: $("#btnToggleAvailability"),
    btnRemove: $("#btnRemoveFromMyLibrary"),
    btnNotify: $("#btnNotifyAvailable"),
    btnLoan: $("#btnRequestLoan"),
  };
}

function setMsg(message, tone = "default") {
  const { msg } = elRefs();
  if (!msg) return;
  setText(msg, message);
  msg.style.color = tone === "success" ? "#1d6f42" : tone === "error" ? "#8a1f1f" : "";
}

function clearDatasets() {
  const { btnToggle, btnLoan, btnRemove } = elRefs();
  btnToggle?.removeAttribute("data-isbn");
  btnToggle?.removeAttribute("data-next");
  btnRemove?.removeAttribute("data-isbn");
  btnLoan?.removeAttribute("data-isbn");
  btnLoan?.removeAttribute("data-owner");
}

async function getGenresOptions() {
  if (_bookGenresCache) return _bookGenresCache;
  if (!_ctx?.api?.genres?.list) return [];
  try {
    const res = await _ctx.api.genres.list();
    const list = Array.isArray(res) ? res : (res?.genres || []);
    _bookGenresCache = list;
    return list;
  } catch {
    return [];
  }
}

async function getOwnedBooksSet() {
  const api = _ctx?.api;
  const currentUser = getCurrentUser();
  const userId = currentUser?.id ?? null;
  if (!userId || !api?.users?.myBooks) return null;

  if (_ownedBooksCache && _ownedBooksCacheUserId === userId) {
    return _ownedBooksCache;
  }

  try {
    const res = await api.users.myBooks();
    const rows = Array.isArray(res) ? res : (res?.books || []);
    const set = new Set(rows.map((b) => String(b?.isbn || "").trim()).filter(Boolean));
    _ownedBooksCache = set;
    _ownedBooksCacheUserId = userId;
    return set;
  } catch (err) {
    console.warn("owned books load failed:", err);
    return null;
  }
}

function openModal() {
  const { modal, btnClose } = elRefs();
  if (!modal) return;

  _lastActiveEl = document.activeElement;

  modal.classList.remove("hidden");
  modal.removeAttribute("inert");
  modal.setAttribute("aria-hidden", "false");

  // Evito lo scroll della pagina sotto la modale.
  _savedBodyOverflow = document.body.style.overflow;
  _savedBodyTouchAction = document.body.style.touchAction;
  document.body.style.overflow = "hidden";
  document.body.style.touchAction = "none";

  // Sposto il focus dentro la modale.
  (btnClose || modal).focus?.();
}

function closeModal() {
  const { modal, body } = elRefs();
  if (!modal) return;

  clearDatasets();
  setMsg("");
  if (body) body.innerHTML = "";

  modal.classList.add("hidden");
  modal.setAttribute("inert", "");
  modal.setAttribute("aria-hidden", "true");

  // Ripristino lo scroll della pagina.
  document.body.style.overflow = _savedBodyOverflow;
  document.body.style.touchAction = _savedBodyTouchAction;

  // Ripristino il focus precedente.
  try {
    _lastActiveEl?.focus?.();
  } catch {
    // ignora
  }
  _lastActiveEl = null;
  _lastBook = null;
}

function renderMetaLine(label, value) {
  if (!value) return "";
  return `<div class="card__meta" style="margin-top:4px;">${label}: ${escapeHtml(value)}</div>`;
}

function renderAdminLinkAction(action, text) {
  return `<div style="margin-top:8px;">
    <button type="button" data-action="${action}" style="padding:0; border:0; background:transparent; color:#666; text-decoration:underline; cursor:pointer; font-size:12px;">
      ${text}
    </button>
  </div>`;
}

function renderCoverBlock(cover, isAdmin) {
  const actionBtn = isAdmin
    ? `<button type="button" data-action="cover-upload" style="width:140px; padding:6px 10px; border-radius:10px; border:1px solid #ddd; background:#fff; cursor:pointer; font-size:12px;">${cover ? "Cambia copertina" : "+ Aggiungi copertina"}</button>`
    : "";
  const fileInput = isAdmin ? `<input type="file" data-cover-input hidden accept="image/*" />` : "";

  if (cover) {
    return `<div style="display:flex; flex-direction:column; align-items:center; gap:8px;">
      <img src="${cover}" alt="Copertina" style="width:140px; height:200px; object-fit:cover; border-radius:10px; border:1px solid #e7e7e7;" />
      ${actionBtn}
      ${fileInput}
    </div>`;
  }

  return `<div style="display:flex; flex-direction:column; align-items:center; gap:8px;">
    <div style="width:140px; height:200px; border-radius:10px; border:1px dashed #ddd; display:flex; align-items:center; justify-content:center; color:#777; font-size:12px;">Nessuna copertina</div>
    ${actionBtn}
    ${fileInput}
  </div>`;
}

async function runAdminImport({ isbn, apiMethod, loadingMsg, successMsg, missingApiMsg, errorMsg }) {
  if (!isbn) {
    setMsg("ISBN mancante", "error");
    return;
  }
  if (!apiMethod) {
    setMsg(missingApiMsg, "error");
    return;
  }
  try {
    setMsg(loadingMsg);
    await apiMethod(isbn);
    setMsg(successMsg, "success");
    await loadAndRender(_lastParams || { isbn });
  } catch (err) {
    setMsg(err?.message || errorMsg, "error");
  }
}

function renderBody(book, opts = {}) {
  const title = escapeHtml(book?.title || "(senza titolo)");
  const isbn = escapeHtml(book?.isbn || "—");
  const cover = book?.cover_url ? escapeHtml(book.cover_url) : "";
  const isAdmin = opts?.isAdmin === true;

  // Campi opzionali: mantengo fallback utili in caso di sorgenti esterne (Google Books/Open Library).
  const authors = Array.isArray(book?.authors) ? book.authors.join(", ") : book?.authors || "";
  const publisher = book?.publisher || "";
  const year = book?.edition_year ?? book?.year ?? "";
  const pages = book?.pages ?? "";
  const price = book?.cover_price ?? "";
  const rawGenre = book?.genre_name || book?.genre || (book?.genre_id != null ? `Genere #${book.genre_id}` : "");
  const genreKey = String(rawGenre || "").trim().toLowerCase();
  const genre = genreKey === "non categorizzato" ? "Da classificare" : rawGenre;
  const summary = book?.summary || book?.description || book?.short_description || "";
  const hasSummary = !!String(summary || "").trim();

  const lines = [
    renderMetaLine("Autori", authors),
    renderMetaLine("Editore", publisher),
    renderMetaLine("Anno", year),
    renderMetaLine("Pagine", pages),
    renderMetaLine("Prezzo copertina", price),
    renderMetaLine("Genere", genre),
  ].filter(Boolean);

  const summaryHtml = hasSummary
    ? `<div class="card" style="margin-top:12px; padding:10px;">
         <div class="card__title" style="font-size:0.95rem;">Descrizione</div>
         <div class="card__meta" style="margin-top:6px; white-space:pre-wrap;">${escapeHtml(summary)}</div>
       </div>`
    : "";

  const importDescriptionHtml = isAdmin && !hasSummary
    ? renderAdminLinkAction("import-description", "Importa descrizione da OpenLibrary")
    : "";
  const importCoverHtml = isAdmin && !cover
    ? renderAdminLinkAction("import-cover", "Importa copertina da OpenLibrary")
    : "";
  const editMetaHtml = isAdmin
    ? renderAdminLinkAction("toggle-edit-meta", "Modifica metadati")
    : "";

  const coverHtml = renderCoverBlock(cover, isAdmin);

  return `
    <div style="display:flex; gap:12px; align-items:flex-start;">
      <div style="flex:0 0 auto;">${coverHtml}</div>
      <div style="flex:1; min-width:0;">
        <div class="card__title" style="font-size:1.05rem;">${title}</div>
        <div class="card__meta" style="margin-top:4px;">ISBN: ${isbn}</div>
        ${lines.join("")}
        ${importDescriptionHtml}
        ${importCoverHtml}
        ${editMetaHtml}
      </div>
    </div>
    ${summaryHtml}
    <div id="bookAdminEditWrap" class="hidden" style="margin-top:12px;"></div>
  `;
}

// Nota per me: qui tengo tutto nello stesso file perché questa parte è molto dinamica
// (permessi admin, campi opzionali, eventi e stato). Se la sposto in HTML separato rischio più rotture.
function renderAdminEditForm(book, genres = []) {
  const isbn = escapeHtml(book?.isbn || "");
  const title = escapeHtml(book?.title || "");
  const description = escapeHtml(book?.description || "");
  const year = Number(book?.edition_year) || "";
  const pages = Number(book?.pages) || "";
  const price = Number(book?.cover_price ?? 0);
  const publisher = escapeHtml(book?.publisher || "");
  const authors = escapeHtml(Array.isArray(book?.authors) ? book.authors.join(", ") : String(book?.authors || ""));
  const currentGenre = String(book?.genre || "").trim().toLowerCase();

  const genreOptions = genres.map((g) => {
    const id = String(g?.id || "");
    const name = String(g?.name || "");
    const selected = name.trim().toLowerCase() === currentGenre ? " selected" : "";
    return `<option value="${escapeHtml(id)}"${selected}>${escapeHtml(name)}</option>`;
  }).join("");

  return `
    <div class="card">
      <div class="card__title" style="font-size:0.95rem;">Modifica metadati</div>
      <form id="bookAdminEditForm" class="form" style="margin-top:10px;">
        <input type="hidden" id="editBookIsbn" value="${isbn}" />
        <label class="form__label">Titolo <input id="editBookTitle" class="form__input" value="${title}" required /></label>
        <label class="form__label">Descrizione <textarea id="editBookDescription" class="form__input" rows="4">${description}</textarea></label>
        <label class="form__label">Anno edizione <input id="editBookYear" class="form__input" type="number" min="0" value="${escapeHtml(String(year))}" required /></label>
        <label class="form__label">Pagine <input id="editBookPages" class="form__input" type="number" min="1" value="${escapeHtml(String(pages))}" required /></label>
        <label class="form__label">Prezzo copertina <input id="editBookPrice" class="form__input" type="number" min="0" step="0.01" value="${escapeHtml(String(price))}" required /></label>
        <label class="form__label">Genere <select id="editBookGenreId" class="form__input" required>${genreOptions}</select></label>
        <label class="form__label">Editore <input id="editBookPublisher" class="form__input" value="${publisher}" required /></label>
        <label class="form__label">Autori (separati da virgola) <input id="editBookAuthors" class="form__input" value="${authors}" required /></label>
        <div class="form__actions start">
          <button type="submit" class="btn btn--primary">Salva modifiche</button>
        </div>
        <div id="bookAdminEditMsg" class="card__meta"></div>
      </form>
    </div>
  `;
}

function applyActions({ context, isOwner, avail, isbn, ownerId, isLoggedIn, isOwnedInLibrary }) {
  const { btnToggle, btnNotify, btnLoan, btnRemove } = elRefs();

  // Stato base: nessuna azione visibile.
  hide(btnToggle);
  hide(btnRemove);
  hide(btnNotify);
  hide(btnLoan);

  clearDatasets();

  // Nei contesti prestiti/admin mostro solo i dettagli.
  if (context === "loans" || context === "admin") return;

  if (isOwner || context === "my") {
    // Il proprietario può cambiare disponibilità.
    show(btnToggle);
    show(btnRemove);
    if (btnToggle) {
      btnToggle.textContent = avail ? "Segna come non disponibile" : "Segna come disponibile";
      btnToggle.setAttribute("data-isbn", isbn);
      btnToggle.setAttribute("data-next", avail ? "0" : "1");
    }
    if (btnRemove) {
      btnRemove.setAttribute("data-isbn", isbn);
    }
    return;
  }

  if (isOwnedInLibrary) {
    setMsg("Nella libreria", "success");
    return;
  }

  // Utente non proprietario.
  if (avail && ownerId != null) {
    show(btnLoan);
    if (btnLoan) {
      btnLoan.setAttribute("data-isbn", isbn);
      if (ownerId != null) btnLoan.setAttribute("data-owner", String(ownerId));
    }
  } else if (!avail) {
    // Il pulsante "avvisami" compare solo da loggato.
    if (isLoggedIn) show(btnNotify);
  } else {
    setMsg("Prestito non disponibile per questo libro.");
  }
}

async function loadAndRender({ isbn, context = "browse", owner_user_id, is_available }) {
  const { api } = _ctx || {};
  const currentUser = getCurrentUser();
  const { body } = elRefs();

  if (!api?.books?.getByIsbn) {
    if (body) body.innerHTML = `<div class="error">API books.getByIsbn non trovata</div>`;
    return;
  }

  if (body) body.innerHTML = `<p>Caricamento…</p>`;
  setMsg("", "default");

  // Registro la view in modo non bloccante; il server evita duplicati per sessione/isbn.
  if (api?.books?.incrementView) {
    api.books.incrementView(isbn).catch((err) => {
      console.warn("increment view failed:", err);
    });
  }

  try {
    const res = await api.books.getByIsbn(isbn);
    const book = res?.book ?? res;
    _lastBook = book;

    // Calcolo disponibilità e proprietario usando i dati già disponibili, poi il dettaglio completo.
    const avail =
      is_available === true
        ? true
        : is_available === false
        ? false
        : !!book?.is_available;

    const ownerId = owner_user_id ?? book?.owner_user_id ?? null;

    const isOwner = !!(
      (context === "my") ||
      (currentUser?.id != null && ownerId != null && String(currentUser.id) === String(ownerId))
    );

    const isLoggedIn = !!(currentUser && currentUser.id != null);
    const isAdmin = currentUser?.is_admin === true;

    const ownedSet = isLoggedIn ? await getOwnedBooksSet() : null;
    const isOwnedInLibrary = !!ownedSet?.has?.(String(isbn));

    if (body) body.innerHTML = renderBody({ ...book, isbn: book?.isbn || isbn }, { isAdmin });

    if (isAdmin && _lastParams?.adminEdit && body) {
      const wrap = body.querySelector("#bookAdminEditWrap");
      if (wrap) {
        const genres = await getGenresOptions();
        wrap.innerHTML = renderAdminEditForm({ ...book, isbn: book?.isbn || isbn }, genres);
        wrap.classList.remove("hidden");
      }
    }

    applyActions({ context, isOwner, avail, isbn, ownerId, isLoggedIn, isOwnedInLibrary });
  } catch (err) {
    if (body) body.innerHTML = `<div class="error">${escapeHtml(err?.message || "Errore nel caricamento")}</div>`;
    applyActions({
      context: "loans",
      isOwner: false,
      avail: false,
      isbn,
      ownerId: null,
      isLoggedIn: false,
      isOwnedInLibrary: false,
    });
  }
}

function bindHandlers() {
  const { backdrop, btnClose, btnToggle, btnNotify, btnLoan, btnRemove, body } = elRefs();

  backdrop?.addEventListener("click", closeModal);
  btnClose?.addEventListener("click", closeModal);

  body?.addEventListener("click", (e) => {
    const toggleEditBtn = e.target?.closest?.('[data-action="toggle-edit-meta"]');
    if (toggleEditBtn) {
      const wrap = body.querySelector("#bookAdminEditWrap");
      if (!wrap) return;
      const open = !wrap.classList.contains("hidden");
      if (open) {
        wrap.classList.add("hidden");
        wrap.innerHTML = "";
        return;
      }
      (async () => {
        const genres = await getGenresOptions();
        wrap.innerHTML = renderAdminEditForm({ ..._lastBook, isbn: _lastParams?.isbn || _lastBook?.isbn }, genres);
        wrap.classList.remove("hidden");
      })();
      return;
    }

    const importBtn = e.target?.closest?.('[data-action="import-description"]');
    if (importBtn) {
      const isbn = _lastParams?.isbn ? String(_lastParams.isbn) : "";
      runAdminImport({
        isbn,
        apiMethod: _ctx?.api?.books?.importDescriptionFromOpenLibrary,
        loadingMsg: "Import descrizione in corso...",
        successMsg: "Descrizione importata.",
        missingApiMsg: "Import descrizione non disponibile (API)",
        errorMsg: "Errore import descrizione",
      });
      return;
    }

    const importCoverBtn = e.target?.closest?.('[data-action="import-cover"]');
    if (importCoverBtn) {
      const isbn = _lastParams?.isbn ? String(_lastParams.isbn) : "";
      runAdminImport({
        isbn,
        apiMethod: _ctx?.api?.books?.importCoverFromOpenLibrary,
        loadingMsg: "Import copertina in corso...",
        successMsg: "Copertina importata.",
        missingApiMsg: "Import copertina non disponibile (API)",
        errorMsg: "Errore import copertina",
      });
      return;
    }

    const btn = e.target?.closest?.('[data-action="cover-upload"]');
    if (!btn) return;

    const input = body.querySelector('[data-cover-input]');
    if (!input) return;

    input.click();
  });

  body?.addEventListener("change", async (e) => {
    const input = e.target;
    if (!input?.matches?.('[data-cover-input]')) return;

    const file = input.files?.[0];
    if (!file) return;

    const isbn = _lastParams?.isbn ? String(_lastParams.isbn) : "";
    if (!isbn) {
      setMsg("ISBN mancante");
      return;
    }

    try {
      setMsg("Caricamento copertina…");

      const form = new FormData();
      form.append("cover", file);

      const res = await fetch(`/api/books/${encodeURIComponent(isbn)}/cover`, {
        method: "POST",
        body: form,
        credentials: "include",
      });

      if (!res.ok) {
        let msg = `Upload fallito (${res.status})`;
        try {
          const j = await res.json();
          if (j?.error) msg = j.error;
        } catch {
          
        }
        throw new Error(msg);
      }

      setMsg("Copertina aggiornata.");

      await loadAndRender(_lastParams || { isbn });
    } catch (err) {
      setMsg(err?.message || "Errore upload");
    } finally {
      try {
        input.value = "";
      } catch {
        
      }
    }
  });

  body?.addEventListener("submit", async (e) => {
    const form = e.target;
    if (!form?.matches?.("#bookAdminEditForm")) return;
    e.preventDefault();

    const isbn = body.querySelector("#editBookIsbn")?.value?.trim() || String(_lastParams?.isbn || "").trim();
    const title = body.querySelector("#editBookTitle")?.value?.trim();
    const descriptionRaw = body.querySelector("#editBookDescription")?.value?.trim();
    const edition_year = Number(body.querySelector("#editBookYear")?.value);
    const pages = Number(body.querySelector("#editBookPages")?.value);
    const cover_price = Number(body.querySelector("#editBookPrice")?.value);
    const genre_id = Number(body.querySelector("#editBookGenreId")?.value);
    const publisher = body.querySelector("#editBookPublisher")?.value?.trim();
    const authorsRaw = body.querySelector("#editBookAuthors")?.value?.trim();
    const msgEl = body.querySelector("#bookAdminEditMsg");
    const setFormMsg = (txt, isErr = false) => {
      if (!msgEl) return;
      msgEl.textContent = txt || "";
      msgEl.style.color = isErr ? "#b00020" : "#666";
    };

    if (!isbn || !title || !publisher || !authorsRaw || !Number.isFinite(edition_year) || !Number.isFinite(pages) || !Number.isFinite(cover_price) || !Number.isFinite(genre_id)) {
      setFormMsg("Compila tutti i campi obbligatori.", true);
      return;
    }

    const authors = authorsRaw.split(",").map((a) => a.trim()).filter(Boolean);
    if (!authors.length) {
      setFormMsg("Inserisci almeno un autore.", true);
      return;
    }

    if (!_ctx?.api?.books?.update) {
      setFormMsg("API update libro non disponibile.", true);
      return;
    }

    try {
      setFormMsg("Salvataggio...");
      await _ctx.api.books.update({
        isbn,
        title,
        description: descriptionRaw ? descriptionRaw : null,
        edition_year,
        pages,
        cover_price,
        genre_id,
        publisher,
        authors,
      });
      setFormMsg("Metadati aggiornati.");
      await loadAndRender(_lastParams || { isbn });
    } catch (err) {
      setFormMsg(err?.message || "Errore salvataggio", true);
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const { modal } = elRefs();
      if (modal && !modal.classList.contains("hidden")) closeModal();
    }
  });

  btnToggle?.addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    if (btn.classList.contains("hidden")) return;

    const isbn = btn.dataset.isbn;
    const next = btn.dataset.next === "1";
    if (!isbn) return;

    if (!_ctx?.api?.users?.setMyBookAvailability) {
      setMsg("Operazione non disponibile (API)");
      return;
    }

    try {
      setMsg("Aggiornamento…");
      await _ctx.api.users.setMyBookAvailability({ isbn, is_available: next });
      window.dispatchEvent(new CustomEvent("mybook:availability", { detail: { isbn, is_available: next } }));
      setMsg("Aggiornato.");

      await loadAndRender({ isbn, context: "my", is_available: next });
    } catch (err) {
      setMsg(err?.message || "Errore");
    }
  });

  btnRemove?.addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    if (btn.classList.contains("hidden")) return;
    const isbn = String(btn.dataset.isbn || "").trim();
    if (!isbn) return;

    if (!_ctx?.api?.users?.deleteMyBook) {
      setMsg("Operazione non disponibile (API)");
      return;
    }

    const ok = window.confirm("Confermi di rimuovere questo libro dalla tua libreria?");
    if (!ok) return;

    try {
      setMsg("Rimozione in corso...");
      await _ctx.api.users.deleteMyBook({ isbn });
      if (_ownedBooksCache) _ownedBooksCache.delete(isbn);
      window.dispatchEvent(new CustomEvent("mybook:removed", { detail: { isbn } }));
      closeModal();
    } catch (err) {
      setMsg(err?.message || "Errore rimozione");
    }
  });

  btnNotify?.addEventListener("click", () => {
    if (btnNotify.classList.contains("hidden")) return;
    setMsg('Funzione "avvisami quando torna disponibile" in arrivo.');
  });

  btnLoan?.addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    if (btn.classList.contains("hidden")) return;

    const book_isbn = btn.dataset.isbn;
    const owner_user_id = btn.dataset.owner ? Number(btn.dataset.owner) : null;
    if (!book_isbn || !owner_user_id) {
      setMsg("Errore: mancano dati per la richiesta.");
      return;
    }

    if (!_ctx?.api?.loans?.ask) {
      setMsg("API prestiti non trovata (loans.ask)");
      return;
    }

    try {
      setMsg("Invio richiesta…");
      await _ctx.api.loans.ask({ owner_user_id, book_isbn });
      setMsg("Richiesta inviata.");
      btn.disabled = true;
    } catch (err) {
      const raw = String(err?.message || "");
      const low = raw.toLowerCase();
      const isAuthErr =
        low.includes("not authenticated") ||
        low.includes("unauthenticated") ||
        low.includes("unauthorized") ||
        low.includes("401");

      if (isAuthErr) {
        setMsg("Se vuoi chiedere un prestito, registrati o effettua il login.");
      } else {
        setMsg(raw || "Errore nell'invio richiesta");
      }
    }
  });
}

export function initBookModal(ctx) {
  _ctx = ctx;
  if (_isInit) return;
  _isInit = true;
  bindHandlers();
}

export function openBookModal(params) {
  const { modal } = elRefs();
  if (!modal) return;
  _lastParams = params || null;

  openModal();

  const isbn = params?.isbn;
  if (!isbn) {
    const { body } = elRefs();
    if (body) body.innerHTML = `<div class="error">ISBN mancante</div>`;
    return;
  }

  loadAndRender(params);
}

export function closeBookModal() {
  closeModal();
}
