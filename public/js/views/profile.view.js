// public/js/views/profile.view.js
// Struttura: una funzione rende l'HTML, l'altra gestisce logica e dati
import { loadViewHtml } from "./viewLoader.js";

export async function renderProfilePage() {
  return loadViewHtml("/views/profile.html");
}

export function mountProfilePage(ctx) {
  const { api, $, currentUser } = ctx;

  const u = currentUser || {};

  const elUsername = $("#profileUsername");
  const elEmail = $("#profileEmail");
  const elFullName = $("#profileFullName");
  const elPhone = $("#profilePhone");
  const elPrefEmail = $("#prefEmail");
  const elPrefPhone = $("#prefPhone");
  const elLocProfileStandard = $("#locProfileStandard");
  const elLocProfilePrivate = $("#locProfilePrivate");
  const btnUpdateLocationProfile = $("#btnUpdateLocationProfile");
  const btnDeleteLocation = $("#btnDeleteLocation");
  const elLocationMsg = $("#profileLocationMsg");
  const form = $("#profileForm");
  const msg = $("#profileMsg");

  const showMsg = (text) => {
    if (!msg) return;
    msg.textContent = text || "";
    if (!text) msg.classList.add("hidden");
    else msg.classList.remove("hidden");
  };

  const showLocationMsg = (text, isError = false) => {
    if (!elLocationMsg) return;
    elLocationMsg.textContent = text || "";
    elLocationMsg.style.color = isError ? "#8a1f1f" : "#555";
  };

  // Popola i campi via DOM (niente interpolazione HTML)
  if (elUsername) elUsername.value = u.username || "";
  if (elEmail) elEmail.value = u.email || "";
  if (elFullName) elFullName.value = u.full_name || u.fullName || "";
  if (elPhone) elPhone.value = u.phone || "";

  const pref = (u.exchange_contact_preference || "email") === "phone" ? "phone" : "email";
  if (elPrefEmail) elPrefEmail.checked = pref === "email";
  if (elPrefPhone) elPrefPhone.checked = pref === "phone";

  const selectedLocationProfile = () =>
    form.querySelector('input[name="locationPrivacyProfile"]:checked')?.value || "standard";

  const applyLocationProfile = (profile) => {
    const p = profile === "private" ? "private" : "standard";
    if (elLocProfileStandard) elLocProfileStandard.checked = p === "standard";
    if (elLocProfilePrivate) elLocProfilePrivate.checked = p === "private";
  };

  const fmtDate = (iso) => {
    if (!iso) return null;
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  };

  const loadLocationStatus = async () => {
    if (!api?.users?.getLocation) return;
    try {
      const loc = await api.users.getLocation();
      const profile = loc?.privacy_profile_applied || "standard";
      applyLocationProfile(profile);

      if (!loc?.has_location) {
        showLocationMsg("Posizione non impostata.");
        return;
      }

      const precision = loc?.applied_precision_km ? `${loc.applied_precision_km} km` : "n/d";
      const updated = fmtDate(loc?.updated_at);
      const next = fmtDate(loc?.next_update_after);
      showLocationMsg(
        `Posizione attiva • Profilo: ${profile} • Precisione: ${precision}` +
        `${updated ? ` • Aggiornata: ${updated}` : ""}` +
        `${next ? ` • Prossimo aggiornamento: ${next}` : ""}`
      );
    } catch (err) {
      showLocationMsg(err?.message || "Impossibile leggere lo stato posizione.", true);
      applyLocationProfile("standard");
    }
  };

  btnUpdateLocationProfile?.addEventListener("click", () => {
    if (!navigator.geolocation) {
      showLocationMsg("Geolocalizzazione non supportata dal browser.", true);
      return;
    }

    const privacy_profile = selectedLocationProfile();
    showLocationMsg("Rilevo posizione...");

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          showLocationMsg("Salvo posizione...");
          await api.users.setLocation({
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            privacy_profile,
          });
          showLocationMsg("Posizione aggiornata.");
          await loadLocationStatus();
        } catch (err) {
          showLocationMsg(err?.message || "Errore nel salvataggio posizione.", true);
        }
      },
      () => showLocationMsg("Permesso negato o errore nel recupero posizione.", true),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
  });

  btnDeleteLocation?.addEventListener("click", async () => {
    if (!api?.users?.deleteLocation) {
      showLocationMsg("Funzione non disponibile.", true);
      return;
    }

    const ok = window.confirm("Vuoi davvero rimuovere la posizione salvata?");
    if (!ok) return;

    try {
      showLocationMsg("Rimozione posizione...");
      await api.users.deleteLocation();
      showLocationMsg("Posizione rimossa.");
      await loadLocationStatus();
    } catch (err) {
      showLocationMsg(err?.message || "Errore nella rimozione posizione.", true);
    }
  });

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    showMsg("");

    const phoneVal = elPhone?.value?.trim() || null;
    const prefVal = form.querySelector('input[name="exchangePref"]:checked')?.value || "email";

    if (prefVal === "phone" && !phoneVal) {
      showMsg("Per usare il telefono come contatto, inserisci prima un numero.");
      return;
    }

    try {
      if (!api?.users?.updateMe) throw new Error("API users.updateMe non trovata");
      await api.users.updateMe({ phone: phoneVal, exchange_contact_preference: prefVal });

      // Aggiorna anche lo stato locale
      if (currentUser) {
        currentUser.phone = phoneVal;
        currentUser.exchange_contact_preference = prefVal;
      }

      showMsg("Profilo salvato.");
    } catch (err) {
      showMsg(err?.message || "Salvataggio fallito.");
    }
  });

  // Carica lo stato iniziale della posizione
  loadLocationStatus();
}
