import { pool } from "../config/db.js";

// Home: classifica libri più visualizzati.
export async function getMostViewed(req, res) {
  const requesterId = Number.isInteger(req.session?.userId) ? req.session.userId : null;
  const limitRaw = req.query?.limit;

  let limit = limitRaw !== undefined && limitRaw !== null && String(limitRaw).trim() !== ""
    ? Number(limitRaw)
    : 12;

  if (!Number.isInteger(limit) || limit <= 0) limit = 12;
  if (limit > 50) limit = 50;

  try {
    const r = await pool.query(
      `SELECT
         b.isbn,
         b.title,
         b.cover_url,
         b.genre_id,
         b.view_count,
         EXISTS (
           SELECT 1
           FROM user_books ubm
           WHERE ubm.user_id = $2
             AND ubm.book_isbn = b.isbn
             AND ubm.deleted_at IS NULL
         ) AS is_owned_by_me,
         own.owner_user_id,
         (own.owner_user_id IS NOT NULL) AS is_available
       FROM books b
       LEFT JOIN LATERAL (
         SELECT ub.user_id AS owner_user_id
         FROM user_books ub
         JOIN users u
           ON u.id = ub.user_id
          AND u.deleted_at IS NULL
         WHERE ub.book_isbn = b.isbn
           AND ub.deleted_at IS NULL
           AND ub.is_available = TRUE
           AND ($2::int IS NULL OR ub.user_id <> $2)
         ORDER BY ub.updated_at DESC, ub.user_id ASC
         LIMIT 1
       ) own ON TRUE
       WHERE b.deleted_at IS NULL
       ORDER BY view_count DESC, title ASC
       LIMIT $1`,
      [limit, requesterId]
    );

    // In alcuni casi pg ritorna numeri come stringhe: converto.
    const results = r.rows.map((row) => ({
      ...row,
      view_count: Number(row.view_count) || 0,
    }));

    return res.json({ ok: true, limit, results });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Errore server" });
  }
}

// Home: classifica libri più richiesti.
export async function getMostRequested(req, res) {
  const requesterId = Number.isInteger(req.session?.userId) ? req.session.userId : null;
  const limitRaw = req.query?.limit;

  let limit =
    limitRaw !== undefined && limitRaw !== null && String(limitRaw).trim() !== ""
      ? Number(limitRaw)
      : 12;

  if (!Number.isInteger(limit) || limit <= 0) limit = 12;
  if (limit > 50) limit = 50;

  try {
    // Conteggio richieste non cancellate. Se serve, qui posso filtrare altri stati.
    const r = await pool.query(
      `SELECT
         b.isbn,
         b.title,
         b.cover_url,
         b.genre_id,
         COUNT(*)::int AS requests_count,
         EXISTS (
           SELECT 1
           FROM user_books ubm
           WHERE ubm.user_id = $2
             AND ubm.book_isbn = b.isbn
             AND ubm.deleted_at IS NULL
         ) AS is_owned_by_me,
         own.owner_user_id,
         (own.owner_user_id IS NOT NULL) AS is_available
       FROM loan_requests lr
       JOIN books b
         ON b.isbn = lr.book_isbn
        AND b.deleted_at IS NULL
       LEFT JOIN LATERAL (
         SELECT ub.user_id AS owner_user_id
         FROM user_books ub
         JOIN users u
           ON u.id = ub.user_id
          AND u.deleted_at IS NULL
         WHERE ub.book_isbn = b.isbn
           AND ub.deleted_at IS NULL
           AND ub.is_available = TRUE
           AND ($2::int IS NULL OR ub.user_id <> $2)
         ORDER BY ub.updated_at DESC, ub.user_id ASC
         LIMIT 1
       ) own ON TRUE
       WHERE 1=1
         AND lr.status <> 'cancelled'
       GROUP BY b.isbn, b.title, b.cover_url, b.genre_id, own.owner_user_id
       ORDER BY requests_count DESC, b.title ASC
       LIMIT $1`,
      [limit, requesterId]
    );

    const results = r.rows.map((row) => ({
      ...row,
      requests_count: Number(row.requests_count) || 0,
    }));

    return res.json({ ok: true, limit, results });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Errore server" });
  }
}
