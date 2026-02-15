// Mock legacy: usato solo nelle prime fasi, mantenuto minimale.
const ok = async (data = {}) => ({ ok: true, ...data });
const list = async () => [];

export const auth = { register: () => ok(), login: () => ok(), logout: () => ok() };

export const users = {
  me: async () => ({ id: 1, username: "demo", is_trusted: false, is_admin: false, exchange_contact_preference: "email" }),
  updateMe: () => ok(),
  deleteMe: () => ok(),
  getLocation: async () => ({ consent: false, has_location: false }),
  setLocation: () => ok(),
  deleteLocation: () => ok(),
  myBooks: async () => ({ books: [] }),
  addBookToMe: () => ok(),
  setMyBookAvailability: () => ok(),
  deleteMyBook: () => ok(),
};

export const admin = {
  listUsers: list,
  getTrusted: list,
  listAdmins: list,
  getUserOverview: async ({ user_id } = {}) => ({
    ok: true,
    user: { id: Number(user_id) || 1, username: "demo", email: "demo@example.local", full_name: null, is_trusted: false, is_admin: false, deleted_at: null, created_at: null, updated_at: null },
    stats: { books_owned_total: 0, loans_out_total: 0, loans_out_by_status: { pending: 0, accepted: 0, rejected: 0, returned: 0, cancelled: 0 }, loans_in_total: 0, loans_in_by_status: { pending: 0, accepted: 0, rejected: 0, returned: 0, cancelled: 0 } },
  }),
  setUserStatus: async ({ user_id, is_deleted } = {}) => ({ ok: true, user: { id: Number(user_id) || 1, username: "demo", deleted_at: is_deleted ? new Date().toISOString() : null } }),
  updateUsername: async ({ user_id, username } = {}) => ({ ok: true, user: { id: Number(user_id) || 1, username: String(username || "demo").trim() || "demo", deleted_at: null } }),
  setTrusted: async ({ id, is_trusted } = {}) => ({ id, is_trusted: !!is_trusted }),
  setAdmin: async ({ user_id, is_admin } = {}) => ({ id: user_id, is_admin: !!is_admin }),
  mapDistribution: async () => ({ summary: { users_with_location: 0, points_total: 0 }, points: [] }),
};

export const books = {
  list: async () => ({ books: [] }),
  listAdmin: async () => ({ books: [] }),
  search: async () => ({ results: [], limit: 50, offset: 0, radius_km_applied: 15 }),
  getByIsbn: async () => ({ book: null }),
  incrementView: () => ok(),
  create: () => ok(),
  uploadCover: () => ok(),
  update: () => ok(),
  softDelete: () => ok(),
  restore: () => ok(),
  bulkCreate: () => ok(),
};

export const authors = { list, search: list };
export const publishers = { search: list };
export const genres = { list };

export const loans = {
  ask: () => ok({ loan: { id: 1, status: "pending" } }),
  inbox: list,
  outbox: list,
  accept: () => ok(),
  reject: () => ok(),
  returnLoan: () => ok(),
  cancel: () => ok(),
};
