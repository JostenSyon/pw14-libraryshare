import { loadViewHtml } from "./viewLoader.js";

let leafletAssetsPromise = null;

function ensureLeafletAssets() {
  if (window.L) return Promise.resolve(window.L);
  if (leafletAssetsPromise) return leafletAssetsPromise;

  leafletAssetsPromise = new Promise((resolve, reject) => {
    const cssId = "leaflet-css";
    if (!document.getElementById(cssId)) {
      const link = document.createElement("link");
      link.id = cssId;
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      link.integrity = "sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=";
      link.crossOrigin = "";
      document.head.appendChild(link);
    }
    const clusterCssId = "leaflet-markercluster-css";
    if (!document.getElementById(clusterCssId)) {
      const link = document.createElement("link");
      link.id = clusterCssId;
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css";
      document.head.appendChild(link);
    }
    const clusterCssDefaultId = "leaflet-markercluster-default-css";
    if (!document.getElementById(clusterCssDefaultId)) {
      const link = document.createElement("link");
      link.id = clusterCssDefaultId;
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css";
      document.head.appendChild(link);
    }

    const scriptId = "leaflet-js";
    const clusterScriptId = "leaflet-markercluster-js";
    const loadCluster = () => {
      if (window.L?.markerClusterGroup) {
        resolve(window.L);
        return;
      }
      const clusterAlready = document.getElementById(clusterScriptId);
      if (clusterAlready) {
        clusterAlready.addEventListener("load", () => resolve(window.L));
        clusterAlready.addEventListener("error", () => reject(new Error("Caricamento Leaflet MarkerCluster non riuscito")));
        return;
      }
      const clusterScript = document.createElement("script");
      clusterScript.id = clusterScriptId;
      clusterScript.src = "https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js";
      clusterScript.onload = () => resolve(window.L);
      clusterScript.onerror = () => reject(new Error("Caricamento Leaflet MarkerCluster non riuscito"));
      document.head.appendChild(clusterScript);
    };

    const already = document.getElementById(scriptId);
    if (already) {
      already.addEventListener("load", loadCluster);
      already.addEventListener("error", () => reject(new Error("Caricamento Leaflet non riuscito")));
      if (window.L) loadCluster();
      return;
    }

    const script = document.createElement("script");
    script.id = scriptId;
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.integrity = "sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=";
    script.crossOrigin = "";
    script.onload = loadCluster;
    script.onerror = () => reject(new Error("Caricamento Leaflet non riuscito"));
    document.head.appendChild(script);
  });

  return leafletAssetsPromise;
}

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatStatusMap(statusMap) {
  const base = {
    pending: 0,
    accepted: 0,
    rejected: 0,
    returned: 0,
    cancelled: 0,
  };
  const src = statusMap && typeof statusMap === "object" ? statusMap : {};
  for (const key of Object.keys(base)) {
    base[key] = num(src[key]);
  }
  return base;
}

function renderStatusSummary(statusMap) {
  const m = formatStatusMap(statusMap);
  return `pending: ${m.pending} • accepted: ${m.accepted} • rejected: ${m.rejected} • returned: ${m.returned} • cancelled: ${m.cancelled}`;
}

function renderLoanStatusBars(statusMap) {
  // Grafico a barre per gli stati dei prestiti: più immediato che leggere una tabella di numeri, soprattutto quando i dati crescono.
  const m = formatStatusMap(statusMap);
  const rows = [
    { key: "pending", label: "Pending", value: m.pending },
    { key: "accepted", label: "Accepted", value: m.accepted },
    { key: "rejected", label: "Rejected", value: m.rejected },
    { key: "returned", label: "Returned", value: m.returned },
    { key: "cancelled", label: "Cancelled", value: m.cancelled },
  ];
  const max = Math.max(1, ...rows.map((r) => r.value));

  return `
    <div class="admin-chart-bars">
      ${rows.map((r) => `
        <div class="admin-chart-bars__row">
          <div class="admin-chart-bars__label">${escapeHtml(r.label)}</div>
          <div class="admin-chart-bars__track">
            <div class="admin-chart-bars__fill admin-chart-bars__fill--${r.key}" style="width:${Math.max(4, Math.round((r.value / max) * 100))}%"></div>
          </div>
          <div class="admin-chart-bars__value">${num(r.value)}</div>
        </div>
      `).join("")}
    </div>
  `;
}

