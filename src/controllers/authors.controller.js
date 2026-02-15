import { pool } from "../config/db.js";

export async function getAllAuthors(req, res) {
  const r = await pool.query("SELECT id, name FROM authors ORDER BY name");
  res.json(r.rows);
}

export async function searchAuthors(req, res) { 

 
  const q = String(req.query.q ?? req.query.query ?? "").trim(); // supporta sia 'q' che 'query'
  console.log("Search query:", q);

  if (!q) return res.json([]);

  const r = await pool.query(
    "SELECT id, name FROM authors WHERE name ILIKE $1 ORDER BY name",
    [`%${q}%`]
  );
  res.json(r.rows);
}