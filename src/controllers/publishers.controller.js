import { pool } from "../config/db.js";

export async function getAllPublishers(req, res) {
  const r = await pool.query("SELECT id, name FROM publishers ORDER BY name");
  res.json(r.rows);
}

export async function searchPublishers(req, res) {
  const q = (req.query.q || "").trim();
  if (!q) return res.json([]);

  const r = await pool.query(
    "SELECT id, name FROM publishers WHERE name ILIKE $1 ORDER BY name",
    [`%${q}%`] //serve per evitare SQL injection
  );
  res.json(r.rows);
}