function renderAvailabilityDonut(available, unavailable) {
  // Grafico ad anello per disponibili e non disponibili: un colpo d'occhio sullo "stato" del catalogo.
  const a = Math.max(0, num(available));
  const u = Math.max(0, num(unavailable));
  const total = Math.max(1, a + u);
  // Percentuale disponibili sul totale (disponibili + non disponibili).
  const pct = Math.round((a / total) * 100);

  return `
    <div class="admin-chart-donut-wrap">
      <svg viewBox="0 0 120 120" class="admin-chart-donut" aria-hidden="true">
        <circle cx="60" cy="60" r="48" fill="none" stroke="#f0f2f6" stroke-width="18"></circle>
        <circle
          cx="60"
          cy="60"
          r="48"
          fill="none"
          stroke="#2f9e44"
          stroke-width="18"
          stroke-linecap="round"
          stroke-dasharray="${Math.round((a / total) * 302)} 302"
          transform="rotate(-90 60 60)"
        ></circle>
        <circle cx="60" cy="60" r="30" fill="#fff"></circle>
        <text x="60" y="64" text-anchor="middle" font-size="16" font-weight="700" fill="#1f2937">${pct}%</text>
      </svg>
      <div class="admin-chart-donut__legend">
        <div><span class="admin-chart-dot admin-chart-dot--ok"></span> Disponibili: <strong>${a}</strong></div>
        <div><span class="admin-chart-dot admin-chart-dot--no"></span> Non disponibili: <strong>${u}</strong></div>
      </div>
    </div>
  `;
}

export async function renderAdminPage() {
  try {
    return await loadViewHtml("/views/admin.html");
  } catch (err) {
    console.warn("Admin view load failed:", err);
    return `<h1>Amministrazione</h1><p>Errore nel caricamento della vista admin.</p>`;
  }
}

