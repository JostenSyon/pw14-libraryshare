import { api } from "./api/api.js";
import { renderMyBooksPage, mountMyBooksPage } from "./views/myBooks.view.js";
import { renderNewBookPage, mountNewBookPage } from "./views/newBook.view.js";
import { renderHomePage, mountHomePage } from "./views/home.view.js";
import { renderSearchPage, mountSearchPage } from "./views/search.view.js";
import { renderLoansPage, mountLoansPage } from "./views/loans.view.js";
import { renderProfilePage, mountProfilePage } from "./views/profile.view.js";
import { renderAdminPage, mountAdminPage } from "./views/admin.view.js";
import { initBookModal, openBookModal } from "./components/bookModal.js";
import { initAuthModal } from "./components/authModal.js";

const $ = (sel) => document.querySelector(sel);

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

let isLoggedIn = false;
let isAdmin = false;
let sessionReady = false;
let currentUser = null; // utente corrente letto da /api/users/me
let routeRenderToken = 0;

const VIEW_MODE_COOKIE = "pw14_view_mode";

function getCookie(name) {
  const pairs = document.cookie ? document.cookie.split("; ") : [];
  for (const part of pairs) {
    const idx = part.indexOf("=");
    const key = idx >= 0 ? decodeURIComponent(part.slice(0, idx)) : decodeURIComponent(part);
    if (key !== name) continue;
    const value = idx >= 0 ? part.slice(idx + 1) : "";
    return decodeURIComponent(value);
  }
  return null;
}

