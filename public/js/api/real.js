// public/js/api/real.js

const API_BASE = "/api";

// Cookie e sessione
async function request(path, { method = "GET", body, headers = {} } = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    credentials: "include", // importante per pw14.sid
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const msg = data?.error || data?.message || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

// Upload multipart/form-data (es. copertine). Il Content-Type lo imposta il browser.
async function uploadForm(path, { method = "POST", formData, headers = {} } = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    credentials: "include",
    headers: {
      ...headers,
    },
    body: formData,
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = data?.error || data?.message || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

function withAdminToken(adminToken) {
  // Il backend supporta admin via sessione (users.is_admin). Token opzionale solo per test.
  if (!adminToken) return {};
  return { "X-ADMIN-TOKEN": adminToken };
}

/* ---------------- AUTENTICAZIONE ---------------- */
export const auth = {
  register: ({ username, email, password, full_name }) =>
    request("/auth/register", { method: "POST", body: { username, email, password, full_name } }),

  login: ({ username, password }) =>
    request("/auth/login", { method: "POST", body: { username, password } }),

  logout: () => request("/auth/logout", { method: "POST" }),
};

/* ---------------- UTENTE LOGGATO ---------------- */
export const users = {
  me: () => request("/users/me"),
  updateMe: ({ full_name, email, phone, exchange_contact_preference } = {}) =>
    request("/users/me", {
      method: "PUT",
      body: {
        ...(full_name != null ? { full_name } : {}),
        ...(email != null ? { email } : {}),
        ...(phone != null ? { phone } : {}),
        ...(exchange_contact_preference != null ? { exchange_contact_preference } : {}),
      },
    }),
  deleteMe: () => request("/users/me", { method: "DELETE" }),

  myBooks: () => request("/users/me/books"),

  addBookToMe: ({ isbn }) => request("/users/me/books", { method: "POST", body: { isbn } }),

  setMyBookAvailability: ({ isbn, is_available }) =>
    request(`/users/me/books/${encodeURIComponent(isbn)}/availability`, {
      method: "PATCH",
      body: { is_available },
    }),

  deleteMyBook: ({ isbn }) =>
    request(`/users/me/books/${encodeURIComponent(isbn)}`, { method: "DELETE" }),

  // Posizione con tutela privacy (approssimazione lato backend)
  // Rotte backend:
  // - GET  /api/users/me/location
  // - POST /api/users/me/location
  getLocation: () => request("/users/me/location"),

  setLocation: ({ lat, lon, accuracy, privacy_profile }) =>
    request("/users/me/location", {
      method: "POST",
      body: {
        lat,
        lon,
        ...(accuracy != null ? { accuracy } : {}),
        ...(privacy_profile ? { privacy_profile } : {}),
      },
    }),

  deleteLocation: () =>
    request("/users/me/location", { method: "DELETE" }),
};

/* ---------------- AMMINISTRAZIONE ---------------- */
export const admin = {
  // Admin via sessione (users.is_admin). adminToken opzionale per test.
  listUsers: ({ adminToken, include_deleted } = {}) => {
    const params = new URLSearchParams();
    if (include_deleted === true) params.set("include_deleted", "true");
    const qs = params.toString();
    return request(`/users${qs ? `?${qs}` : ""}`, { headers: withAdminToken(adminToken) });
  },

  setTrusted: ({ adminToken, id, is_trusted }) =>
    request("/users/trusted", {
      method: "PATCH",
      headers: withAdminToken(adminToken),
      body: { id, is_trusted },
    }),

  getTrusted: ({ adminToken } = {}) =>
    request("/users/trusted", { headers: withAdminToken(adminToken) }),

  // Gestione admin su database
  listAdmins: ({ adminToken } = {}) =>
    request("/users/admins", { headers: withAdminToken(adminToken) }),

  setAdmin: ({ adminToken, user_id, is_admin }) =>
    request("/users/admins", {
      method: "PATCH",
      headers: withAdminToken(adminToken),
      body: { user_id, is_admin },
    }),

  mapDistribution: ({ adminToken } = {}) =>
    request("/admin/stats/map-distribution", { headers: withAdminToken(adminToken) }),

  listMaintenanceBooks: ({ adminToken, type = "missing_description", limit = 50, offset = 0 } = {}) => {
    const params = new URLSearchParams();
    params.set("type", String(type));
    params.set("limit", String(limit));
    params.set("offset", String(offset));
    return request(`/admin/books/maintenance?${params.toString()}`, { headers: withAdminToken(adminToken) });
  },

  getUserOverview: ({ adminToken, user_id }) =>
    request(`/admin/users/${encodeURIComponent(user_id)}/overview`, { headers: withAdminToken(adminToken) }),

  setUserStatus: ({ adminToken, user_id, is_deleted }) =>
    request(`/admin/users/${encodeURIComponent(user_id)}/status`, {
      method: "PATCH",
      headers: withAdminToken(adminToken),
      body: { is_deleted },
    }),

  updateUsername: ({ adminToken, user_id, username }) =>
    request(`/admin/users/${encodeURIComponent(user_id)}/username`, {
      method: "PATCH",
      headers: withAdminToken(adminToken),
      body: { username },
    }),
};

/* ---------------- LIBRI ---------------- */
export const books = {
  list: () => request("/books"),
  listAdmin: () => request("/books/admin"),

  // Ricerca nelle vicinanze (richiede login + posizione)
  // Rotta backend: GET /api/books/search
  search: ({ radius_km, q, genre_id, availability, limit, offset } = {}) => {
    const params = new URLSearchParams();
    if (radius_km != null) params.set("radius_km", String(radius_km));
    if (q) params.set("q", q);
    if (genre_id != null) params.set("genre_id", String(genre_id));
    if (availability === "all") params.set("availability", "all");
    if (limit != null) params.set("limit", String(limit));
    if (offset != null) params.set("offset", String(offset));

    const qs = params.toString();
    return request(`/books/search${qs ? `?${qs}` : ""}`);
  },

  suggest: ({ q, limit } = {}) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (limit != null) params.set("limit", String(limit));
    const qs = params.toString();
    return request(`/books/suggest${qs ? `?${qs}` : ""}`);
  },

  getByIsbn: (isbn) => request(`/books/${encodeURIComponent(isbn)}`),
  incrementView: (isbn) =>
    request(`/books/${encodeURIComponent(isbn)}/view`, { method: "POST" }),

  lookupOpenLibraryByIsbn: (isbn) =>
    request(`/books/lookup/openlibrary/${encodeURIComponent(isbn)}`),

  importOpenLibraryByIsbn: (isbn) =>
    request(`/books/import/openlibrary/${encodeURIComponent(isbn)}`, { method: "POST" }),

  importOpenLibraryByData: (book) =>
    request(`/books/import/openlibrary`, { method: "POST", body: { book } }),

  importDescriptionFromOpenLibrary: (isbn) =>
    request(`/books/${encodeURIComponent(isbn)}/import-description/openlibrary`, { method: "POST" }),

  importCoverFromOpenLibrary: (isbn) =>
    request(`/books/${encodeURIComponent(isbn)}/import-cover/openlibrary`, { method: "POST" }),

  // NOTA: da Insomnia la creazione è POST /api/books
  create: ({ ...book }) =>
    request("/books", { method: "POST", body: book }),

  // Upload copertina (multipart). Admin via sessione; adminToken opzionale per test.
  // file: oggetto File (input type=file)
  uploadCover: ({ adminToken, isbn, file }) => {
    if (!isbn) throw new Error("isbn mancante");
    if (!file) throw new Error("file mancante");

    const fd = new FormData();
    fd.append("cover", file);

    return uploadForm(`/books/${encodeURIComponent(isbn)}/cover`, {
      method: "POST",
      headers: withAdminToken(adminToken),
      formData: fd,
    });
  },

  update: ({ isbn, ...book }) =>
    request(`/books/${encodeURIComponent(isbn)}`, {
      method: "PUT",
      body: book,
    }),

  softDelete: ({ isbn }) =>
    request(`/books/${encodeURIComponent(isbn)}`, {
      method: "DELETE",
    }),

  restore: ({ isbn }) =>
    request(`/books/${encodeURIComponent(isbn)}/restore`, {
      method: "POST"
    }),

  // Admin via sessione (users.is_admin). adminToken opzionale per test.
  bulkCreate: ({ adminToken, books }) =>
    request("/books/bulk", {
      method: "POST",
      headers: withAdminToken(adminToken),
      body: books,
    }),
};

/* -------------- LOOKUP (autori/editori/generi) -------------- */
export const authors = {
  list: () => request("/authors"),
  search: (query) => request(`/authors/search?query=${encodeURIComponent(query)}`),
};

export const publishers = {
  search: (query) => request(`/publishers/search?q=${encodeURIComponent(query)}`),
};

export const genres = {
  list: () => request("/genres"),
};

/* --------------- PRESTITI -------------- */
export const loans = {
  ask: ({ owner_user_id, book_isbn }) =>
    request("/loans", { method: "POST", body: { owner_user_id, book_isbn } }),

  inbox: () => request("/loans/inbox"),
  outbox: () => request("/loans/outbox"),

  // Azioni su una richiesta esistente (POST /api/loans/:id/<action>)
  accept: (id) => request(`/loans/${encodeURIComponent(id)}/accept`, { method: "POST" }),
  reject: (id) => request(`/loans/${encodeURIComponent(id)}/reject`, { method: "POST" }),
  returnLoan: (id) => request(`/loans/${encodeURIComponent(id)}/return`, { method: "POST" }),
  cancel: (id) => request(`/loans/${encodeURIComponent(id)}/cancel`, { method: "POST" }),
};