export async function mountAdminPage(ctx) {
  const { api, openBookModal } = ctx || {};

  const statsEl = document.getElementById("admin-stats");
  const emptyEl = document.getElementById("admin-stats-empty");
  const listsWrap = document.getElementById("admin-stats-lists");
  const chartsWrap = document.getElementById("admin-stats-charts");
  const topViewedEl = document.getElementById("admin-top-viewed");
  const mostRequestedEl = document.getElementById("admin-most-requested");
  const chartLoansEl = document.getElementById("admin-chart-loans");
  const chartAvailabilityEl = document.getElementById("admin-chart-availability");

  const mapEl = document.getElementById("admin-map");
  const mapEmptyEl = document.getElementById("admin-map-empty");
  const mapMetaEl = document.getElementById("admin-map-meta");

  const maintenanceTypeEl = document.getElementById("admin-maintenance-type");
  const maintenanceRefreshBtn = document.getElementById("admin-maintenance-refresh");
  const maintenanceStatusEl = document.getElementById("admin-maintenance-status");
  const maintenanceListEl = document.getElementById("admin-maintenance-list");

  const userForm = document.getElementById("admin-user-form");
  const userIdEl = document.getElementById("admin-user-id");
  const userQueryEl = document.getElementById("admin-user-query");
  const userSortEl = document.getElementById("admin-user-sort");
  const userTrustedFlagEl = document.getElementById("admin-user-trusted-flag");
  const userAdminFlagEl = document.getElementById("admin-user-admin-flag");
  const userCurrentEl = document.getElementById("admin-user-current");
  const userMsgEl = document.getElementById("admin-user-msg");

  const userOverviewEl = document.getElementById("admin-user-overview");
  const userEditUsernameBtn = document.getElementById("admin-user-edit-username");
  const userStatsEl = document.getElementById("admin-user-stats");
  const userToggleStatusBtn = document.getElementById("admin-user-toggle-status");
  const userStatusMsgEl = document.getElementById("admin-user-status-msg");

  if (!statsEl || !userIdEl) return;

  let users = [];
  let trustedSet = new Set();
  let adminSet = new Set();
  let currentUserId = null;
  let currentUserDeleted = null;
  let userFilterQuery = "";
  let userSortMode = userSortEl?.value || "name";

  const setMsg = (el, text, isError = false) => {
    if (!el) return;
    el.textContent = text || "";
    el.style.color = isError ? "#b00020" : "#666";
  };
  const formatGenre = (name) => {
    const key = String(name || "").trim().toLowerCase();
    if (key === "non categorizzato") return "Da classificare";
    return String(name || "-");
  };

  const card = (title, value, sub) => `
    <div style="min-width:180px; border:1px solid #eee; border-radius:10px; padding:12px;">
      <div style="font-size:12px; color:#666;">${title}</div>
      <div style="margin-top:6px; font-size:22px; font-weight:700;">${value}</div>
      ${sub ? `<div style="margin-top:6px; color:#666; font-size:12px;">${sub}</div>` : ""}
    </div>
  `;

  const row = (label, value, sub) => `
    <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:10px; border:1px solid #eee; border-radius:10px; padding:10px;">
      <div style="min-width:0;">
        <div style="font-weight:700; line-height:1.2;">${label}</div>
        ${sub ? `<div style="margin-top:4px; color:#666; font-size:12px;">${sub}</div>` : ""}
      </div>
      <div style="font-weight:800;">${value}</div>
    </div>
  `;

  const byUsernameThenId = (a, b) => {
    const an = String(a?.username || "").toLowerCase();
    const bn = String(b?.username || "").toLowerCase();
    if (an < bn) return -1;
    if (an > bn) return 1;
    return num(a?.id) - num(b?.id);
  };

  const byIdAsc = (a, b) => num(a?.id) - num(b?.id);
  const byIdDesc = (a, b) => num(b?.id) - num(a?.id);

  const sortUsers = (list) => {
    if (userSortMode === "id_asc") return list.sort(byIdAsc);
    if (userSortMode === "id_desc") return list.sort(byIdDesc);
    return list.sort(byUsernameThenId);
  };

  const filterUsers = (list) => {
    const q = String(userFilterQuery || "").trim().toLowerCase();
    if (!q) return list;
    return list.filter((u) => {
      const username = String(u?.username || "").toLowerCase();
      const email = String(u?.email || "").toLowerCase();
      return username.includes(q) || email.includes(q);
    });
  };

  const userLabel = (u) => {
    const id = num(u?.id);
    const name = u?.username || u?.email || `utente-${id}`;
    const tags = [];
    if (u?.deleted_at) tags.push("bannato");
    if (trustedSet.has(id)) tags.push("trusted");
    if (adminSet.has(id)) tags.push("admin");
    const suffix = tags.length ? ` [${tags.join(", ")}]` : "";
    return `${name} (id: ${id})${suffix}`;
  };

  const setControlsDisabled = (disabled) => {
    userIdEl.disabled = disabled;
    if (userQueryEl) userQueryEl.disabled = disabled;
    if (userSortEl) userSortEl.disabled = disabled;
    userTrustedFlagEl.disabled = disabled;
    userAdminFlagEl.disabled = disabled;
    if (userToggleStatusBtn) userToggleStatusBtn.disabled = true;
    if (userEditUsernameBtn) userEditUsernameBtn.disabled = true;
  };

  const populateUsersSelect = (selectedId) => {
    const filtered = sortUsers(filterUsers(users.slice()));
    const selectedUser = users.find((u) => num(u.id) === num(selectedId));
    const list = selectedUser && !filtered.some((u) => num(u.id) === num(selectedId))
      ? [selectedUser, ...filtered]
      : filtered;
    const options = [`<option value="" disabled selected>Seleziona utente...</option>`];
    for (const u of list) {
      const id = num(u.id);
      const selected = selectedId != null && num(selectedId) === id ? " selected" : "";
      options.push(`<option value="${id}"${selected}>${userLabel(u)}</option>`);
    }
    userIdEl.innerHTML = options.join("");
  };

  const syncPermissionFlags = () => {
    const id = num(userIdEl.value);
    if (!id) {
      userTrustedFlagEl.checked = false;
      userAdminFlagEl.checked = false;
      userCurrentEl.textContent = "";
      return;
    }

    userTrustedFlagEl.checked = trustedSet.has(id);
    userAdminFlagEl.checked = adminSet.has(id);
    userCurrentEl.textContent = `Stato attuale: trusted=${trustedSet.has(id) ? "si" : "no"} • admin=${adminSet.has(id) ? "si" : "no"}`;
  };

  const renderUserOverview = (payload) => {
    if (!userOverviewEl || !userStatsEl || !userToggleStatusBtn) return;

    const user = payload?.user || {};
    const stats = payload?.stats || {};

    currentUserDeleted = !!user.deleted_at;

    const statusText = currentUserDeleted ? "Utente bannato (soft delete)" : "Utente attivo";

    userOverviewEl.innerHTML = `
      <div><strong>${user.username || "-"}</strong> (id: ${num(user.id) || "-"})</div>
      <div>Email: ${user.email || "-"}</div>
      <div>Nome: ${user.full_name || "-"}</div>
      <div>Stato: ${statusText}</div>
      <div>Creato: ${user.created_at ? new Date(user.created_at).toLocaleString() : "-"}</div>
    `;

    userStatsEl.innerHTML = [
      row("Libri posseduti", String(num(stats.books_owned_total))),
      row("Scambi inviati", String(num(stats.loans_out_total)), renderStatusSummary(stats.loans_out_by_status)),
      row("Scambi ricevuti", String(num(stats.loans_in_total)), renderStatusSummary(stats.loans_in_by_status)),
    ].join("");

    userToggleStatusBtn.disabled = false;
    userToggleStatusBtn.textContent = currentUserDeleted ? "Ripristina utente" : "Elimina utente";
    if (userEditUsernameBtn) userEditUsernameBtn.disabled = false;
  };

  const loadStats = async () => {
    statsEl.innerHTML = card("Caricamento", "...");
    if (emptyEl) emptyEl.hidden = true;
    if (listsWrap) listsWrap.hidden = true;
    if (chartsWrap) chartsWrap.hidden = true;

    try {
      const res = await fetch("/api/admin/stats/overview", { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const json = await res.json();
      const ov = json?.overview || {};
      // Riuso i dati già calcolati per le statistiche admin: nessun endpoint aggiuntivo.
      const byStatus = ov.loan_requests_by_status || {};
      const statusSummary = Object.keys(byStatus).length
        ? Object.entries(byStatus).map(([k, v]) => `${k}: ${num(v)}`).join(" • ")
        : null;

      statsEl.innerHTML = [
        card("Utenti", String(num(ov.users_total))),
        card("Libri a catalogo", String(num(ov.books_catalog_total))),
        card("Copie utenti", String(num(ov.user_books_total))),
        card("Copie disponibili", String(num(ov.user_books_available))),
        card("Copie non disponibili", String(num(ov.user_books_unavailable))),
        card("Richieste prestito", String(num(ov.loan_requests_total)), statusSummary),
        card("Visualizzazioni totali", String(num(ov.views_total))),
      ].join("");

      const topViewed = Array.isArray(json?.top_viewed) ? json.top_viewed : [];
      const mostRequested = Array.isArray(json?.most_requested) ? json.most_requested : [];

      if (topViewedEl) {
        topViewedEl.innerHTML = topViewed.length
          ? topViewed.map((b) => row(String(b?.title || "(senza titolo)"), String(num(b?.view_count)), b?.isbn ? `ISBN: ${String(b.isbn)}` : null)).join("")
          : `<div class="muted">Nessun dato.</div>`;
      }

      if (mostRequestedEl) {
        mostRequestedEl.innerHTML = mostRequested.length
          ? mostRequested.map((b) => row(String(b?.title || "(senza titolo)"), String(num(b?.requests_count)), b?.isbn ? `ISBN: ${String(b.isbn)}` : null)).join("")
          : `<div class="muted">Nessun dato.</div>`;
      }

      if (chartLoansEl) {
        chartLoansEl.innerHTML = renderLoanStatusBars(ov.loan_requests_by_status || {});
      }
      if (chartAvailabilityEl) {
        chartAvailabilityEl.innerHTML = renderAvailabilityDonut(
          num(ov.user_books_available),
          num(ov.user_books_unavailable)
        );
      }

      if (listsWrap) listsWrap.hidden = false;
      if (chartsWrap) chartsWrap.hidden = false;
    } catch (err) {
      console.warn("Admin stats load failed:", err);
      statsEl.innerHTML = "";
      if (emptyEl) emptyEl.hidden = false;
      if (chartsWrap) chartsWrap.hidden = true;
    }
  };

  const loadMapDistribution = async () => {
    if (!mapEl) return;
    if (mapEmptyEl) mapEmptyEl.hidden = true;
    if (mapMetaEl) mapMetaEl.textContent = "Caricamento mappa...";

    try {
      const data = api?.admin?.mapDistribution
        ? await api.admin.mapDistribution()
        : await fetch("/api/admin/stats/map-distribution", { credentials: "include" }).then((r) => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.json();
          });

      const points = Array.isArray(data?.points) ? data.points : [];
      const usersWithLocation = num(data?.summary?.users_with_location);

      if (!points.length) {
        if (mapMetaEl) mapMetaEl.textContent = "Nessun dato geolocalizzato disponibile.";
        if (mapEmptyEl) mapEmptyEl.hidden = false;
        mapEl.innerHTML = "";
        return;
      }

      const L = await ensureLeafletAssets();
      mapEl.innerHTML = "";

      const map = L.map(mapEl, { zoomControl: true });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
        maxZoom: 18,
      }).addTo(map);

      const cluster = L.markerClusterGroup({
        showCoverageOnHover: false,
        spiderfyOnMaxZoom: true,
        maxClusterRadius: 60,
        iconCreateFunction: (cl) => {
          const childs = cl.getAllChildMarkers();
          let sumBooks = 0;
          for (const m of childs) sumBooks += num(m.options?.books_total);
          return L.divIcon({
            html: `<div style="display:flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:999px;background:#2055d6;color:#fff;border:2px solid #fff;font-weight:700;box-shadow:0 4px 12px rgba(0,0,0,.22);">${sumBooks}</div>`,
            className: "",
            iconSize: [40, 40],
          });
        },
      });

      const tooltipMarkers = [];
      const renderUserIds = (ids) => {
        const clean = Array.isArray(ids)
          ? ids.map((v) => Number(v)).filter((v) => Number.isInteger(v) && v > 0)
          : [];
        if (!clean.length) return "id: n/d";
        clean.sort((a, b) => a - b);
        const max = 12;
        const shown = clean.slice(0, max);
        const extra = clean.length - shown.length;
        return extra > 0
          ? `id: ${shown.join(", ")} +${extra}`
          : `id: ${shown.join(", ")}`;
      };

      const syncIdsTooltip = () => {
        // Gli ID sui marker compaiono solo con zoom ravvicinato: da lontano la mappa resta leggibile senza sovrapposizioni.
        const shouldShow = map.getZoom() >= 11;
        for (const marker of tooltipMarkers) {
          if (shouldShow) marker.openTooltip();
          else marker.closeTooltip();
        }
      };

      const bounds = [];
      for (const p of points) {
        const lat = Number(p.lat);
        const lon = Number(p.lon);
        const booksTotal = num(p.books_total);
        const booksAvailable = num(p.books_available);
        const usersTotal = num(p.users_total);
        const userIds = Array.isArray(p.user_ids) ? p.user_ids : [];
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

        bounds.push([lat, lon]);
        const marker = L.marker([lat, lon], {
          books_total: booksTotal,
          users_total: usersTotal,
          books_available: booksAvailable,
          user_ids: userIds,
          icon: L.divIcon({
            html: `<div style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:999px;background:#2055d6;color:#fff;border:2px solid #fff;font-size:11px;font-weight:700;">${escapeHtml(String(booksTotal))}</div>`,
            className: "",
            iconSize: [28, 28],
          }),
        });

        // Tooltip con lista ID utente (utile per debug ma da rimuovere in produzione).
        marker.bindTooltip(
          `<span style="display:inline-block;padding:2px 6px;border-radius:999px;background:#111;color:#fff;font-size:11px;">${escapeHtml(renderUserIds(userIds))}</span>`,
          { direction: "right", offset: [8, 0], permanent: true, opacity: 0.95, className: "admin-map-id-tooltip" }
        );

        marker.bindPopup(
          `<strong>Area approssimata</strong><br/>` +
          `Utenti: ${usersTotal}<br/>` +
          `Libri: ${booksTotal}<br/>` +
          `Disponibili: ${booksAvailable}<br/>` +
          `${escapeHtml(renderUserIds(userIds))}`
        );
        cluster.addLayer(marker);
        tooltipMarkers.push(marker);
      }
      map.addLayer(cluster);

      if (bounds.length) map.fitBounds(bounds, { padding: [24, 24] });
      else map.setView([41.9028, 12.4964], 6);

      map.on("zoomend", syncIdsTooltip);
      syncIdsTooltip();

      if (mapMetaEl) {
        mapMetaEl.textContent = `Utenti con posizione: ${usersWithLocation} • Punti mostrati: ${points.length}`;
      }
    } catch (err) {
      console.warn("Admin map load failed:", err);
      mapEl.innerHTML = "";
      if (mapMetaEl) mapMetaEl.textContent = "";
      if (mapEmptyEl) {
        mapEmptyEl.hidden = false;
        mapEmptyEl.textContent = "Errore nel caricamento della mappa.";
      }
    }
  };

  const renderMaintenanceItems = (items) => {
    if (!maintenanceListEl) return;
    const rows = Array.isArray(items) ? items : [];
    if (!rows.length) {
      maintenanceListEl.innerHTML = `<div class="card__meta">Nessun libro da correggere per questo filtro.</div>`;
      return;
    }

    maintenanceListEl.innerHTML = rows.map((b) => `
      <div class="card" style="padding:10px;">
        <div class="card__row">
          <div style="min-width:0;">
            <div class="card__title" style="font-size:0.95rem;">${String(b?.title || "(senza titolo)")}</div>
            <div class="card__meta">ISBN: ${String(b?.isbn || "-")} • Genere: ${formatGenre(b?.genre)}</div>
          </div>
          <button type="button" class="btn btn--ghost" data-action="open-maintenance-book" data-isbn="${String(b?.isbn || "")}">Apri</button>
        </div>
      </div>
    `).join("");
  };

  const loadMaintenance = async () => {
    if (!maintenanceTypeEl || !maintenanceListEl) return;
    const type = String(maintenanceTypeEl.value || "").trim();
    if (!type) {
      if (maintenanceStatusEl) maintenanceStatusEl.textContent = "Seleziona un filtro per caricare i libri da manutenere.";
      maintenanceListEl.innerHTML = "";
      return;
    }
    if (maintenanceStatusEl) maintenanceStatusEl.textContent = "Caricamento...";
    maintenanceListEl.innerHTML = "";

    try {
      const data = await api?.admin?.listMaintenanceBooks?.({ type, limit: 50, offset: 0 });
      renderMaintenanceItems(data?.items || []);
      if (maintenanceStatusEl) maintenanceStatusEl.textContent = `Filtro: ${type} • risultati: ${num(data?.count)}`;
    } catch (err) {
      if (maintenanceStatusEl) maintenanceStatusEl.textContent = err?.message || "Errore caricamento manutenzione";
      maintenanceListEl.innerHTML = "";
    }
  };

  const loadUserOverview = async (id) => {
    if (!api?.admin?.getUserOverview || !id) return;
    setMsg(userStatusMsgEl, "");

    try {
      const data = await api.admin.getUserOverview({ user_id: id });
      renderUserOverview(data);
    } catch (err) {
      setMsg(userStatusMsgEl, err?.message || "Errore nel caricamento dettagli utente.", true);
      if (userOverviewEl) userOverviewEl.textContent = "Impossibile caricare la scheda utente.";
      if (userStatsEl) userStatsEl.innerHTML = "";
      if (userToggleStatusBtn) userToggleStatusBtn.disabled = true;
      if (userEditUsernameBtn) userEditUsernameBtn.disabled = true;
    }
  };

  const loadUserOptions = async (preferredId) => {
    if (!api?.admin?.listUsers || !api?.admin?.getTrusted || !api?.admin?.listAdmins) {
      setControlsDisabled(true);
      setMsg(userMsgEl, "API admin non disponibile.", true);
      return;
    }

    const settled = await Promise.allSettled([
      api.admin.listUsers({ include_deleted: true }),
      api.admin.getTrusted(),
      api.admin.listAdmins(),
    ]);

    if (settled[0].status !== "fulfilled") {
      setControlsDisabled(true);
      setMsg(userMsgEl, "Impossibile caricare la lista utenti.", true);
      return;
    }

    users = (Array.isArray(settled[0].value) ? settled[0].value : []).slice().sort(byUsernameThenId);
    trustedSet = settled[1].status === "fulfilled"
      ? new Set((Array.isArray(settled[1].value) ? settled[1].value : []).map((u) => num(u.id)))
      : new Set();
    adminSet = settled[2].status === "fulfilled"
      ? new Set((Array.isArray(settled[2].value) ? settled[2].value : []).map((u) => num(u.id)))
      : new Set();

    const nextId = preferredId ?? currentUserId;
    populateUsersSelect(nextId);
    userIdEl.disabled = false;

    if (nextId && users.some((u) => num(u.id) === num(nextId))) {
      userIdEl.value = String(nextId);
      currentUserId = num(nextId);
      syncPermissionFlags();
      await loadUserOverview(currentUserId);
    } else {
      currentUserId = null;
      syncPermissionFlags();
      if (userOverviewEl) userOverviewEl.textContent = "Seleziona un utente per vedere i dettagli.";
      if (userStatsEl) userStatsEl.innerHTML = "";
      if (userToggleStatusBtn) userToggleStatusBtn.disabled = true;
      if (userEditUsernameBtn) userEditUsernameBtn.disabled = true;
    }
  };

  userQueryEl?.addEventListener("input", () => {
    userFilterQuery = userQueryEl.value || "";
    populateUsersSelect(currentUserId);
  });

  userSortEl?.addEventListener("change", () => {
    userSortMode = userSortEl.value || "name";
    populateUsersSelect(currentUserId);
  });

  userIdEl.addEventListener("change", async () => {
    currentUserId = num(userIdEl.value) || null;
    syncPermissionFlags();
    if (currentUserId) await loadUserOverview(currentUserId);
  });

  userForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = num(userIdEl.value);
    if (!id) {
      setMsg(userMsgEl, "Seleziona un utente valido.", true);
      return;
    }

    const is_trusted = !!userTrustedFlagEl.checked;
    const is_admin = !!userAdminFlagEl.checked;

    try {
      setMsg(userMsgEl, "Aggiornamento...");
      await Promise.all([
        api.admin.setTrusted({ id, is_trusted }),
        api.admin.setAdmin({ user_id: id, is_admin }),
      ]);
      setMsg(userMsgEl, "Permessi aggiornati.");
      await Promise.all([loadStats(), loadUserOptions(id)]);
    } catch (err) {
      setMsg(userMsgEl, err?.message || "Errore", true);
    }
  });

  userToggleStatusBtn?.addEventListener("click", async () => {
    const id = currentUserId;
    if (!id || !api?.admin?.setUserStatus) return;

    const toDeleted = !currentUserDeleted;
    const actionText = toDeleted ? "eliminare (soft delete)" : "ripristinare";
    const ok = window.confirm(`Confermi di ${actionText} questo utente?`);
    if (!ok) return;

    try {
      setMsg(userStatusMsgEl, "Aggiornamento...");
      await api.admin.setUserStatus({ user_id: id, is_deleted: toDeleted });
      setMsg(userStatusMsgEl, toDeleted ? "Utente eliminato." : "Utente ripristinato.");
      await Promise.all([loadStats(), loadUserOptions(id)]);
    } catch (err) {
      setMsg(userStatusMsgEl, err?.message || "Errore", true);
    }
  });

  userEditUsernameBtn?.addEventListener("click", async () => {
    const id = currentUserId;
    if (!id || !api?.admin?.updateUsername) return;

    const currentUser = users.find((u) => num(u.id) === id);
    const currentUsername = String(currentUser?.username || "");
    const nextUsername = window.prompt("Nuovo username:", currentUsername);
    if (nextUsername == null) return;

    const cleanUsername = String(nextUsername).trim();
    if (!cleanUsername) {
      setMsg(userStatusMsgEl, "Username non valido.", true);
      return;
    }

    if (cleanUsername === currentUsername) {
      setMsg(userStatusMsgEl, "Nessuna modifica da salvare.");
      return;
    }

    try {
      setMsg(userStatusMsgEl, "Aggiornamento username...");
      await api.admin.updateUsername({ user_id: id, username: cleanUsername });
      setMsg(userStatusMsgEl, "Username aggiornato.");
      await loadUserOptions(id);
    } catch (err) {
      setMsg(userStatusMsgEl, err?.message || "Errore", true);
    }
  });

  maintenanceRefreshBtn?.addEventListener("click", () => {
    void loadMaintenance();
  });

  maintenanceTypeEl?.addEventListener("change", () => {
    void loadMaintenance();
  });

  maintenanceListEl?.addEventListener("click", (e) => {
    const btn = e.target?.closest?.('[data-action=\"open-maintenance-book\"]');
    if (!btn) return;
    const isbn = String(btn.getAttribute("data-isbn") || "").trim();
    if (!isbn || !openBookModal) return;
    openBookModal({ isbn, context: "admin", adminEdit: true });
  });

  if (maintenanceStatusEl) {
    maintenanceStatusEl.textContent = "Seleziona un filtro per caricare i libri da manutenere.";
  }
  await Promise.all([loadStats(), loadMapDistribution(), loadUserOptions(null)]);
}
