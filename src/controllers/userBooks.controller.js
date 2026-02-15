import { pool } from "../config/db.js";

export async function getMyBooks(req, res) {
  console.log("User ID:", req.session.userId, "ha richiesto i suoi libri");

  const who = await pool.query("SELECT current_user, current_database()");
  console.log(who.rows[0]);

  try {
    const r = await pool.query(
      `SELECT b.isbn, b.title, ub.is_available, ub.created_at, ub.updated_at, b.cover_url
       FROM user_books ub
       JOIN books b ON b.isbn = ub.book_isbn
       WHERE ub.user_id = $1 AND ub.deleted_at IS NULL
       ORDER BY b.title`,
      [req.session.userId]
    );
    res.json(r.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Errore server" });
  }
}

export async function addMyBook(req, res) {
  const { isbn } = req.body;
  if (!isbn) return res.status(400).json({ error: "isbn mancante" });

  try {
    await pool.query(
      `INSERT INTO user_books (user_id, book_isbn)
       VALUES ($1, $2)
       ON CONFLICT (user_id, book_isbn)
       DO UPDATE SET deleted_at = NULL, updated_at = NOW()`,
      [req.session.userId, String(isbn).trim()]
    );

    res.status(201).json({ ok: true, isbn: String(isbn).trim() });
  } catch (e) {
    // FK books/isbn non esiste
    if (e.code === "23503") {
      return res.status(400).json({ error: "ISBN non presente nel catalogo" });
    }
    console.error(e);
    res.status(500).json({ error: "Errore server" });
  }
}

export async function setMyBookAvailability(req, res) {
  const { isbn } = req.params;
  const { is_available } = req.body;

  if (typeof is_available !== "boolean") {
    return res.status(400).json({ error: "is_available deve essere boolean" });
  }

  try {
    const r = await pool.query(
      `UPDATE user_books
       SET is_available = $3, updated_at = NOW()
       WHERE user_id = $1 AND book_isbn = $2 AND deleted_at IS NULL
       RETURNING user_id`,
      [req.session.userId, String(isbn).trim(), is_available]
    );

    if (r.rowCount === 0) {
      return res.status(404).json({ error: "Libro non trovato nella tua libreria" });
    }

    res.json({ ok: true, isbn: String(isbn).trim(), is_available });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Errore server" });
  }
}

export async function removeMyBook(req, res) {
  const { isbn } = req.params;

  try {
    const r = await pool.query(
      `UPDATE user_books
       SET deleted_at = NOW(), updated_at = NOW()
       WHERE user_id = $1 AND book_isbn = $2 AND deleted_at IS NULL
       RETURNING user_id`,
      [req.session.userId, String(isbn).trim()]
    );

    if (r.rowCount === 0) {
      return res.status(404).json({ error: "Libro non trovato nella tua libreria" });
    }

    res.json({ ok: true, isbn: String(isbn).trim() });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Errore server" });
  }
}