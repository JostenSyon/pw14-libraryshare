import { pool } from "../config/db.js";

export async function getAllGenres(req, res) {
  const r = await pool.query("SELECT id, name FROM genres ORDER BY name");
  res.json(r.rows);
}

export async function searchGenres(req, res) {
  const q = (req.query.q || "").trim();
  if (!q) return res.json([]);

  const r = await pool.query(
    "SELECT id, name FROM genres WHERE name ILIKE $1 ORDER BY name",
    [`%${q}%`]
  );
  res.json(r.rows);
}