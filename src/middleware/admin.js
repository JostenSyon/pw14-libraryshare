import { pool } from "../config/db.js";

export async function requireAdmin(req, res, next) {
  // bypass controllo permessi SOLO in sviluppo
  if (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "debug") {
    req.isAdmin = true;
    return next();
  }

  // 1) per test/CLI: token header
  const token = req.header("X-ADMIN-TOKEN");
  if (process.env.ADMIN_TOKEN && token === process.env.ADMIN_TOKEN) {
    req.isAdmin = true;
    return next();
  }

  // 2) admin reale: utente loggato con sessione + flag is_admin nel DB
  const userId = req.session?.userId;
  if (!userId) {
    return res.status(403).json({ error: "Forbidden" });
  }

  try {
    const r = await pool.query(
      `SELECT is_admin
       FROM users
       WHERE id = $1 AND deleted_at IS NULL`,
      [userId]
    );

    if (r.rowCount === 0 || r.rows[0].is_admin !== true) {
      return res.status(403).json({ error: "Forbidden" });
    }

    req.isAdmin = true;
    return next();
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Errore server" });
  }
}