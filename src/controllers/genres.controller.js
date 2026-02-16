import { pool } from "../config/db.js";

export async function getAllGenres(req, res) {
  res.json((await pool.query("SELECT id, name FROM genres ORDER BY name")).rows);
}

export async function searchGenres(req, res) {
  const q = (req.query.q || "").trim();
  if (!q) return res.json([]);

  res.json(
    (await pool.query("SELECT id, name FROM genres WHERE name ILIKE $1 ORDER BY name", [`%${q}%`])).rows
  );
}

export async function createGenre(req, res) {
  const name = String(req.body?.name || "").trim();
  if (!name) return res.status(400).json({ error: "Nome categoria obbligatorio" });

  try {
    const { rows } = await pool.query(
      `INSERT INTO genres (name) VALUES ($1)
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
       RETURNING id, name`,
      [name]
    );
    return res.status(201).json({ ok: true, genre: rows[0] });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Errore server" });
  }
}