function setCookie(name, value, days = 365) {
  const maxAge = Math.max(1, Math.floor(days * 24 * 60 * 60));
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; max-age=${maxAge}; path=/; samesite=lax`;
}

let viewMode = getCookie(VIEW_MODE_COOKIE) === "grid" ? "grid" : "list"; // list | grid

function setViewMode(mode) {
  const next = mode === "grid" ? "grid" : "list";
  viewMode = next;
  setCookie(VIEW_MODE_COOKIE, next, 365);
}

function setupDrawer() {
  const btnMenu = $("#btnMenu");
  const drawer = $("#drawer");

  btnMenu?.addEventListener("click", () => {
    drawer.classList.toggle("hidden");
  });

  // Chiudo il drawer con click esterno.
  document.addEventListener("click", (e) => {
    const isMenuButton = e.target.closest("#btnMenu");
    const isInsideDrawer = e.target.closest("#drawer");
    if (!isMenuButton && !isInsideDrawer) drawer.classList.add("hidden");
  });
}

async function renderPage(route) {
  const renderToken = ++routeRenderToken;
  const app = $("#app");
  const setPage = async (renderFn, mountFn, ...args) => {
    const html = await renderFn(...args);
    if (renderToken !== routeRenderToken) return;
    app.innerHTML = html;
    if (renderToken !== routeRenderToken) return;
    mountFn?.(pageContext);
  };

  const pageContext = {
    api,
    $,
    escapeHtml,
    currentUser,
    isLoggedIn,
    isAdmin,
    sessionReady,
    openBookModal,
  };

  if (route === "#/search") {
    await setPage(renderSearchPage, mountSearchPage);
    return;
  }

  // Profilo: accesso solo da utente autenticato.
  if (route === "#/profile") {
    if (!sessionReady) {
      app.innerHTML = `<h1>Il mio profilo</h1><p>Verifica sessione in corso…</p>`;
      return;
    }

    if (!isLoggedIn) {
      app.innerHTML = `<h1>Il mio profilo</h1><p>Devi effettuare il login per visualizzare il profilo.</p>`;
      return;
    }

    await setPage(renderProfilePage, mountProfilePage);
    return;
  }

  // Libreria personale: accesso solo da utente autenticato.
  if (route === "#/my-books") {
    if (!sessionReady) {
      app.innerHTML = `<h1>I miei libri</h1><p>Verifica sessione in corso…</p>`;
      return;
    }

   if (!isLoggedIn) {
      app.innerHTML = `<h1>I miei libri</h1><p>Devi effettuare il login per vedere i tuoi libri.</p>`;
      return;
    }
    await setPage(
      renderMyBooksPage,
      () => {
        mountMyBooksPage({
          ...pageContext,
          getViewMode: () => viewMode,
          setViewMode,
        });
      }
    );
    return;
  }

  // Inserimento libro: login obbligatorio; creazione estesa solo per trusted.
  if (route === "#/book-new") {
    if (!sessionReady) {
      app.innerHTML = `<h1>Inserisci libro</h1><p>Verifica sessione in corso…</p>`;
      return;
    }

    if (!isLoggedIn) {
      app.innerHTML = `<h1>Inserisci libro</h1><p>Devi effettuare il login per inserire o aggiungere libri.</p>`;
      return;
    }

    await setPage(renderNewBookPage, mountNewBookPage);
    return;
  }
  if (route === "#/loans") {
    if (!sessionReady) {
      app.innerHTML = `<h1>Prestiti</h1><p>Verifica sessione in corso…</p>`;
      return;
    }

    if (!isLoggedIn) {
      app.innerHTML = `<h1>Prestiti</h1><p>Devi effettuare il login per visualizzare i prestiti.</p>`;
      return;
    }

    await setPage(renderLoansPage, mountLoansPage);
    return;
  }
  if (route === "#/admin") {
    if (!sessionReady) {
      app.innerHTML = `<h1>Amministrazione</h1><p>Verifica sessione in corso…</p>`;
      return;
    }

    if (!isLoggedIn) {
      app.innerHTML = `<h1>Amministrazione</h1><p>Devi effettuare il login.</p>`;
      return;
    }

    if (!isAdmin) {
      app.innerHTML = `<h1>Amministrazione</h1><p>Accesso non autorizzato.</p>`;
      return;
    }

    app.innerHTML = `<h1>Amministrazione</h1><p>Caricamento pagina...</p>`;
    await setPage(renderAdminPage, mountAdminPage);
    return;
  }

  // Home di default.
  if (route === "#/home" || route === "" || !route) {
    await setPage(renderHomePage, mountHomePage);
    return;
  }

  // Fallback: rotta non riconosciuta.
  await setPage(renderHomePage, mountHomePage);
}

function setupRouter() {
  const go = () => {
    void renderPage(location.hash || "#/home");
  };
  window.addEventListener("hashchange", go);
  go();
  window.__routerReady = true;
}


function setupLogoutUi() {
  // Listener logout: aggiorna stato locale e UI.
  $("#btnLogout")?.addEventListener("click", async () => {
    try {
      await api.auth.logout();
    } catch (err) {
      console.warn("Logout failed:", err);
    }
    currentUser = null;
    isLoggedIn = false;
    isAdmin = false;
    sessionReady = true;
    renderDrawerVisibility();
    location.hash = "#/home";
  });
}

// Aggiorna lo stato sessione lato client dopo login/logout/refresh.
async function refreshSessionFromApi() {
  try {
    const user = await api.users.me();
    currentUser = user;
    isLoggedIn = !!(user && user.id != null);

    // Flag admin reale dal backend.
    isAdmin = user?.is_admin === true;
  } catch (err) {
    // 401 guest: stato previsto, non lo tratto come errore applicativo.
    const msg = String(err?.message || "");
    const isGuest = msg.includes("Not authenticated") || msg.includes("401");
    if (!isGuest) {
      console.warn("/api/users/me failed:", err);
    }
    currentUser = null;
    isLoggedIn = false;
    isAdmin = false;
  }

  renderDrawerVisibility();
  sessionReady = true;
}

function renderDrawerVisibility() {
  // Evito flash UI su link autenticati.
  document.querySelectorAll(".nav__auth").forEach((el) => {
    if (isLoggedIn) el.classList.remove("hidden");
    else el.classList.add("hidden");
  });

  // Visibilità voce admin.
  const showAdmin = isLoggedIn && isAdmin;

  document.querySelectorAll(".nav__admin").forEach((el) => {
    if (showAdmin) el.classList.remove("hidden");
    else el.classList.add("hidden");
  });

  // Fallback su href se manca la classe nav__admin.
  const adminLink = document.querySelector('a[href="#/admin"]');
  if (adminLink) {
    if (showAdmin) adminLink.classList.remove("hidden");
    else adminLink.classList.add("hidden");
  }

  if (showAdmin && !document.querySelector(".nav__admin") && !document.querySelector('a[href="#/admin"]')) {
    console.warn("Admin link not found in DOM: add <a href=\"#/admin\">... in index.html");
  }

  // Pulsanti auth in topbar.
  $("#btnLogin")?.classList.toggle("hidden", isLoggedIn);
  $("#btnRegister")?.classList.toggle("hidden", isLoggedIn);
  $("#btnLogout")?.classList.toggle("hidden", !isLoggedIn);
}


async function main() {
  renderDrawerVisibility();
  $("#bookModal")?.setAttribute("inert", "");
  initBookModal({
    api,
    escapeHtml,
    getCurrentUser: () => currentUser,
  });
  setupDrawer();
  setupLogoutUi();
  initAuthModal({
    api,
    $,
    onSessionChanged: async () => {
      await refreshSessionFromApi();
      // Dopo login/logout via modale la route non cambia: rifaccio il render.
      if (window.__routerReady) {
        void renderPage(location.hash || "#/home");
      }
    },
    onAfterRegister: () => {
      // Dopo registrazione apro il profilo.
      location.hash = "#/profile";
    },
  });
  await refreshSessionFromApi();
  setupRouter();
}

main();
