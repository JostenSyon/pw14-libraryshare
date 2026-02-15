// Modali login + registrazione
// Responsabilità: UI modali + chiamate api.auth.*
// Delega ad app.js l'aggiornamento sessione via callback onSessionChanged()

let _authModalInitialized = false;

export function initAuthModal({ api, $, onSessionChanged, onAfterRegister } = {}) {
  if (_authModalInitialized) {
    console.warn("initAuthModal chiamata più volte: salto il re-bind dei listener.");
    return;
  }

  if (!api) throw new Error("initAuthModal: api mancante");
  if (typeof $ !== "function") throw new Error("initAuthModal: $ (query helper) mancante");

  const loginModal = $("#loginModal");
  const registerModal = $("#registerModal");

  const btnLogin = $("#btnLogin");
  const btnRegister = $("#btnRegister");

  const loginForm = $("#loginForm");
  const registerForm = $("#registerForm");

  const loginError = $("#loginError");
  const registerError = $("#registerError");

  if (!loginModal) console.warn("AuthModal: #loginModal non trovato nel DOM.");
  if (!registerModal) console.warn("AuthModal: #registerModal non trovato nel DOM.");
  if (!btnLogin) console.warn("AuthModal: #btnLogin non trovato nel DOM.");
  if (!btnRegister) console.warn("AuthModal: #btnRegister non trovato nel DOM.");
  if (!loginForm) console.warn("AuthModal: #loginForm non trovato nel DOM.");
  if (!registerForm) console.warn("AuthModal: #registerForm non trovato nel DOM.");

  let lastFocusEl = null;

  const setError = (el, message) => {
    if (!el) return;
    if (!message) {
      el.textContent = "";
      el.classList.add("hidden");
      return;
    }
    el.textContent = message;
    el.classList.remove("hidden");
  };

  const openModal = (modalEl, initialFocusEl, clearErrorFn) => {
    if (!modalEl) return;

    lastFocusEl = document.activeElement;

    modalEl.classList.remove("hidden");
    modalEl.removeAttribute("inert");
    modalEl.setAttribute("aria-hidden", "false");

    if (typeof clearErrorFn === "function") clearErrorFn();
    initialFocusEl?.focus?.();
  };

  const closeModal = (modalEl, fallbackFocusEl, clearErrorFn, formEl) => {
    if (!modalEl) return;

    // Sposta la selezione tastiera fuori PRIMA di impostare aria-hidden
    if (lastFocusEl && typeof lastFocusEl.focus === "function") lastFocusEl.focus();
    else fallbackFocusEl?.focus?.();
    lastFocusEl = null;

    modalEl.setAttribute("aria-hidden", "true");
    modalEl.setAttribute("inert", "");
    modalEl.classList.add("hidden");

    if (typeof clearErrorFn === "function") clearErrorFn();
    formEl?.reset?.();
  };

  const openLoginModal = () =>
    openModal(loginModal, $("#loginUsername"), () => setError(loginError, ""));

  const closeLoginModal = () =>
    closeModal(loginModal, btnLogin, () => setError(loginError, ""), loginForm);

  const openRegisterModal = () =>
    openModal(registerModal, $("#regUsername"), () => setError(registerError, ""));

  const closeRegisterModal = () =>
    closeModal(registerModal, btnRegister, () => setError(registerError, ""), registerForm);

  // Inert iniziale (evita la selezione con Tab dentro modali chiuse)
  loginModal?.setAttribute?.("inert", "");
  registerModal?.setAttribute?.("inert", "");

  // Pulsanti in alto
  btnLogin?.addEventListener("click", openLoginModal);
  btnRegister?.addEventListener("click", openRegisterModal);

  // Pulsanti chiusura
  $("#btnLoginCancel")?.addEventListener("click", closeLoginModal);
  $("#btnRegisterCancel")?.addEventListener("click", closeRegisterModal);

  // Click sullo sfondo della modale
  loginModal?.addEventListener("click", (e) => {
    if (e.target?.dataset?.close === "1") closeLoginModal();
  });
  registerModal?.addEventListener("click", (e) => {
    if (e.target?.dataset?.close === "1") closeRegisterModal();
  });

  // Chiusura con tasto ESC
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    // chiudi solo quelle aperte
    if (loginModal && !loginModal.classList.contains("hidden")) closeLoginModal();
    if (registerModal && !registerModal.classList.contains("hidden")) closeRegisterModal();
  });

  // Invio form login
  loginForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    setError(loginError, "");

    const username = $("#loginUsername")?.value?.trim();
    const password = $("#loginPassword")?.value;

    if (!username || !password) {
      setError(loginError, "Inserisci username e password.");
      return;
    }

    try {
      await api.auth.login({ username, password });
      if (typeof onSessionChanged === "function") await onSessionChanged();
      closeLoginModal();
    } catch (err) {
      setError(loginError, err?.message || "Login fallito.");
    }
  });

  // Invio form registrazione
  registerForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    setError(registerError, "");

    const username = $("#regUsername")?.value?.trim();
    const email = $("#regEmail")?.value?.trim();
    const full_name = $("#regFullName")?.value?.trim() || null;
    const password = $("#regPassword")?.value;

    if (!username || !email || !password) {
      setError(registerError, "Compila username, email e password.");
      return;
    }

    try {
      await api.auth.register({ username, email, password, full_name });
      // auto-login per creare sessione cookie
      await api.auth.login({ username, password });
      if (typeof onSessionChanged === "function") await onSessionChanged();
      closeRegisterModal();
      if (typeof onAfterRegister === "function") onAfterRegister();
    } catch (err) {
      setError(registerError, err?.message || "Registrazione fallita.");
    }
  });

  // Metodi opzionali esposti all'esterno
  _authModalInitialized = true;
  return {
    openLoginModal,
    closeLoginModal,
    openRegisterModal,
    closeRegisterModal,
  };
}
