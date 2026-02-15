import { loadViewHtml } from "./viewLoader.js";
import { renderBookTile } from "../components/bookTile.js";

export async function renderSearchPage() {
  return loadViewHtml("/views/search.html");
}

export function mountSearchPage(ctx) {
  const { api, $, escapeHtml, openBookModal } = ctx;

  const locBadge = $("#locBadge");
  const locMsg = $("#locMsg");
  const btnSetLocationMini = $("#btnSetLocationMini");
  const statusEl = $("#searchStatus");
  const resultsEl = $("#searchResults");
  const qInput = $("#q");
  const qSuggest = $("#qSuggest");
  const pagerInfo = $("#pagerInfo");
  const btnPrev = $("#btnPrev");
  const btnNext = $("#btnNext");

  let limit = 50;
  let offset = 0;
  let lastResponse = null;
  let suggestTimer = null;

  const setStatus = (msg) => {
    if (statusEl) statusEl.textContent = msg || "";
  };

  const setLoc = (state, msg) => {
    if (locBadge) {
      if (state === "ok") {
        locBadge.textContent = "Impostata";
        locBadge.className = "badge badge--ok";
      } else {
        locBadge.textContent = "Non impostata";
        locBadge.className = "badge badge--no";
      }
    }

    // Mostra bottone grande senza posizione, pin piccolo quando è impostata
    const bigBtn = $("#btnSetLocation");
    if (state === "ok") {
      bigBtn?.classList.add("hidden");
      btnSetLocationMini?.classList.remove("hidden");
    } else {
      bigBtn?.classList.remove("hidden");
      btnSetLocationMini?.classList.add("hidden");
    }

    if (locMsg) locMsg.textContent = msg || "";
  };

  const buildQuery = () => {
    const q = qInput?.value?.trim();
    const genre_id = $("#genre_id")?.value;
    const radius_km = $("#radius_km")?.value;
    const availability = $("#availability")?.value;

    const params = {
      limit,
      offset,
    };

    if (radius_km) params.radius_km = Number(radius_km);
    if (q) params.q = q;
    if (genre_id) params.genre_id = Number(genre_id);

    // Backend: senza parametro mostra solo disponibili; availability=all mostra tutto
    if (availability === "all") params.availability = "all";

    return params;
  };

  const hideSuggest = () => {
    if (!qSuggest) return;
    qSuggest.innerHTML = "";
    qSuggest.classList.add("hidden");
  };

  const renderSuggest = (items) => {
    if (!qSuggest) return;
    if (!items?.length) {
      hideSuggest();
      return;
    }

    qSuggest.innerHTML = items
      .slice(0, 10)
      .map((item) => {
        const label = escapeHtml(item.label || "");
        const type = escapeHtml(item.type || "");
        return `<button type="button" class="suggest__item" data-q="${label}">${label} <span class="card__meta">(${type})</span></button>`;
      })
      .join("");
    qSuggest.classList.remove("hidden");

    qSuggest.querySelectorAll(".suggest__item").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const value = btn.getAttribute("data-q") || "";
        if (qInput) qInput.value = value;
        hideSuggest();
        offset = 0;
        await runSearch();
      });
    });
  };

  const loadSuggest = async () => {
    const q = qInput?.value?.trim();
    if (!q || q.length < 2) {
      hideSuggest();
      return;
    }

    const params = buildQuery();
    const baseList = [];

    const [bookRes, authorRes, publisherRes] = await Promise.allSettled([
      api.books?.search ? api.books.search({ ...params, limit: 5, offset: 0, availability: "all" }) : Promise.resolve({ results: [] }),
      api.authors?.search ? api.authors.search(q) : Promise.resolve([]),
      api.publishers?.search ? api.publishers.search(q) : Promise.resolve([]),
    ]);

    if (bookRes.status === "fulfilled") {
      const books = Array.isArray(bookRes.value?.results) ? bookRes.value.results : [];
      for (const b of books) {
        if (!b?.title) continue;
        baseList.push({ type: "titolo", label: String(b.title) });
      }
    }

    if (authorRes.status === "fulfilled") {
      const authors = Array.isArray(authorRes.value) ? authorRes.value : (authorRes.value?.authors || []);
      for (const a of authors.slice(0, 5)) {
        const name = typeof a === "string" ? a : a?.name;
        if (!name) continue;
        baseList.push({ type: "autore", label: String(name) });
      }
    }

    if (publisherRes.status === "fulfilled") {
      const publishers = Array.isArray(publisherRes.value) ? publisherRes.value : (publisherRes.value?.publishers || []);
      for (const p of publishers.slice(0, 5)) {
        const name = typeof p === "string" ? p : p?.name;
        if (!name) continue;
        baseList.push({ type: "editore", label: String(name) });
      }
    }

    const uniq = [];
    const seen = new Set();
    for (const item of baseList) {
      const key = item.label.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      uniq.push(item);
    }

    renderSuggest(uniq);
  };

  const renderPager = () => {
    const totalShown = lastResponse?.results?.length || 0;
    const off = lastResponse?.offset ?? offset;
    const lim = lastResponse?.limit ?? limit;

    if (pagerInfo) {
      const from = totalShown ? off + 1 : 0;
      const to = totalShown ? off + totalShown : 0;
      pagerInfo.textContent = totalShown ? `Risultati ${from}-${to} (limit ${lim})` : "Nessun risultato";
    }

    if (btnPrev) btnPrev.disabled = off <= 0;
    if (btnNext) btnNext.disabled = totalShown < lim; // se < limit, probabilmente ultima pagina
  };

  const renderResults = (resp) => {
    const items = resp?.results || [];
    if (!resultsEl) return;

    if (!items.length) {
      resultsEl.innerHTML = "";
      setStatus("Nessun libro trovato con questi filtri.");
      renderPager();
      return;
    }

    setStatus(`Trovati ${items.length} libri (raggio applicato: ${resp.radius_km_applied ?? "?"} km).`);

    resultsEl.innerHTML = items
      .map((b) => {
        const dist = b.distance_km_approx != null ? `~${b.distance_km_approx} km` : "";
        return renderBookTile({
          context: "search",
          layout: "compact",
          isbn: b?.isbn || "",
          title: b?.title || "(senza titolo)",
          coverUrl: b?.cover_url || "",
          statusLabel: b?.is_available ? "Disponibile" : "Non disponibile",
          statusTone: b?.is_available ? "ok" : "no",
          distanceLabel: dist,
          actions: [
            {
              label: "Dettagli",
              action: "details",
              className: "btn btn--ghost",
              attrs: {
                "data-owner-user-id": b?.owner_user_id ?? "",
                "data-isbn": b?.isbn || "",
                "data-avail": b?.is_available ? "1" : "0",
                "data-title": b?.title || "",
              },
            },
          ],
          escapeHtml,
        });
      })
      .join("");

    renderPager();
  };

  const runSearch = async () => {
    setStatus("Caricamento…");

    const hasLoc = await checkLocation();
    if (!hasLoc) {
      setStatus("Imposta la posizione per cercare libri vicino a te.");
      resultsEl && (resultsEl.innerHTML = "");
      lastResponse = null;
      renderPager();
      return;
    }

    const params = buildQuery();

    try {
      if (!api.books?.search) {
        throw new Error("API books.search non trovata");
      }

      const res = await api.books.search(params);
      lastResponse = res;
      limit = res?.limit ?? limit;
      offset = res?.offset ?? offset;

      // Se la ricerca va a buon fine, assumiamo posizione presente
      setLoc("ok", "");
      renderResults(res);
    } catch (err) {
      console.warn("search failed:", err);

      // Caso più frequente: posizione mancante
      setStatus("Impossibile cercare: serve la posizione (o non sei autorizzato).");
      resultsEl && (resultsEl.innerHTML = "");
      lastResponse = null;
      renderPager();

      // Manteniamo badge "non impostata" salvo evidenze diverse
      setLoc("no", "Imposta la posizione per effettuare la ricerca.");
    }
  };

  const loadGenres = async () => {
    const sel = $("#genre_id");
    if (!sel) return;

    try {
      const res = await api.genres.list();
      const genres = Array.isArray(res) ? res : (res?.genres || []);
      sel.innerHTML = `<option value="" selected>Tutti</option>` +
        genres.map(g => `<option value="${escapeHtml(g.id)}">${escapeHtml(g.name)}</option>`).join("");
    } catch (err) {
      console.warn("genres load failed:", err);
    }
  };

  const checkLocation = async () => {
    try {
      const res = await api.users?.getLocation?.();
      const has = !!res?.has_location;

      if (has) {
        const precision = res?.applied_precision_km ? `${res.applied_precision_km} km` : "";
        const profile = res?.privacy_profile_applied ? `${res.privacy_profile_applied}` : "";
        setLoc("ok", precision || profile ? `Precisione: ${precision}${precision && profile ? " • " : ""}${profile ? `Profilo: ${profile}` : ""}` : "");
      } else {
        setLoc("no", "Imposta la posizione per effettuare la ricerca.");
      }

      return has;
    } catch (err) {
      console.warn("get location failed:", err);
      setLoc("no", "Imposta la posizione per effettuare la ricerca.");
      return false;
    }
  };

  const setLocationFromBrowser = () => {
    if (!navigator.geolocation) {
      setLoc("no", "Geolocalizzazione non supportata dal browser.");
      return;
    }

    setLoc("no", "Richiedo permesso…");

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        const accuracy = pos.coords.accuracy;

        setLoc("no", "Salvo posizione…");

        try {
          // Supporta vari nomi metodo lato API
          if (api.users?.setLocation) {
            await api.users.setLocation({ lat, lon, accuracy });
          } else if (api.users?.updateLocation) {
            await api.users.updateLocation({ lat, lon, accuracy });
          } else if (api.users?.setMyLocation) {
            await api.users.setMyLocation({ lat, lon, accuracy });
          } else {
            throw new Error("API location non trovata (users.setLocation)");
          }

          setLoc("ok", "Posizione aggiornata.");
          await checkLocation();
          offset = 0;
          await runSearch();
        } catch (err) {
          console.warn("set location failed:", err);
          setLoc("no", err?.message || "Errore nel salvataggio posizione.");
        }
      },
      (err) => {
        console.warn("geo denied:", err);
        setLoc("no", "Permesso negato o errore nel recupero posizione.");
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
  };

  // --- Gestione eventi ---
  $("#btnSetLocation")?.addEventListener("click", setLocationFromBrowser);
  btnSetLocationMini?.addEventListener("click", setLocationFromBrowser);

  $("#searchForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    offset = 0;
    await runSearch();
  });

  $("#btnReset")?.addEventListener("click", async () => {
    qInput.value = "";
    $("#genre_id").value = "";
    $("#radius_km").value = "15";
    $("#availability").value = "available";
    hideSuggest();
    offset = 0;
    await runSearch();
  });

  btnPrev?.addEventListener("click", async () => {
    offset = Math.max(0, offset - limit);
    await runSearch();
  });

  btnNext?.addEventListener("click", async () => {
    offset = offset + limit;
    await runSearch();
  });

  qInput?.addEventListener("input", () => {
    clearTimeout(suggestTimer);
    suggestTimer = setTimeout(() => {
      void loadSuggest();
    }, 220);
  });

  qInput?.addEventListener("blur", () => {
    setTimeout(hideSuggest, 150);
  });

  // Azioni sui risultati
  resultsEl?.addEventListener("click", (e) => {
    const detailsBtn = e.target.closest('[data-action="details"]');
    if (detailsBtn) {
      const isbn = detailsBtn.dataset.isbn;
      const is_available = detailsBtn.dataset.avail === "1";
      const title = detailsBtn.dataset.title;
      const owner_user_id = detailsBtn.dataset.ownerUserId;
      if (!openBookModal) {
        console.warn("openBookModal missing from ctx");
        return;
      }
      openBookModal({ isbn, is_available, title, owner_user_id, context: "browse" });
      return;
    }

  });

  // Avvio iniziale
  (async () => {
    await loadGenres();

    const hasLoc = await checkLocation();
    if (hasLoc) {
      await runSearch();
    } else {
      setStatus("Imposta la posizione per iniziare la ricerca.");
    }
  })();
}
